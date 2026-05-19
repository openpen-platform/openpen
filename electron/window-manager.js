/**
 * WindowManager — owns creation, show/hide and IPC wiring for every BrowserWindow.
 * This module is the source of truth for window state; renderers talk to it via IPC.
 *
 * Window topology (per-display):
 *   For N displays: N mainWindows + N overlayWindows, keyed by display.id.
 *   Exactly one display is "active" at any time — only that display's mainWindow
 *   renders the bar UI; others suppress it via CSS (driven by displayId URL param).
 */

import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WINDOW, OVERLAY, CONTROL_BAR, HISTORY, CURSOR } from './ipc-channels.js';
import { getAppConfig } from './config-loader.js';
import { sendModuleManifests } from './module-manifest-loader.js';
import { suspendShortcuts, resumeShortcuts } from './shortcut-manager.js';
import log from 'electron-log/main.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {Map<number, BrowserWindow>} Per-display control-bar windows, keyed by display.id. */
const mainWindowsByDisplayId = new Map();

/** @type {Map<number, BrowserWindow>} Per-display overlay windows, keyed by display.id. */
const overlayWindowsByDisplayId = new Map();

/** @type {BrowserWindow | null} Settings window (at most one). */
let settingsWindow = null;

/**
 * Main window dimmed for the lifetime of the settings window. Captured at open
 * so a display hotplug (which mutates activeDisplayId) cannot redirect the
 * restore to a different display's window.
 * @type {BrowserWindow | null}
 */
let dimmedMainForSettings = null;

/** @type {number} display.id of the currently active display. */
let activeDisplayId = -1;

/** @type {boolean} Whether drawing mode is currently active. */
let drawingMode = false;
/** 10Hz timer that re-asserts overlay webContents focus while drawing
 *  mode is on, so macOS WindowServer keeps honouring `cursor: none`
 *  through real pointer events. Cleared on every drawing-mode toggle. */
let cursorFocusRefreshTimer = null;

const IS_WIN = process.platform === 'win32';
let winFocusTickCount = 0;
let winOverlayFocusEventCount = 0;
let winMainMoveTopCount = 0;
function winDbg(tag, data) {
  if (!IS_WIN) return;
  const ts = Date.now();
  log.info(`[WIN_CURSOR_DBG] ${tag} t=${ts}`, data ?? '');
}

/** @type {string} Vite dev-server URL or packaged dist entry. */
let rendererEntry = '';

/** @type {((isDrawing: boolean) => void) | null} */
let _drawingModeChangedCb = null;

/**
 * Register a callback that fires whenever drawing mode changes.
 * Used by tray-manager to swap the tray icon.
 * @param {(isDrawing: boolean) => void} cb
 */
export function setDrawingModeChangedListener(cb) {
  _drawingModeChangedCb = cb;
}

/**
 * @param {string} entry - Renderer entry URL.
 */
export function initWindowManager(entry) {
  rendererEntry = entry;
  registerIpcHandlers();
  registerScreenHotplugHandlers();
}

// ─── Debounce helper ──────────────────────────────────────────────────────────

/**
 * Create a debounce wrapper that delays execution by `delayMs`.
 * Subsequent calls within the delay window reset the timer.
 *
 * @param {() => void} fn
 * @param {number} delayMs
 * @returns {() => void}
 */
function _debounce(fn, delayMs) {
  let timer = null;
  return function debounced() {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; fn(); }, delayMs);
  };
}

// ─── Screen hotplug handlers ──────────────────────────────────────────────────

/**
 * Register per-display lifecycle handlers.
 * All three handlers debounce by 200 ms to absorb stale screen.getAllDisplays()
 * reads that occur immediately after a hotplug event (Electron issue #10741).
 */
function registerScreenHotplugHandlers() {
  const DEBOUNCE_MS = 200;

  const onDisplayAdded = _debounce(() => {
    _reconcileDisplayWindows();
  }, DEBOUNCE_MS);

  const onDisplayRemoved = _debounce(() => {
    _reconcileDisplayWindows();
  }, DEBOUNCE_MS);

  const onDisplayMetricsChanged = _debounce(() => {
    _reconcileDisplayWindows();
  }, DEBOUNCE_MS);

  screen.on('display-added',           onDisplayAdded);
  screen.on('display-removed',         onDisplayRemoved);
  screen.on('display-metrics-changed', onDisplayMetricsChanged);
}

/**
 * Synchronise per-display window pairs to match the current display list.
 * Called (debounced) on every display hotplug event.
 *
 * - New displays: create main + overlay window pair.
 * - Removed displays: destroy the corresponding window pair.
 * - Metrics-changed: resize/reposition the affected window pair.
 * - Active display lost: re-resolve from cursor position.
 */
function _reconcileDisplayWindows() {
  const currentDisplays = screen.getAllDisplays();
  const currentIds = new Set(currentDisplays.map((d) => d.id));

  // Destroy windows for displays that no longer exist.
  for (const [id, win] of mainWindowsByDisplayId) {
    if (!currentIds.has(id)) {
      if (!win.isDestroyed()) win.destroy();
      mainWindowsByDisplayId.delete(id);
    }
  }
  for (const [id, win] of overlayWindowsByDisplayId) {
    if (!currentIds.has(id)) {
      if (!win.isDestroyed()) win.destroy();
      overlayWindowsByDisplayId.delete(id);
    }
  }

  // Create windows for new displays; resize/reposition existing ones.
  for (const display of currentDisplays) {
    const { id, workArea } = display;

    if (!mainWindowsByDisplayId.has(id)) {
      createMainWindowForDisplay(display);
    } else {
      const win = mainWindowsByDisplayId.get(id);
      if (win && !win.isDestroyed()) {
        win.setBounds({
          x: workArea.x,
          y: workArea.y,
          width: workArea.width,
          height: workArea.height,
        });
      }
    }

    if (!overlayWindowsByDisplayId.has(id)) {
      createOverlayWindowForDisplay(display);
    } else {
      const win = overlayWindowsByDisplayId.get(id);
      if (win && !win.isDestroyed()) {
        win.setBounds({
          x: workArea.x,
          y: workArea.y,
          width: workArea.width,
          height: workArea.height,
        });
      }
    }
  }

  // Re-resolve active display if the current one was removed.
  if (!currentIds.has(activeDisplayId)) {
    const cursor = screen.getCursorScreenPoint();
    const resolved = currentDisplays.find(
      (d) => cursor.x >= d.bounds.x && cursor.x < d.bounds.x + d.bounds.width &&
             cursor.y >= d.bounds.y && cursor.y < d.bounds.y + d.bounds.height
    ) ?? currentDisplays[0];

    if (resolved) {
      activeDisplayId = resolved.id;
    }
  }

  // Re-establish z-order for every display after hotplug.
  for (const [id, mainWin] of mainWindowsByDisplayId) {
    const overlayWin = overlayWindowsByDisplayId.get(id);
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.moveTop();
    if (!mainWin.isDestroyed()) mainWin.moveTop();
  }

  // Notify the positioning engine that display topology changed.
  // The engine is imported lazily to avoid circular deps at module load time.
  import('./positioning-engine.js').then(({ processIntent }) => {
    void processIntent({ type: 'display-changed' });
  });
}

// ─── Window factories ─────────────────────────────────────────────────────────

/** @returns {string} */
function preloadPath() {
  return path.join(__dirname, 'preload.js');
}

/**
 * @param {BrowserWindow} win
 * @param {string} [query]
 */
function loadRenderer(win, query = '') {
  return win.loadURL(`${rendererEntry}${query}`);
}

/**
 * Decide whether to auto-open DevTools for a given window.
 * Open only in unpacked dev runs and gated by app.config.js flags.
 * @param {'main'|'overlay'|'settings'} windowType
 * @returns {boolean}
 */
function shouldOpenDevTools(windowType) {
  if (app.isPackaged) return false;

  const appConfig = getAppConfig();
  const { devtools } = appConfig.electron;
  if (!devtools.enabled) return false;

  if (windowType === 'main') return devtools.openMainWindow;
  if (windowType === 'overlay') return devtools.openOverlayWindow;
  if (windowType === 'settings') return devtools.openSettingsWindow;
  return false;
}

/**
 * Create the main window (control bar) for the given display.
 * The window covers the display's full workArea so the viewport equals the workArea,
 * enabling correct floating-ui collision detection and CSS-variable ball positioning.
 *
 * The window receives `?displayId=<id>` in its URL so the renderer knows which
 * display it belongs to — used for active-display visibility (Mechanism A).
 *
 * @param {Electron.Display} display
 */
export function createMainWindowForDisplay(display) {
  const appConfig = getAppConfig();
  const mainOnTopLevel = appConfig.electron.window.mainAlwaysOnTopLevel;
  const mainOnTopRelativeLevel = appConfig.electron.window.mainAlwaysOnTopRelativeLevel;
  const { x, y, width, height } = display.workArea;

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    // The control-bar window is conceptually a system tray app surface — it
    // should not appear in the OS taskbar / dock alongside regular windows.
    // The tray icon is the only entry point for OS-level window management.
    skipTaskbar: true,
    // show:false — wait for CONTENT_READY IPC before revealing the window.
    // On Windows, DWM may clip a transparent frameless window at screen-saver
    // level if it becomes visible before the first paint cycle completes.
    // The settings window uses the same pattern (see createSettingsWindow).
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // relativeLevel: 1 — sits one layer above the overlay window (relativeLevel 0)
  // on macOS, so the control bar stays clickable regardless of pointer-capture
  // or focus changes on the overlay.
  win.setAlwaysOnTop(true, mainOnTopLevel, mainOnTopRelativeLevel);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Same throttling guarantee as the overlay window: keep the control bar's
  // animations / RAF callbacks running at full priority on Windows.
  win.webContents.setBackgroundThrottling(false);

  // Default to passthrough so the transparent empty area doesn't block the
  // desktop; the renderer toggles this via IPC when the pointer enters an
  // interactive element.
  win.setIgnoreMouseEvents(true, { forward: true });

  // Fallback: if CONTENT_READY never arrives (renderer crash, slow cold-start),
  // force-show after 3 s so the window isn't permanently invisible.
  const showTimeoutId = setTimeout(() => {
    if (!win.isDestroyed() && !win.isVisible()) {
      log.warn(`[WindowManager] CONTENT_READY timeout, force-showing main window for display ${display.id}`);
      win.show();
      log.info(`[WindowManager] main window visible: ${win.isVisible()} (display ${display.id})`);
    }
  }, 3000);

  win.webContents.ipc.once(WINDOW.CONTENT_READY, () => {
    clearTimeout(showTimeoutId);
    if (!win.isDestroyed()) {
      win.show();
      log.info(`[WindowManager] main window visible: ${win.isVisible()} (display ${display.id})`);
    }
  });

  loadRenderer(win, `?displayId=${display.id}`);

  if (shouldOpenDevTools('main')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindowsByDisplayId.set(display.id, win);

  win.on('closed', () => {
    clearTimeout(showTimeoutId);
    mainWindowsByDisplayId.delete(display.id);
    if (activeDisplayId === display.id) activeDisplayId = -1;
  });
}

/**
 * Create the overlay window (full-screen transparent drawing surface) for the given display.
 * The window covers the display's full workArea — its canvas state is fully independent
 * from overlays on other displays.
 *
 * @param {Electron.Display} display
 */
export function createOverlayWindowForDisplay(display) {
  const appConfig = getAppConfig();
  const overlayOnTopLevel = appConfig.electron.window.overlayAlwaysOnTopLevel;
  const overlayOnTopRelativeLevel = appConfig.electron.window.overlayAlwaysOnTopRelativeLevel;
  const { x, y, width, height } = display.workArea;

  const win = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true,
    skipTaskbar: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.setAlwaysOnTop(true, overlayOnTopLevel, overlayOnTopRelativeLevel);
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Per-WebContents guarantee that animations/timers run at full priority even
  // when Chromium thinks this transparent overlay is backgrounded. Pairs with
  // the disable-backgrounding-occluded-windows command-line switch in main.js.
  win.webContents.setBackgroundThrottling(false);
  // Passthrough by default; only intercept pointer events while drawing.
  win.setIgnoreMouseEvents(true, { forward: true });

  loadRenderer(win, `?window=overlay&displayId=${display.id}`);

  if (shouldOpenDevTools('overlay')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  overlayWindowsByDisplayId.set(display.id, win);

  win.on('closed', () => {
    overlayWindowsByDisplayId.delete(display.id);
  });

  // Z-order recovery for compositors that do not honour setAlwaysOnTop's
  // relativeLevel between same-app top-most windows. macOS uses
  // level + relativeLevel to keep the control bar strictly above the overlay.
  // Windows DWM and Linux compositors (Mutter/Wayland) ignore relativeLevel,
  // so the overlay can rise above the control bar whenever it gains focus —
  // most visibly when the user enters drawing mode and the overlay's
  // setIgnoreMouseEvents(false) lets it intercept a click. The workaround
  // re-asserts mainWin.moveTop() on the next tick after the compositor's
  // activation pass settles.
  if (process.platform === 'win32' || process.platform === 'linux') {
    win.on('focus', () => {
      if (!drawingMode) return;
      winOverlayFocusEventCount += 1;
      winDbg('overlay:focus-event-fired', {
        displayId: display.id,
        cumulativeCount: winOverlayFocusEventCount,
      });
      setImmediate(() => {
        const mainWin = mainWindowsByDisplayId.get(display.id);
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.moveTop();
          winMainMoveTopCount += 1;
          winDbg('main:moveTop-fired (from overlay focus race)', {
            displayId: display.id,
            cumulativeMoveTopCount: winMainMoveTopCount,
          });
        }
      });
    });
  }

  // Keep the main window above the overlay in z-order.
  const mainWin = mainWindowsByDisplayId.get(display.id);
  if (mainWin && !mainWin.isDestroyed()) {
    mainWin.moveTop();
  }
}

// ─── Drawing-mode management ──────────────────────────────────────────────────

/** Toggle drawing mode (wired to the global shortcut). */
export function toggleDrawingMode() {
  setDrawingModeState(!drawingMode);
}

/**
 * Apply a drawing-mode state, updating overlay passthrough and broadcasting IPC.
 * Only the active display's overlay intercepts mouse events for drawing.
 * @param {boolean} enabled
 */
function setDrawingModeState(enabled) {
  const prev = drawingMode;

  const activeOverlay = overlayWindowsByDisplayId.get(activeDisplayId);
  const activeMainForLog = mainWindowsByDisplayId.get(activeDisplayId);
  winDbg('setDrawingModeState:enter', {
    prev,
    next: enabled,
    activeDisplayId,
    overlayExists: !!(activeOverlay && !activeOverlay.isDestroyed()),
    overlayFocused: activeOverlay && !activeOverlay.isDestroyed() ? activeOverlay.isFocused() : null,
    mainExists: !!(activeMainForLog && !activeMainForLog.isDestroyed()),
    mainFocused: activeMainForLog && !activeMainForLog.isDestroyed() ? activeMainForLog.isFocused() : null,
  });

  // Same-state reentry would tear down the cursor wake-up burst
  // mid-flight (timer clear at the top of the block) and re-broadcast
  // DRAWING_MODE_CHANGED, racing the renderer's cursor/passthrough
  // wiring with itself.
  if (enabled === prev) {
    winDbg('setDrawingModeState:noop-same-state', { state: enabled });
    return;
  }

  drawingMode = enabled;

  if (enabled) {
    winFocusTickCount = 0;
    winOverlayFocusEventCount = 0;
    winMainMoveTopCount = 0;
  }

  // Clear any previous cursor-focus refresh timer; it gets re-armed below
  // only when entering drawing mode.
  if (cursorFocusRefreshTimer) {
    clearInterval(cursorFocusRefreshTimer);
    cursorFocusRefreshTimer = null;
  }

  if (activeOverlay && !activeOverlay.isDestroyed()) {
    if (drawingMode) {
      activeOverlay.setIgnoreMouseEvents(false);
    } else {
      activeOverlay.setIgnoreMouseEvents(true, { forward: true });
    }
    // Keep the main window on top so the control bar stays interactive while drawing.
    // On Windows, the overlay's 'focus' event handler (createOverlayWindowForDisplay)
    // re-asserts this z-order whenever DWM activates the overlay during drawing.
    const mainWin = mainWindowsByDisplayId.get(activeDisplayId);
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.moveTop();
    }
    // Broadcast before the cursor wake-up burst so the overlay renderer
    // has already set `cursor: none` on canvas + body by the time the
    // synthetic mouseMove triggers macOS WindowServer to re-evaluate.
    // Reverse order has macOS sample the still-default cursor surface
    // and keep the OS cursor visible.
    activeOverlay.webContents.send(OVERLAY.DRAWING_MODE_CHANGED, drawingMode);

    if (drawingMode) {
      // Cursor wake-up: focus the web view (renderer-level only — does
      // NOT steal OS focus from the screen-shared app) and synthesise
      // a 1-pixel mouseMove followed by a move back to the real cursor
      // point. macOS WindowServer needs both render focus and a
      // non-zero-delta pointer event to commit to the cursor:none
      // surface the renderer just installed.
      //
      // Burst fires at three staggered intervals. WindowServer's cursor
      // re-evaluation cadence is non-deterministic from JS's viewpoint,
      // and a single burst occasionally lands outside its sampling
      // window. Three independent shots widen the catch surface from
      // one ~16ms frame to ~150ms without flooding the renderer's
      // input pipeline. Each call is idempotent: same position; the
      // renderer cursor:none is already set, duplicate events just
      // re-trigger evaluation against the same correct surface.
      const fireCursorWakeup = (tag) => {
        if (!drawingMode) return;
        // Re-resolve the active overlay so multi-display switches that
        // happen during the 30-180ms burst window route the wake-up to
        // the right window.
        const overlay = overlayWindowsByDisplayId.get(activeDisplayId);
        if (!overlay || overlay.isDestroyed()) return;
        try {
          overlay.webContents.focus();
          const point = screen.getCursorScreenPoint();
          const bounds = overlay.getBounds();
          const localX = point.x - bounds.x;
          const localY = point.y - bounds.y;
          overlay.webContents.sendInputEvent({
            type: 'mouseMove',
            x: localX + 1,
            y: localY,
          });
          overlay.webContents.sendInputEvent({
            type: 'mouseMove',
            x: localX,
            y: localY,
          });
          winDbg(`AD-7 burst:${tag} fired`, { localX, localY });
        } catch (err) {
          log.warn(`[window-manager] synthetic cursor mouseMove dropped at ${tag}:`, err?.message);
          winDbg(`AD-7 burst:${tag} THREW`, { error: err?.message });
        }
      };
      setTimeout(() => fireCursorWakeup('30ms'), 30);
      setTimeout(() => fireCursorWakeup('80ms'), 80);
      setTimeout(() => fireCursorWakeup('180ms'), 180);

      // Sustained cursor-focus refresh while drawing mode is on. The
      // wake-up burst stops at 180ms, but on macOS WindowServer
      // re-evaluates cursor via OS-level tracking on any real
      // pointermove that follows, and that re-evaluation ignores the
      // webview's `cursor: none` unless the webContents is currently
      // render-focused. Without a sustained refresh the OS cursor
      // snaps back to arrow the first time another window steals
      // render focus (settings dialog, system UI, dock hover). DWM
      // on Windows also keys SetCursor delivery off the focused
      // webContents, so the same refresh keeps the HWND cursor
      // honouring `cursor: none` across focus drift.
      //
      // Re-resolve the active overlay each tick — `activeDisplayId`
      // can change mid-session (user drags the ball / bar across
      // displays), and capturing the entry-time overlay would leave
      // the new active overlay unrefreshed AND churn focus on the
      // stale one. Body guard auto-clears the interval on exit.
      cursorFocusRefreshTimer = setInterval(() => {
        if (!drawingMode) {
          clearInterval(cursorFocusRefreshTimer);
          cursorFocusRefreshTimer = null;
          return;
        }
        const overlay = overlayWindowsByDisplayId.get(activeDisplayId);
        if (!overlay || overlay.isDestroyed()) return;
        try {
          overlay.webContents.focus();
          winFocusTickCount += 1;
          // Sample every 10th tick (1s cadence) so the log stays readable.
          // Tick 1 captured explicitly to anchor t=0 since the burst spans 30-180ms.
          if (winFocusTickCount === 1 || winFocusTickCount % 10 === 0) {
            const mainWin = mainWindowsByDisplayId.get(activeDisplayId);
            winDbg('cursorFocusRefreshTimer:tick', {
              tickN: winFocusTickCount,
              overlayFocused: overlay.isFocused(),
              mainFocused: mainWin && !mainWin.isDestroyed() ? mainWin.isFocused() : null,
              overlayFocusEventsSoFar: winOverlayFocusEventCount,
              mainMoveTopsSoFar: winMainMoveTopCount,
            });
          }
        } catch {
          /* best-effort */
        }
      }, 100);
    } else if (IS_WIN) {
      // Win exit cursor refresh: the HWND cursor remains at whatever
      // Chromium last issued via SetCursor (cursor:none from drawing
      // mode) until Windows fires a fresh WM_SETCURSOR, which only
      // happens on real pointer movement. Toggling setIgnoreMouseEvents
      // on the main window flips WS_EX_LAYERED/WS_EX_TRANSPARENT, which
      // DWM treats as a window-state change and re-evaluates the
      // cursor. Final state ends at (true, forward:true) — the steady-
      // state default; the passthrough guard re-syncs to (false) on the
      // next real mouseMove if the pointer is over an interactive
      // element. Delay 50ms so the renderer has applied body cursor:''
      // before the flip.
      setTimeout(() => {
        if (drawingMode) return;
        const mainWin = mainWindowsByDisplayId.get(activeDisplayId);
        if (!mainWin || mainWin.isDestroyed()) return;
        try {
          mainWin.setIgnoreMouseEvents(false);
          mainWin.setIgnoreMouseEvents(true, { forward: true });
          winDbg('exit cursor-refresh ignoreMouseEvents-toggle fired');
        } catch (err) {
          winDbg('exit cursor-refresh ignoreMouseEvents-toggle THREW', { error: err?.message });
        }
      }, 50);
    }
  }

  // Notify the active display's main window (ControlBar.vue visual indicators).
  const activeMain = mainWindowsByDisplayId.get(activeDisplayId);
  if (activeMain && !activeMain.isDestroyed()) {
    activeMain.webContents.send(OVERLAY.DRAWING_MODE_CHANGED, drawingMode);
  }

  _drawingModeChangedCb?.(drawingMode);
}

// ─── Settings window ──────────────────────────────────────────────────────────

/**
 * Create (or focus the existing) settings window. Hides the active display's
 * main window while the settings window is open.
 */
export function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  // Hide the active main window via setOpacity rather than hide() or
  // off-screen setPosition. Windows DWM re-allocates the compositor surface
  // on hide → show for transparent always-on-top windows, producing a
  // one-frame flash on the next paint. macOS clamps extreme negative
  // coordinates, so setPosition(-99999, -99999) leaves the window partially
  // visible at the screen edge in vbar layout. setOpacity(0) keeps the
  // window composited and stationary on both platforms.
  //
  // Force passthrough on the dimmed window: the renderer toggles
  // ignoreMouseEvents off whenever the cursor hovers UI, so the gear click
  // that opens settings likely lands while the main window is intercepting
  // input. Without re-asserting passthrough, an invisible (opacity 0)
  // full-screen window would silently swallow every click underneath.
  const activeMain = mainWindowsByDisplayId.get(activeDisplayId);
  if (activeMain && !activeMain.isDestroyed()) {
    activeMain.setOpacity(0);
    activeMain.setIgnoreMouseEvents(true, { forward: true });
    dimmedMainForSettings = activeMain;
  }

  settingsWindow = new BrowserWindow({
    width: 700,
    height: 760,
    // hasShadow:false — macOS's auto-shadow otherwise produces a black seam.
    hasShadow: false,
    frame: false,
    // Transparent + explicit backgroundColor prevents a white flash if
    // ready-to-show fires before Vue mounts.
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    // show:false — Vue's onMounted reports CONTENT_READY via IPC and only
    // then do we call show(), avoiding an empty-window flash.
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  settingsWindow.setAlwaysOnTop(true, 'screen-saver');

  // Don't rely on ready-to-show: at first paint Vue hasn't mounted yet so
  // the window flashes empty. Wait for the renderer's CONTENT_READY IPC.
  settingsWindow.webContents.ipc.once(WINDOW.CONTENT_READY, () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show();
      settingsWindow.focus();
      settingsWindow.webContents.focus();
    }
  });

  if (shouldOpenDevTools('settings')) {
    settingsWindow.webContents.openDevTools({ mode: 'detach' });
  }

  settingsWindow.webContents.on('did-finish-load', () => {
    sendModuleManifests(settingsWindow.webContents);
  });

  loadRenderer(settingsWindow, '?window=settings');

  // Suspend global shortcuts while the settings window is open: keys like the
  // drawing-mode toggle should route to whatever input element has focus
  // inside settings (e.g. a text field, hotkey-capture row), not fire the
  // host-level handler. Counter-based, so HotkeyInput's own suspend nests
  // correctly without a premature resume releasing this one.
  suspendShortcuts();

  settingsWindow.on('closed', () => {
    settingsWindow = null;
    resumeShortcuts();
    // Restore the exact window we dimmed at open time. A display hotplug
    // between open and close can shift activeDisplayId; restoring by
    // displayId would leave the originally dimmed window stuck at opacity 0.
    const dimmed = dimmedMainForSettings;
    dimmedMainForSettings = null;
    if (dimmed && !dimmed.isDestroyed()) {
      dimmed.setOpacity(1);
      dimmed.setIgnoreMouseEvents(true, { forward: true });
    }
  });
}

export function closeSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
}

// ─── Show / hide ──────────────────────────────────────────────────────────────

export function showMainWindow() {
  const win = mainWindowsByDisplayId.get(activeDisplayId);
  if (win && !win.isDestroyed()) {
    win.show();
  }
}

export function hideMainWindow() {
  const win = mainWindowsByDisplayId.get(activeDisplayId);
  if (win && !win.isDestroyed()) {
    win.hide();
  }
}

// ─── Position ────────────────────────────────────────────────────────────────

/**
 * Move the active display's main window.
 *
 * The window stays fixed at the workArea origin during normal operation
 * (ball moves via CSS variables). Kept for display hotplug repositioning
 * and diagnostic/test use.
 *
 * @param {{ x: number, y: number }} pos
 */
export function setMainWindowPosition({ x, y }) {
  const win = mainWindowsByDisplayId.get(activeDisplayId);
  if (win && !win.isDestroyed()) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (!Number.isFinite(rx) || !Number.isFinite(ry)) return;
    win.setPosition(rx, ry);
  }
}

// ─── Active-display management ────────────────────────────────────────────────

/**
 * Update the active display id. Called by the positioning engine when the ball
 * moves to a different display (drag-end, summon-to-cursor, display-changed).
 *
 * @param {number} displayId
 */
export function setActiveDisplayId(displayId) {
  activeDisplayId = displayId;
}

// ─── Getters ──────────────────────────────────────────────────────────────────

/**
 * @returns {{ id: number, bounds: Electron.Rectangle, workArea: Electron.Rectangle, scaleFactor: number }[]}
 */
export function getDisplayInfo() {
  return screen.getAllDisplays().map(({ id, bounds, workArea, scaleFactor }) => ({
    id,
    bounds,
    workArea,
    scaleFactor,
  }));
}

/**
 * Returns the active display's main window.
 * Backward-compatible with code that expects a single mainWindow reference.
 * @returns {BrowserWindow | null}
 */
export function getMainWindow() {
  return mainWindowsByDisplayId.get(activeDisplayId) ?? null;
}

/**
 * Returns the active display's overlay window.
 * Backward-compatible with code that expects a single overlayWindow reference.
 * @returns {BrowserWindow | null}
 */
export function getOverlayWindow() {
  return overlayWindowsByDisplayId.get(activeDisplayId) ?? null;
}

/** @returns {BrowserWindow | null} */
export function getSettingsWindow() {
  return settingsWindow;
}

/** @returns {boolean} */
export function getDrawingMode() {
  return drawingMode;
}

/**
 * Return all per-display main windows (used by main.js for broadcast setup).
 * @returns {BrowserWindow[]}
 */
export function getAllMainWindows() {
  return Array.from(mainWindowsByDisplayId.values());
}

/**
 * Return all per-display overlay windows (used by main.js for broadcast setup).
 * @returns {BrowserWindow[]}
 */
export function getAllOverlayWindows() {
  return Array.from(overlayWindowsByDisplayId.values());
}

// ─── IPC handlers ─────────────────────────────────────────────────────────────

function registerIpcHandlers() {
  ipcMain.on(WINDOW.OPEN_SETTINGS, () => {
    createSettingsWindow();
  });

  ipcMain.on(WINDOW.CLOSE_SETTINGS, () => {
    closeSettingsWindow();
  });

  ipcMain.on(WINDOW.SET_POSITION, (_, pos) => {
    setMainWindowPosition(pos);
  });

  ipcMain.handle(WINDOW.GET_DISPLAY_INFO, () => {
    return getDisplayInfo();
  });

  ipcMain.handle(WINDOW.GET_POSITION, () => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return null;
    const [x, y] = win.getPosition();
    return { x, y };
  });

  ipcMain.handle(WINDOW.GET_CURSOR_POSITION, () => {
    return screen.getCursorScreenPoint();
  });

  ipcMain.on(WINDOW.SET_IGNORE_MOUSE_EVENTS, (event, ignore) => {
    // Set passthrough on the window that sent this message (identified by webContentsId).
    const sendingWin = BrowserWindow.fromWebContents(event.sender);
    if (!sendingWin || sendingWin.isDestroyed()) return;
    // While settings is open the dimmed main window must stay passthrough.
    // The renderer's passthrough guard receives forwarded mousemove events and
    // tries to disable passthrough when the cursor enters the (invisible)
    // float-ball region; honouring that would re-capture clicks on a window
    // sitting above settings on macOS (relativeLevel 1 vs 0) and on whichever
    // Win/Linux frame the compositor placed on top, swallowing clicks meant
    // for the settings panel underneath.
    if (!ignore && sendingWin === dimmedMainForSettings) {
      return;
    }
    if (ignore) {
      sendingWin.setIgnoreMouseEvents(true, { forward: true });
    } else {
      sendingWin.setIgnoreMouseEvents(false);
    }
    // If the sender is a main window and we are in drawing mode, relay the
    // hover state to the matching overlay so its DOM cursor hides while the
    // user interacts with the control bar. On Windows, pointermove delivery
    // to the overlay stops the moment the main window captures the pointer
    // (ignore=false), so the overlay's own pointerleave never fires and the
    // DOM cursor would otherwise freeze at the control-bar edge.
    if (drawingMode) {
      for (const [displayId, mainWin] of mainWindowsByDisplayId) {
        if (mainWin !== sendingWin) continue;
        const overlay = overlayWindowsByDisplayId.get(displayId);
        if (overlay && !overlay.isDestroyed()) {
          overlay.webContents.send(CURSOR.INTERACTIVE_HOVER_CHANGED, !ignore);
        }
        break;
      }
    }
  });

  ipcMain.on(OVERLAY.SET_DRAWING_MODE, (_, enabled) => {
    setDrawingModeState(enabled);
  });

  // Cross-window relay: ControlBar (main window) → overlay window.
  // The renderer-side event-bus is per-window, so cross-window
  // synchronisation goes through these IPC channels.
  ipcMain.on(CONTROL_BAR.TOOL_CHANGED, (_, config) => {
    // Broadcast to all overlay windows — all displays need the active tool.
    for (const win of overlayWindowsByDisplayId.values()) {
      if (!win.isDestroyed()) {
        win.webContents.send(CONTROL_BAR.TOOL_CONFIG_CHANGED, config);
      }
    }
  });

  ipcMain.on(CONTROL_BAR.STROKE_STYLE, (_, style) => {
    for (const win of overlayWindowsByDisplayId.values()) {
      if (!win.isDestroyed()) {
        win.webContents.send(CONTROL_BAR.STROKE_STYLE_CHANGED, style);
      }
    }
  });

  ipcMain.on(CONTROL_BAR.CLEAR_CANVAS, () => {
    // Clear canvas on the active display's overlay only (§4.5 drawing isolation).
    const activeOverlay = overlayWindowsByDisplayId.get(activeDisplayId);
    if (activeOverlay && !activeOverlay.isDestroyed()) {
      activeOverlay.webContents.send(CONTROL_BAR.CLEAR_CANVAS_TRIGGERED);
    }
  });

  ipcMain.on(HISTORY.TRIGGER_UNDO, () => {
    const activeOverlay = overlayWindowsByDisplayId.get(activeDisplayId);
    if (activeOverlay && !activeOverlay.isDestroyed()) {
      activeOverlay.webContents.send(HISTORY.UNDO);
    }
  });
  ipcMain.on(HISTORY.TRIGGER_REDO, () => {
    const activeOverlay = overlayWindowsByDisplayId.get(activeDisplayId);
    if (activeOverlay && !activeOverlay.isDestroyed()) {
      activeOverlay.webContents.send(HISTORY.REDO);
    }
  });

  // Overlay → main → control bar (canUndo / canRedo state sync).
  ipcMain.on(HISTORY.STATE_CHANGED, (_, state) => {
    const activeMain = mainWindowsByDisplayId.get(activeDisplayId);
    if (activeMain && !activeMain.isDestroyed()) {
      activeMain.webContents.send(HISTORY.STATE_CHANGED, state);
    }
  });
}
