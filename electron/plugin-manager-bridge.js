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

import { ipcMain, dialog, BrowserWindow } from 'electron'
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
