/**
 * Electron main-process entry point.
 * Pure orchestrator — wires up managers, no business logic here.
 */

import { app, BrowserWindow, ipcMain, protocol, net, session, screen } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initWindowManager, createMainWindowForDisplay, createOverlayWindowForDisplay, showMainWindow, hideMainWindow, createSettingsWindow, toggleDrawingMode, getMainWindow, getOverlayWindow, getAllMainWindows, getAllOverlayWindows, setActiveDisplayId, setDrawingModeChangedListener } from './window-manager.js';
import { initTrayManager, setTrayWarning, setTrayDrawingMode } from './tray-manager.js';
import { initShortcutManager, unregisterAllShortcuts } from './shortcut-manager.js';
import { initSettingsStore, getSetting, flushWrites } from './settings-store.js';
import { initDiagnosticsManager } from './diagnostics-manager.js';
import { initPluginMetaManager } from './plugin-meta-manager.js';
import { initI18n } from './i18n/index.js';
import { initConfigLoader } from './config-loader.js';
import { initModuleManifestLoader, sendModuleManifests, resolvePluginFilePath } from './module-manifest-loader.js';
import { APP, AUDIT, HISTORY, LOG, MODULE, POSITIONING, SYSTEM } from './ipc-channels.js';
import { initPluginManagerBridge } from './plugin-manager-bridge.js';
import { createAuditLog } from './audit-log.js';
import { initLogger, log } from './logger.js';
import { initPositioningEngine, processIntent, getState as getPositioningState } from './positioning-engine.js';
import { probeTransparentRendering } from './transparent-render-probe.js';

ipcMain.handle(APP.GET_VERSION, () => app.getVersion());

ipcMain.on(APP.RELAUNCH, () => {
  app.relaunch();
  app.exit(0);
});

// Quit is gated by a renderer-side confirm dialog. Two entry points:
//   1. Control-bar Quit button — renderer shows the dialog, then sends APP.QUIT.
//   2. Cmd+Q / Dock-quit / external app.quit() — before-quit preventDefault()s
//      and asks the renderer to show the dialog via APP.REQUEST_QUIT. Once the
//      user confirms there, the renderer sends APP.QUIT.
//
// APP.QUIT broadcasts the lifecycle event so modules can run onQuit hooks,
// then calls app.exit(0) — bypassing app.quit()'s before-quit / window-close
// dance. Going through app.quit() on macOS leaves transparent
// screen-saver-level BrowserWindows in an unclean close state that requires
// a second trigger; app.exit() short-circuits that path entirely.
let _isQuitting = false;
const LIFECYCLE_FLUSH_MS = 50;

ipcMain.on(APP.QUIT, () => {
  if (_isQuitting) return;
  _isQuitting = true;
  broadcastLifecycle('quit');
  setTimeout(async () => {
    await flushWrites();
    unregisterAllShortcuts();
    app.exit(0);
  }, LIFECYCLE_FLUSH_MS);
});

function requestQuitFromRenderer() {
  // Send only to the active main window — DialogHost is mounted there. Multiple
  // displays would otherwise stack one dialog per renderer.
  const win = getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(APP.REQUEST_QUIT);
    return true;
  }
  // No renderer to confirm with (e.g. all main windows destroyed mid-quit).
  // Fall through and let the caller decide whether to force-quit.
  return false;
}

function broadcastLifecycle(eventName) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(MODULE.LIFECYCLE_EVENT, eventName);
    }
  }
}

// Register the openpen-plugin:// scheme before app-ready so renderers can
// dynamically import plugin modules via this privileged scheme.
protocol.registerSchemesAsPrivileged([
  { scheme: 'openpen-plugin', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Windows: prevent Chromium from throttling our transparent always-on-top
// renderers. Without these switches, the overlay window's render thread can be
// classified as occluded/backgrounded (transparent pixels make occlusion
// detection ambiguous), causing the GPU compositor to defer paint commits
// indefinitely. Symptom: ctx.clearRect after clear-canvas leaves the screen
// showing the previous frame until the next pointer event wakes the renderer.
// The switches MUST be appended before app.whenReady() so Chromium picks them
// up at session bootstrap.
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
}

function _isVirtioGpu() {
  try {
    const cards = fs.readdirSync('/sys/class/drm').filter((n) => /^card\d+$/.test(n));
    for (const card of cards) {
      const driver = fs.readlinkSync(`/sys/class/drm/${card}/device/driver`);
      if (driver.includes('virtio')) return true;
    }
  } catch {
    // No /sys/class/drm or unreadable → fall back to default (don't disable).
  }
  return false;
}

// Linux setup, two parts:
//
//   1. Ozone Wayland — register as a native Wayland client instead of falling
//      back to Xwayland. Wayland-native input regions are honoured by Mutter
//      so click-through (setIgnoreMouseEvents) and overlay collapse behave
//      correctly. Without this, Mutter ignores X11 SHAPE input regions from
//      Xwayland clients and the desktop locks up after collapse. Always on.
//
//   2. Hardware acceleration disabled — but only on virtio-gpu (KVM/QEMU/UTM
//      VMs). On that driver Chromium's Viz GPU process crashes during
//      transparent-window init (`viz_main_impl.cc:181`); the renderer then
//      degrades to CPU paint and the floating ball renders as a solid black
//      square. Real-hardware GPU drivers (i915/amdgpu/nouveau/etc.) keep GPU
//      acceleration.
//
// Both must run before app.whenReady() for Chromium to consume them.
if (process.platform === 'linux') {
  if (_isVirtioGpu()) {
    app.disableHardwareAcceleration();
  }
  app.commandLine.appendSwitch('enable-features', 'UseOzonePlatform');
  app.commandLine.appendSwitch('ozone-platform', 'wayland');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Allow tests (and the occasional dev scenario) to isolate userData from the
// real install. Must run before app.whenReady so getPath('userData') resolves
// to the override immediately.
if (process.env.OPENPEN_USER_DATA_DIR) {
  app.setPath('userData', process.env.OPENPEN_USER_DATA_DIR);
}

// isDev: false when packaged OR when NODE_ENV=production (allows e2e plugin
// install tests to load dist/index.html with the importmap without packaging).
const isDev = !app.isPackaged && process.env.NODE_ENV !== 'production';

// Initialise the file logger as early as possible so every subsequent module
// can use `log` and uncaught errors are captured from the first tick.
initLogger({ isDev });

process.on('uncaughtException', (err) => {
  log.error('uncaughtException:', err);
});

process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection:', reason);
});

const rendererEntry = isDev
  ? 'http://localhost:5173'
  : `file://${path.join(__dirname, '..', 'dist', 'index.html')}`;

app.on('render-process-gone', (_event, webContents, details) => {
  log.error('render-process-gone:', {
    reason: details.reason,
    exitCode: details.exitCode,
    url: webContents.getURL?.(),
  });
});

app.on('child-process-gone', (_event, details) => {
  log.error('child-process-gone:', details);
});

// Renderer-side errors piped to the main-process log via IPC.
ipcMain.on(LOG.RECORD_ERROR, (_event, payload) => {
  log.error('renderer:', payload);
});

app.whenReady().then(async () => {
  // openpen-plugin://<pluginId>/<file> → ~/.openpen/plugins/<pluginId>/<file>
  protocol.handle('openpen-plugin', (request) => {
    const url = new URL(request.url);
    const resolved = resolvePluginFilePath(url.hostname, url.pathname);
    if (!resolved.ok) {
      return new Response(resolved.message, { status: resolved.status });
    }
    if (!fs.existsSync(resolved.filePath)) {
      return new Response('Plugin file not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(resolved.filePath).toString());
  });

  try {
    await initConfigLoader();
  } catch (error) {
    log.error('[Main] Failed to initialize app config:', error?.message || error);
    app.quit();
    return;
  }

  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(path.join(__dirname, '..', 'assets', 'icon.png'));
  }

  // Init order: diagnostics → plugin-meta → settings → i18n → module manifests → windows → tray → shortcuts.
  // Diagnostics must come before settings so that corruption events emitted
  // during readConfig() land on an already-initialised manager.
  // plugin-meta must come before module-manifest-loader so ensurePluginInstalledAt
  // is ready when the first plugin scan runs.
  initDiagnosticsManager();
  initPluginMetaManager();
  initPluginManagerBridge();
  initSettingsStore();
  await initI18n(getSetting('language'));
  await initModuleManifestLoader();
  initWindowManager(rendererEntry);
  initTrayManager({
    onShowMain: () => showMainWindow(),
    onHideMain: () => hideMainWindow(),
    onOpenSettings: () => createSettingsWindow(),
  });
  setDrawingModeChangedListener((isDrawing) => setTrayDrawingMode(isDrawing));
  initShortcutManager({
    onToggleDrawingMode: toggleDrawingMode,
    onUndo: () => {
      const overlay = getOverlayWindow();
      if (overlay && !overlay.isDestroyed()) overlay.webContents.send(HISTORY.UNDO);
    },
    onRedo: () => {
      const overlay = getOverlayWindow();
      if (overlay && !overlay.isDestroyed()) overlay.webContents.send(HISTORY.REDO);
    },
    onQuitApp: () => { requestQuitFromRenderer(); },
    onShortcutConflict: (accelerator) => {
      setTrayWarning(`⚠️ OpenPen: shortcut ${accelerator} is taken by another app`);
    },
  });

  // Create one main + one overlay window per display. On a single-display system
  // this degenerates to one main + one overlay (the existing behaviour).
  for (const display of screen.getAllDisplays()) {
    createMainWindowForDisplay(display);
    createOverlayWindowForDisplay(display);
  }

  // Set the primary display as the initial active display so IPC routing
  // (drawing-mode, clear-canvas, history) targets the correct window before
  // the engine fires its first intent.
  setActiveDisplayId(screen.getPrimaryDisplay().id);

  // Initialise the positioning engine after windows are created.
  initPositioningEngine({ getAllMainWindows, setActiveDisplayId });

  // Seed the engine with the workArea-center default position so getPositioningState()
  // returns valid coordinates before the renderer sends its first intent.
  // The broadcast from processIntent fires here but the renderer may not yet be
  // subscribed; the renderer pulls state explicitly on mount via GET_STATE.
  void processIntent({ type: 'init' });

  // Run the Windows transparent-rendering probe in the background.
  // On non-Windows platforms this is a no-op that resolves immediately.
  // The probe must not block app startup; fire-and-forget via void.
  void (async () => {
    const primaryMain = getAllMainWindows().find(Boolean);
    if (primaryMain) {
      const isBroken = await probeTransparentRendering(primaryMain);
      if (isBroken) {
        log.warn('[TransparentRenderProbe] Transparent rendering failure detected on Windows.');
        // Broadcast to all open windows so whichever has a NotificationLayer
        // can display the banner.  The overlay window owns NotificationLayer.
        for (const win of BrowserWindow.getAllWindows()) {
          if (!win.isDestroyed()) {
            win.webContents.send(SYSTEM.TRANSPARENT_RENDERING_BROKEN);
          }
        }
      }
    }
  })();

  // Wire positioning IPC — renderer sends intents, engine processes them and
  // broadcasts the resulting state back to the renderer via STATE_CHANGED.
  ipcMain.handle(POSITIONING.INTENT, async (_event, intent) => {
    return processIntent(intent);
  });

  // Renderer pulls the current engine state snapshot on mount so it does not
  // depend on receiving the broadcast that fires during main-process init.
  ipcMain.handle(POSITIONING.GET_STATE, () => getPositioningState());

  // Plugin network audit (dev + prod). Captures outbound requests from plugin
  // code so users and reviewers can audit what installed plugins phone home.
  // Requests are not blocked — user-installed plugins are trusted by the install process.
  const auditLog = createAuditLog({ maxEntries: 500 });

  /**
   * Parses a scoped pluginId from an openpen-plugin:// referrer URL.
   * The hostname encodes the id as `scope.name` (e.g. `openpen.freehand`);
   * this function reconstructs `@openpen/freehand`.
   * Returns null for any other referrer or on parse error.
   *
   * @param {string|undefined} referrer
   * @returns {string|null}
   */
  function parsePluginId(referrer) {
    if (!referrer || !referrer.startsWith('openpen-plugin://')) return null;
    try {
      const hostname = new URL(referrer).hostname;
      if (!hostname) return null;
      const dotIdx = hostname.indexOf('.');
      if (dotIdx < 0) return null;
      return `@${hostname.slice(0, dotIdx)}/${hostname.slice(dotIdx + 1)}`;
    } catch {
      return null;
    }
  }

  /**
   * Returns true for requests that belong to the host app rather than
   * to installed plugins.
   *
   * @param {string} url
   * @returns {boolean}
   */
  function isHostTraffic(url) {
    return (
      url.startsWith('http://localhost') ||
      url.startsWith('devtools://') ||
      url.startsWith('openpen-plugin://') ||
      url.startsWith('file://')
    );
  }

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    if (!isHostTraffic(details.url)) {
      const pluginId = parsePluginId(details.referrer);
      // Strip query string from initiator to avoid leaking PII / tokens.
      const initiatorSafe = details.referrer
        ? details.referrer.split('?')[0]
        : null;

      auditLog.append({
        requestId: details.id,
        timestamp: Date.now(),
        method: details.method || 'GET',
        url: details.url,
        statusCode: null,
        webContentsId: details.webContentsId ?? null,
        initiator: initiatorSafe,
        pluginId,
      });

      if (isDev) {
        console.log('[audit]', { method: details.method, url: details.url, pluginId });
      }
    }
    callback({ requestHeaders: details.requestHeaders });
  });

  session.defaultSession.webRequest.onCompleted((details) => {
    if (!isHostTraffic(details.url)) {
      // Back-fill statusCode by requestId — same-URL parallel requests stay distinct.
      auditLog.updateByRequestId(details.id, { statusCode: details.statusCode ?? null });
    }
  });

  // Expose audit log over IPC.
  ipcMain.handle(AUDIT.GET_ENTRIES, (_event, opts) => auditLog.getEntries(opts));
  ipcMain.handle(AUDIT.CLEAR, () => { auditLog.clear(); });

  // Broadcast plugin module manifests to each window once its renderer loads.
  for (const win of [...getAllMainWindows(), ...getAllOverlayWindows()]) {
    win.webContents.on('did-finish-load', () => {
      sendModuleManifests(win.webContents);
    });
  }

  app.on('activate', () => {
    if (!_isQuitting && BrowserWindow.getAllWindows().length === 0) {
      createMainWindowForDisplay(screen.getPrimaryDisplay());
    }
  });
});

app.on('before-quit', (event) => {
  // Already exiting via APP.QUIT (renderer-confirmed path); let app.exit run.
  if (_isQuitting) return;

  // External app.quit() (Cmd+Q / Dock-quit / system shutdown). Intercept and
  // ask the renderer to confirm via the same dialog that the control-bar
  // Quit button uses.
  event.preventDefault();

  // Test seam: OPENPEN_AUTO_CONFIRM_QUIT=1 skips the renderer round-trip and
  // exits immediately, mirroring the confirmed-quit code path.
  if (process.env.OPENPEN_AUTO_CONFIRM_QUIT) {
    _isQuitting = true;
    broadcastLifecycle('quit');
    setTimeout(async () => {
      await flushWrites();
      unregisterAllShortcuts();
      app.exit(0);
    }, LIFECYCLE_FLUSH_MS);
    return;
  }

  requestQuitFromRenderer();
});

app.on('will-quit', () => {
  unregisterAllShortcuts();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
