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

import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import { handleValidated } from './ipc-validation.js'
import {
  pluginIdPayloadSchema,
  communityInstallPayloadSchema,
  pluginRepoUrlSchema,
  pluginSourcePathSchema,
} from './ipc-payload-schemas.js'
import https from 'node:https'
import http from 'node:http'
import { PLUGIN } from './ipc-channels.js'
import {
  inspectLocalSource,
  installFromCatalog,
  installFromCommunityCatalog,
  installFromLocal,
  installFromGitHubRepo,
  removePlugin,
} from '@openpen/plugin-manager'
import { rescanPlugins } from './module-manifest-loader.js'
import { getSetting } from './settings-store.js'
import { loadCommunityPlugins, checkCommunityInstallAllowed } from './community-catalog.js'
import { log } from './logger.js'
import { registerMarketplaceLinkHandlers } from './marketplace-links.js'
import { withListing, createListingImageLoader, RAW_ORIGIN } from './marketplace-listing.js'
import { listingImagePayloadSchema } from './ipc-payload-schemas.js'

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
  return fetchJson(url).then((index) => (Array.isArray(index?.plugins) ? index.plugins : []))
}

/**
 * Fetch and parse a JSON document over HTTP(S).
 *
 * @param {string} url
 * @returns {Promise<any>}
 */
function fetchJson(url) {
  const transport = url.startsWith('http://') ? http : https
  return new Promise((resolve, reject) => {
    const req = transport.get(
      url,
      { headers: { 'User-Agent': 'openpen-marketplace', Accept: 'application/json' } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          resolve(fetchJson(res.headers.location))
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
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8')))
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

/**
 * Download one listing image. Only the raw.githubusercontent.com URL that
 * marketplace-listing.js accepted reaches here. Redirects are refused and the
 * body is cut off past `maxBytes`. OPENPEN_LISTING_MEDIA_ORIGIN swaps the
 * origin for a local fixture server in e2e runs (same idea as
 * OPENPEN_CATALOG_URL); the path stays the checked one.
 *
 * @param {string} url
 * @param {number} maxBytes
 * @returns {Promise<Uint8Array>}
 */
function downloadListingImage(url, maxBytes) {
  const override = process.env.OPENPEN_LISTING_MEDIA_ORIGIN
  const target = override && url.startsWith(`${RAW_ORIGIN}/`) ? override + url.slice(RAW_ORIGIN.length) : url
  const transport = target.startsWith('http://') ? http : https
  return new Promise((resolve, reject) => {
    const req = transport.get(target, { headers: { 'User-Agent': 'openpen-marketplace' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        reject(new Error(`HTTP ${res.statusCode} fetching image`))
        return
      }
      const declared = Number(res.headers['content-length'])
      if (declared > maxBytes) {
        req.destroy(new Error('image too large'))
        return
      }
      const chunks = []
      let size = 0
      res.on('data', (c) => {
        size += c.length
        if (size > maxBytes) { req.destroy(new Error('image too large')); return }
        chunks.push(c)
      })
      res.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
      res.on('error', reject)
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(new Error('Image fetch timed out')) })
  })
}

// The entries the renderer was last given, so an image request names an entry
// and a slot and the URL always comes from main's own copy.
const officialListed = new Map()
const communityListed = new Map()
const loadListingImage = createListingImageLoader({
  lookup: (id) => officialListed.get(id) ?? communityListed.get(id),
  download: downloadListingImage,
})

function remember(map, plugins) {
  map.clear()
  for (const p of plugins) if (p && typeof p.id === 'string') map.set(p.id, p)
}

/** Failure value returned to the renderer when a marketplace payload is invalid. */
const INVALID_RESULT = { onInvalid: () => ({ ok: false, error: 'Invalid payload' }) }

/** Dependencies for the community gate: live setting value plus both catalog URLs. */
async function communityDeps() {
  const { CATALOG_URL_DEFAULT, COMMUNITY_CATALOG_URL_DEFAULT } = await import('@openpen/plugin-manager')
  return {
    isEnabled: () => getSetting('showCommunityPlugins') === true,
    fetchJson,
    officialUrl: process.env.OPENPEN_CATALOG_URL ?? CATALOG_URL_DEFAULT,
    communityUrl: process.env.OPENPEN_COMMUNITY_CATALOG_URL ?? COMMUNITY_CATALOG_URL_DEFAULT,
  }
}

export function initPluginManagerBridge() {
  // ── Fetch catalog ─────────────────────────────────────────────────────────
  ipcMain.handle(PLUGIN.FETCH_CATALOG, async () => {
    try {
      const { CATALOG_URL_DEFAULT } = await import('@openpen/plugin-manager')
      const url = process.env.OPENPEN_CATALOG_URL ?? CATALOG_URL_DEFAULT
      const plugins = (await fetchCatalogJson(url)).filter((p) => p && typeof p === 'object').map((p) => withListing(p))
      remember(officialListed, plugins)
      return { ok: true, plugins }
    } catch (err) {
      log.error('[PluginBridge] fetch-catalog failed:', err?.message)
      return { ok: false, error: err?.message ?? 'Unknown error fetching catalog' }
    }
  })

  // Fetch community catalog (only while the setting is on)
  ipcMain.handle(PLUGIN.FETCH_COMMUNITY_CATALOG, async () => {
    try {
      const result = await loadCommunityPlugins(await communityDeps())
      remember(communityListed, result.ok ? result.plugins : [])
      return result
    } catch (err) {
      remember(communityListed, [])
      log.error('[PluginBridge] fetch-community-catalog failed:', err?.message)
      return { ok: false, error: err?.message ?? 'Unknown error fetching community catalog' }
    }
  })

  // Listing image (icon or screenshot) of a listed entry, checked, as bytes
  handleValidated(ipcMain, PLUGIN.LISTING_IMAGE, listingImagePayloadSchema, async (_event, { id, slot }) => {
    const result = await loadListingImage(id, slot)
    if (!result.ok) log.warn(`[PluginBridge] listing image ${id} ${slot} refused: ${result.error}`)
    return result
  }, INVALID_RESULT)

  // Install from community catalog
  handleValidated(ipcMain, PLUGIN.INSTALL_COMMUNITY, communityInstallPayloadSchema, async (event, { id }) => {
    try {
      const deps = await communityDeps()
      const allowed = await checkCommunityInstallAllowed(deps, id)
      if (!allowed.ok) return allowed
      const entry = await installFromCommunityCatalog(id, {
        catalogUrl: deps.communityUrl,
        onProgress: (p) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send(PLUGIN.INSTALL_PROGRESS, p)
          }
        },
      })
      await rescanPlugins()
      return { ok: true, entry }
    } catch (err) {
      log.error(`[PluginBridge] install-community "${id}" failed:`, err?.message)
      return { ok: false, error: err?.message ?? `Failed to install ${id}` }
    }
  }, INVALID_RESULT)

  // ── Install from catalog ──────────────────────────────────────────────────
  handleValidated(ipcMain, PLUGIN.INSTALL, pluginIdPayloadSchema, async (event, { id }) => {
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
  }, INVALID_RESULT)

  // ── Remove plugin ─────────────────────────────────────────────────────────
  handleValidated(ipcMain, PLUGIN.REMOVE, pluginIdPayloadSchema, async (_event, { id }) => {
    try {
      await removePlugin(id)
      await rescanPlugins()
      return { ok: true }
    } catch (err) {
      log.error(`[PluginBridge] remove "${id}" failed:`, err?.message)
      return { ok: false, error: err?.message ?? `Failed to remove ${id}` }
    }
  }, INVALID_RESULT)

  // ── Install from local folder ─────────────────────────────────────────────
  handleValidated(ipcMain, PLUGIN.ADD_FROM_LOCAL, pluginSourcePathSchema, async (event, { sourcePath }) => {
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
  }, INVALID_RESULT)

  // ── Install from GitHub repo URL ──────────────────────────────────────────
  handleValidated(ipcMain, PLUGIN.ADD_FROM_GITHUB_REPO, pluginRepoUrlSchema, async (event, { repoUrl }) => {
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
  }, INVALID_RESULT)

  // ── Inspect local plugin source (read-only, no file copy) ────────────────
  handleValidated(ipcMain, PLUGIN.INSPECT_LOCAL, pluginSourcePathSchema, async (_event, { sourcePath }) => {
    try {
      const info = await inspectLocalSource(sourcePath)
      return { ok: true, info }
    } catch (err) {
      log.error(`[PluginBridge] inspect-local "${sourcePath}" failed:`, err?.message)
      return { ok: false, error: err?.message ?? `Failed to inspect ${sourcePath}` }
    }
  }, INVALID_RESULT)

  // ── System folder picker ──────────────────────────────────────────────────
  ipcMain.handle(PLUGIN.PICK_FOLDER, async (event) => {
    return openPickerWithoutOverlay(event, { properties: ['openDirectory'] })
  })

  // ── System .zip picker ────────────────────────────────────────────────────
  // macOS does not allow combining 'openDirectory' and 'openFile' in a single
  // dialog, so folders and zips use distinct channels.
  ipcMain.handle(PLUGIN.PICK_ZIP, async (event) => {
    return openPickerWithoutOverlay(event, {
      properties: ['openFile'],
      filters: [{ name: 'OpenPen plugin', extensions: ['zip'] }],
    })
  })

  // ── Add Custom dialog open / close (drop landing) ─────────────────────────
  // macOS NSWindowServer refuses to deliver OS drag sessions to a window at
  // 'screen-saver' level. The Add Custom dialog announces its open / close
  // here so the settings window can drop to 'floating' for the dialog's
  // lifetime, letting Finder drop events through. Ref-counted via the
  // shared suspendAlwaysOnTop counter so nested picker calls behave.
  ipcMain.on(PLUGIN.ENTER_LOCAL_INSTALL, (event) => {
    const sender = event.sender
    const win = BrowserWindow.fromWebContents(sender)
    if (!win) return
    suspendAlwaysOnTop(win)
    if (!senderRecoveryAttached.has(sender)) {
      senderRecoveryAttached.add(sender)
      const recover = () => forceResetAlwaysOnTop(win)
      // `did-start-loading` covers HMR reloads + manual reloads — the new
      // page mounts with `open: false` so it never sends a matching EXIT.
      sender.on('did-start-loading', recover)
      sender.on('render-process-gone', recover)
      sender.on('destroyed', recover)
    }
  })
  ipcMain.on(PLUGIN.EXIT_LOCAL_INSTALL, (event) => {
    resumeAlwaysOnTop(BrowserWindow.fromWebContents(event.sender))
  })

  // ── Report / policy links ─────────────────────────────────────────────────
  registerMarketplaceLinkHandlers({
    ipcMain,
    openExternal: (url) => shell.openExternal(url),
    getCatalog: async () => {
      const { CATALOG_URL_DEFAULT } = await import('@openpen/plugin-manager')
      return fetchCatalogJson(process.env.OPENPEN_CATALOG_URL ?? CATALOG_URL_DEFAULT)
    },
    channels: PLUGIN,
  })
}

// Tracks how many active suspenders per BrowserWindow want always-on-top
// dropped. Pickers (PICK_FOLDER / PICK_ZIP) and the Add Custom dialog
// share this counter so a picker opened from inside the dialog does not
// prematurely restore the level. WeakMap so destroyed windows GC cleanly.
const alwaysOnTopSuspendDepth = new WeakMap()

// Tracks webContents we've already wired crash / reload recovery on, so
// repeated ENTER_LOCAL_INSTALL sends from the same renderer don't pile
// up listeners.
const senderRecoveryAttached = new WeakSet()

function suspendAlwaysOnTop(win) {
  if (!win || win.isDestroyed()) return
  const wasAlwaysOnTop = win.isAlwaysOnTop()
  const depth = alwaysOnTopSuspendDepth.get(win)
  if (depth) {
    alwaysOnTopSuspendDepth.set(win, { count: depth.count + 1, wasAlwaysOnTop: depth.wasAlwaysOnTop })
    return
  }
  alwaysOnTopSuspendDepth.set(win, { count: 1, wasAlwaysOnTop })
  if (wasAlwaysOnTop) {
    // Drop to 'floating' rather than false: keeps the window visible above
    // ordinary windows so the user can still see the modal, while leaving
    // the OS free to deliver drag sessions and native pickers.
    win.setAlwaysOnTop(true, 'floating')
    // On Windows the z-order does not reflow until the window loses focus.
    if (process.platform === 'win32') win.blur()
  }
}

function resumeAlwaysOnTop(win) {
  if (!win) return
  const state = alwaysOnTopSuspendDepth.get(win)
  if (!state) return
  const nextCount = state.count - 1
  if (nextCount > 0) {
    alwaysOnTopSuspendDepth.set(win, { count: nextCount, wasAlwaysOnTop: state.wasAlwaysOnTop })
    return
  }
  alwaysOnTopSuspendDepth.delete(win)
  if (win.isDestroyed() || !state.wasAlwaysOnTop) return
  // Defer one tick so macOS compositor can settle dialog / drag tear-down
  // before lifting the window back to screen-saver level.
  setTimeout(() => {
    if (!win.isDestroyed()) {
      win.setAlwaysOnTop(true, 'screen-saver')
      win.focus()
    }
  }, 0)
}

// Crash / reload recovery: ENTER_LOCAL_INSTALL increments the depth, but
// EXIT_LOCAL_INSTALL only fires if the renderer is still alive to send it.
// A renderer crash, HMR reload, or settings-window close all skip the
// EXIT, leaving the depth counter permanently elevated and the window
// stuck at 'floating'. Reset the counter back to zero in those cases.
function forceResetAlwaysOnTop(win) {
  if (!win) return
  const state = alwaysOnTopSuspendDepth.get(win)
  if (!state) return
  alwaysOnTopSuspendDepth.delete(win)
  if (win.isDestroyed() || !state.wasAlwaysOnTop) return
  setTimeout(() => {
    if (!win.isDestroyed()) {
      win.setAlwaysOnTop(true, 'screen-saver')
    }
  }, 0)
}

/**
 * Open a native file/folder picker without it being obscured by the
 * settings window.
 *
 * The settings window runs at `setAlwaysOnTop(true, 'screen-saver')` so it
 * can float above full-screen presenter apps. On macOS, NSOpenPanel sheets
 * are pinned at NSModalPanelWindowLevel (8) while screen-saver level is
 * 101 — Apple's window-server refuses to layer a lower-level window above
 * a higher-level one, so the sheet renders behind the settings glass. The
 * same class of bug reproduces on Windows / Linux for slightly different
 * reasons. The only workable fix is to drop always-on-top for the duration
 * of the picker and restore it after the user closes the dialog.
 *
 * @param {import('electron').IpcMainInvokeEvent} event
 * @param {import('electron').OpenDialogOptions} options
 * @returns {Promise<string | null>}
 */
async function openPickerWithoutOverlay(event, options) {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed()) return null

  suspendAlwaysOnTop(win)
  try {
    const result = await dialog.showOpenDialog(win, options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  } finally {
    resumeAlwaysOnTop(win)
  }
}
