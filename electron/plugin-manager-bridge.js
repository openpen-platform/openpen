/**
 * Plugin marketplace IPC bridge.
 *
 * Wraps @openpen/plugin-manager as IPC handlers so the renderer can trigger
 * catalog fetch, install, remove, and custom-source installs through the main
 * process (required by CSP and catalog URL confidentiality rules).
 *
 * All handlers return a tagged-union { ok, ... } shape so the renderer never
 * needs to catch — errors are always surfaced as { ok: false, error: string }.
 */

import { ipcMain, dialog } from 'electron'
import https from 'node:https'
import http from 'node:http'
import { PLUGIN } from './ipc-channels.js'
import {
  inspectLocalSource,
  installFromCatalog,
  installFromLocal,
  installFromGitHubRepo,
  removePlugin,
} from '@openpen/plugin-manager'
import { rescanPlugins } from './module-manifest-loader.js'
import { log } from './logger.js'

/**
 * @typedef {{ ok: true, plugins: import('@openpen/plugin-manager').CatalogEntry[] }} CatalogOk
 * @typedef {{ ok: false, error: string }} CatalogErr
 * @typedef {CatalogOk | CatalogErr} CatalogResult
 */

/**
 * Fetch plugins.json over HTTPS using node:https (no renderer fetch, no auth).
 * Returns parsed CatalogIndex.plugins array or throws.
 *
 * @param {string} url
 * @returns {Promise<import('@openpen/plugin-manager').CatalogEntry[]>}
 */
function fetchCatalogJson(url) {
  const transport = url.startsWith('http://') ? http : https
  return new Promise((resolve, reject) => {
    const req = transport.get(
      url,
      { headers: { 'User-Agent': 'openpen-marketplace', Accept: 'application/json' } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(fetchCatalogJson(res.headers.location))
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} fetching catalog`))
          return
        }
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          try {
            const index = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
            resolve(Array.isArray(index?.plugins) ? index.plugins : [])
          } catch (err) {
            reject(new Error(`Failed to parse catalog JSON: ${err.message}`))
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(new Error('Catalog fetch timed out')) })
  })
}

export function initPluginManagerBridge() {
  // ── Fetch catalog ─────────────────────────────────────────────────────────
  ipcMain.handle(PLUGIN.FETCH_CATALOG, async () => {
    try {
      const { CATALOG_URL_DEFAULT } = await import('@openpen/plugin-manager')
      const url = process.env.OPENPEN_CATALOG_URL ?? CATALOG_URL_DEFAULT
      const plugins = await fetchCatalogJson(url)
      return { ok: true, plugins }
    } catch (err) {
      log.error('[PluginBridge] fetch-catalog failed:', err?.message)
      return { ok: false, error: err?.message ?? 'Unknown error fetching catalog' }
    }
  })

  // ── Install from catalog ──────────────────────────────────────────────────
  ipcMain.handle(PLUGIN.INSTALL, async (event, { id }) => {
    try {
      const entry = await installFromCatalog(id, {
        onProgress: (p) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(PLUGIN.INSTALL_PROGRESS, p)
          }
        },
      })
      await rescanPlugins()
      return { ok: true, entry }
    } catch (err) {
      log.error(`[PluginBridge] install "${id}" failed:`, err?.message)
      return { ok: false, error: err?.message ?? `Failed to install ${id}` }
    }
  })

  // ── Remove plugin ─────────────────────────────────────────────────────────
  ipcMain.handle(PLUGIN.REMOVE, async (_event, { id }) => {
    try {
      await removePlugin(id)
      await rescanPlugins()
      return { ok: true }
    } catch (err) {
      log.error(`[PluginBridge] remove "${id}" failed:`, err?.message)
      return { ok: false, error: err?.message ?? `Failed to remove ${id}` }
    }
  })

  // ── Install from local folder ─────────────────────────────────────────────
  ipcMain.handle(PLUGIN.ADD_FROM_LOCAL, async (event, { sourcePath }) => {
    try {
      const entry = await installFromLocal(sourcePath, {
        onProgress: (p) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(PLUGIN.INSTALL_PROGRESS, p)
          }
        },
      })
      await rescanPlugins()
      return { ok: true, entry }
    } catch (err) {
      log.error(`[PluginBridge] add-from-local "${sourcePath}" failed:`, err?.message)
      return { ok: false, error: err?.message ?? `Failed to install from ${sourcePath}` }
    }
  })

  // ── Install from GitHub repo URL ──────────────────────────────────────────
  ipcMain.handle(PLUGIN.ADD_FROM_GITHUB_REPO, async (event, { repoUrl }) => {
    try {
      const entry = await installFromGitHubRepo(repoUrl, {
        onProgress: (p) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(PLUGIN.INSTALL_PROGRESS, p)
          }
        },
      })
      await rescanPlugins()
      return { ok: true, entry }
    } catch (err) {
      log.error(`[PluginBridge] add-from-github-repo "${repoUrl}" failed:`, err?.message)
      return { ok: false, error: err?.message ?? `Failed to install from ${repoUrl}` }
    }
  })

  // ── Inspect local plugin source (read-only, no file copy) ────────────────
  ipcMain.handle(PLUGIN.INSPECT_LOCAL, async (_event, { sourcePath }) => {
    try {
      const info = await inspectLocalSource(sourcePath)
      return { ok: true, info }
    } catch (err) {
      log.error(`[PluginBridge] inspect-local "${sourcePath}" failed:`, err?.message)
      return { ok: false, error: err?.message ?? `Failed to inspect ${sourcePath}` }
    }
  })

  // ── System folder picker ──────────────────────────────────────────────────
  ipcMain.handle(PLUGIN.PICK_FOLDER, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
