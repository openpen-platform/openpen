/**
 * Module Manifest Loader (main process side).
 *
 * Scans `~/.openpen/plugins/` for plugin module manifests, validates
 * their basic shape, and broadcasts the sanitised list to renderer
 * windows. The renderer side combines these with built-in modules
 * (imported directly via Vite) and feeds everything through
 * `module-loader` for cross-module validation and registration.
 *
 * Built-in modules don't go through this loader — they are statically
 * imported by the renderer at startup. This file is purely about
 * discovering third-party plugins on disk.
 */
import { ipcMain, app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { MODULE } from './ipc-channels.js'
import { ensurePluginInstalledAt, getPluginInstalledAt } from './plugin-meta-manager.js'
import { MODULE_ID_RE } from './plugin-id-validator.js'

/**
 * Plugin install directory.
 *
 * Prefer process.env.HOME over app.getPath('home') so that test harnesses
 * (and `openpen install` CLI) can override the home directory via the HOME
 * environment variable. On macOS, app.getPath('home') calls NSHomeDirectory()
 * which bypasses the HOME env var and always returns the real user home —
 * making it impossible to redirect plugin discovery in integration tests.
 */
const PLUGINS_DIR = path.join(
  process.env.HOME ?? app.getPath('home'),
  '.openpen',
  'plugins'
)

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   version: string,
 *   author?: string,
 *   description?: string,
 *   minAppVersion?: string,
 *   renderer?: string,
 *   main?: string,
 *   dir: string,
 * }} ModuleManifest
 */

/** @type {ModuleManifest[]} */
let manifests = []

/**
 * Main-side handlers per plugin module. Populated when a manifest's
 * `main` field points to a JS file that exports `{ handlers }`.
 * @type {Map<string, Record<string, (payload: unknown) => Promise<unknown>>>}
 */
const handlerMap = new Map()

/** Initialise: scan disk and register IPC handlers. */
export async function initModuleManifestLoader() {
  await scanPlugins()
  registerIpcHandlers()
}

/**
 * Re-scan the plugins directory and broadcast updated manifests to all
 * renderer windows. Called by plugin-manager-bridge after install/remove
 * so the UI's installed list stays in sync without restarting the app.
 */
export async function rescanPlugins() {
  manifests.length = 0
  handlerMap.clear()
  await scanPlugins()
  const { BrowserWindow } = await import('electron')
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) sendModuleManifests(win.webContents)
  })
}

async function scanPlugins() {
  if (!fs.existsSync(PLUGINS_DIR)) return

  // Two-level scan: PLUGINS_DIR/@scope/name/plugin.json
  /** @type {ModuleManifest[]} */
  const discovered = []
  const scopeEntries = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
  for (const scopeEntry of scopeEntries) {
    if (!scopeEntry.isDirectory()) continue
    // Scope dirs start with '@'
    if (!scopeEntry.name.startsWith('@')) {
      console.warn(`[ModuleManifestLoader] Skipping non-scoped directory: ${scopeEntry.name}`)
      continue
    }
    const scopeDir = path.join(PLUGINS_DIR, scopeEntry.name)
    const nameEntries = fs.readdirSync(scopeDir, { withFileTypes: true })
    for (const nameEntry of nameEntries) {
      if (!nameEntry.isDirectory()) continue
      const pluginId = `${scopeEntry.name}/${nameEntry.name}`
      if (!MODULE_ID_RE.test(pluginId)) {
        console.warn(`[ModuleManifestLoader] Invalid plugin id, skipping: ${pluginId}`)
        continue
      }
      const pluginDir = path.join(scopeDir, nameEntry.name)
      const manifestPath = path.join(pluginDir, 'plugin.json')
      if (!fs.existsSync(manifestPath)) continue

      try {
        const json = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        if (!json.id || !json.name || !json.version) {
          console.warn(`[ModuleManifestLoader] Missing required manifest fields, skipping: ${pluginDir}`)
          continue
        }
        if (json.id !== pluginId) {
          console.warn(`[ModuleManifestLoader] Manifest id "${json.id}" does not match directory path "${pluginId}", skipping`)
          continue
        }
        const manifest = { ...json, dir: pluginDir }

        if (manifest.minAppVersion) {
          const appVer = app.getVersion()
          if (compareVersions(appVer, manifest.minAppVersion) < 0) {
            console.warn(`[ModuleManifestLoader] Plugin ${json.id} requires app >= ${manifest.minAppVersion} (have ${appVer}), skipping`)
            continue
          }
        }
        discovered.push(manifest)
      } catch (err) {
        console.error(`[ModuleManifestLoader] Failed to load manifest: ${pluginDir}`, err?.message ?? err)
      }
    }
  }

  // Pass all discovered manifests to the renderer without cross-manifest id
  // deduplication. Plugin↔plugin id collisions are handled by the renderer's
  // module-validator, which surfaces them to the user via PluginConflictDialog.
  // Built-in vs plugin conflicts are also handled there (built-in reserved namespace).
  for (const manifest of discovered) {
    manifests.push(manifest)

    // Guard: ensurePluginInstalledAt and loadMainHandler may throw. If either
    // fails (e.g. the meta-manager's id regex rejects the manifest), the plugin
    // is still listed but its meta/main side-effects are skipped. Without this
    // guard, a single malformed plugin aborts the whole app startup chain.
    try {
      ensurePluginInstalledAt(manifest.id)
      if (manifest.main) {
        const mainPath = path.join(manifest.dir, manifest.main)
        if (fs.existsSync(mainPath)) {
          await loadMainHandler(manifest.id, mainPath)
        }
      }
    } catch (err) {
      console.error(
        `[ModuleManifestLoader] Failed to register plugin meta/main for ${manifest.id}:`,
        err?.message ?? err
      )
    }
  }

  if (manifests.length > 0) {
    console.log(`[ModuleManifestLoader] Loaded ${manifests.length} plugin manifest(s)`)
  }
}

async function loadMainHandler(pluginId, mainPath) {
  try {
    const mod = await import(`file://${mainPath}`)
    const pluginExport = mod.default ?? mod
    if (pluginExport?.handlers && typeof pluginExport.handlers === 'object') {
      handlerMap.set(pluginId, pluginExport.handlers)
      console.log(`[ModuleManifestLoader] Loaded main handlers: ${pluginId}`)
    }
  } catch (err) {
    console.error(`[ModuleManifestLoader] Failed to load main handlers for ${pluginId}:`, err?.message ?? err)
  }
}

/**
 * Resolve `openpen-plugin://<scope>.<name>/<file>` URLs to a real filesystem
 * path, blocking traversal escapes. Returns `{ ok: true, filePath }`
 * or `{ ok: false, status, message }`.
 *
 * The URL hostname encodes the scoped id as `scope.name` (dot-separated,
 * e.g. `openpen.freehand` for `@openpen/freehand`). This avoids the `@`
 * character which URL parsers interpret as an auth prefix in hostnames.
 *
 * @param {string} hostname  - dot-separated scope.name, e.g. `openpen.freehand`
 * @param {string} pathname  - URL pathname starting with `/`
 */
export function resolvePluginFilePath(hostname, pathname) {
  const pluginId = pluginIdFromHostname(hostname)
  if (!pluginId || !MODULE_ID_RE.test(pluginId)) {
    return { ok: false, status: 400, message: 'Invalid plugin id' }
  }
  const [, scopePart, namePart] = MODULE_ID_RE.exec(pluginId) ?? []
  const pluginBase = path.resolve(path.join(PLUGINS_DIR, `@${scopePart}`, namePart))

  let decoded = ''
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return { ok: false, status: 400, message: 'Invalid path encoding' }
  }

  const filePath = path.resolve(pluginBase, `.${decoded}`)
  if (!filePath.startsWith(pluginBase + path.sep) && filePath !== pluginBase) {
    return { ok: false, status: 403, message: 'Forbidden' }
  }
  return { ok: true, filePath }
}

/** @param {string} pluginId */
export function isValidModuleId(pluginId) {
  return typeof pluginId === 'string' && MODULE_ID_RE.test(pluginId)
}

/**
 * Convert a scoped plugin id to a URL-safe hostname segment.
 * `@openpen/freehand` → `openpen.freehand`
 * This is the inverse of scopedIdFromHostname.
 * @param {string} pluginId
 */
function hostnameFromPluginId(pluginId) {
  return pluginId.replace(/^@/, '').replace(/\//g, '.')
}

/**
 * Recover the scoped plugin id from a URL hostname.
 * `openpen.freehand` → `@openpen/freehand`
 * @param {string} hostname
 */
function pluginIdFromHostname(hostname) {
  const dotIdx = hostname.indexOf('.')
  if (dotIdx < 0) return null
  return `@${hostname.slice(0, dotIdx)}/${hostname.slice(dotIdx + 1)}`
}

/** Sanitised manifests for the renderer (no local filesystem paths). */
function getSafeManifests() {
  return manifests.map(({ id, name, version, author, description, renderer, minAppVersion }) => ({
    id,
    name,
    version,
    author,
    description,
    minAppVersion,
    // URL-encode the scoped id as a dot-separated hostname: @openpen/freehand → openpen.freehand
    rendererEntry: renderer ? `openpen-plugin://${hostnameFromPluginId(id)}/${renderer}` : null,
    installedAt: getPluginInstalledAt(id) ?? null,
  }))
}

/**
 * Broadcast manifests to a window's renderer.
 * @param {import('electron').WebContents} webContents
 */
export function sendModuleManifests(webContents) {
  if (webContents && !webContents.isDestroyed()) {
    webContents.send(MODULE.MANIFESTS, getSafeManifests())
  }
}

function registerIpcHandlers() {
  ipcMain.handle(MODULE.CALL_HANDLER, async (_, { moduleId, action, payload }) => {
    const handlers = handlerMap.get(moduleId)
    if (!handlers) {
      throw new Error(`[ModuleManifestLoader] No main handlers for module: ${moduleId}`)
    }
    const fn = handlers[action]
    if (typeof fn !== 'function') {
      throw new Error(`[ModuleManifestLoader] Handler not found: ${moduleId}.${action}`)
    }
    return fn(payload)
  })

  // Renderer-driven pull. The push-broadcast (MANIFESTS) fires too early
  // for renderer subscriptions; the pull handler is the reliable path.
  ipcMain.handle(MODULE.GET_MANIFESTS, () => getSafeManifests())
}

/** Naive semver compare: -1 / 0 / 1 like Array#sort. */
function compareVersions(a, b) {
  const pa = String(a).split(/[-+]/)[0].split('.').map(Number)
  const pb = String(b).split(/[-+]/)[0].split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const va = pa[i] || 0
    const vb = pb[i] || 0
    if (va < vb) return -1
    if (va > vb) return 1
  }
  return 0
}
