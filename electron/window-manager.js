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
import { createOverlayPlatform } from './platform/overlay-platform.js';
import { deriveLinuxWindowState } from './linux-window-state.js';
import { IS_WAYLAND_SESSION as IS_WAYLAND } from './is-wayland-session.js';
import { initCursorOs, hideOsCursor, showOsCursor } from './cursor-os.js';
import log from 'electron-log/main.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {Map<number, BrowserWindow>} Per-display control-bar windows, keyed by display.id. */
const mainWindowsByDisplayId = new Map();

/**
 * @type {Set<number>} display.id of control-bar windows that have already
 * self-revealed (CONTENT_READY or the 3s fallback fired). Only these are safe
 * for `reconcileStandardBarWindows()` to `win.show()`: a window created
 * `show:false` must not be force-shown before its first paint or DWM may flash
 * an empty transparent frame (the same hazard the CONTENT_READY gate guards).
 * Hotplugging a monitor while the bar is visible is the trigger — the new
 * display's window is still pre-CONTENT_READY when reconcile runs.
 */
const readyMainDisplayIds = new Set();

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

/**
 * Linux/Wayland: true while the settings window is open. The Mac/Win dim-via-
 * opacity trick is wrong here (it would be a second visibility mutator competing
 * with the single coordinator), so on Wayland reconcileLinuxWindows() hides the
 * bar (and any drawing overlay) for the duration instead. It is an independent
 * reconcile input from `barHidden`, so the two compose cleanly.
 * @type {boolean}
 */
let linuxControlsHiddenForSettings = false;

/** @type {number} display.id of the currently active display. */
let activeDisplayId = -1;

/** @type {boolean} Whether drawing mode is currently active. */
let drawingMode = false;

// IS_WAYLAND (imported above from ./is-wayland-session.js, the shared predicate):
// the Linux workarounds below (always-bar window, on-demand overlay, gsettings
// shortcuts) target NATIVE WAYLAND only. On an X11/Xorg session the classic
// fullscreen path works, so it follows the same code path as Mac/Win.

// The platform adapter: the single resolved-once implementation of the window/
// control-surface behaviour that diverges across platforms. Concerns migrate
// onto it incrementally; first up is the click-through primitive (was
// _setPassthrough). See electron/platform/overlay-platform.js.
const platform = createOverlayPlatform();

// ─── Linux (native Wayland) control-bar window constants ────────────────────────
//
// On native Wayland/Mutter a single fullscreen transparent window cannot do
// per-pixel "bar clickable, rest click-through": setIgnoreMouseEvents is
// all-or-nothing, {forward:true} is unimplemented, and getCursorScreenPoint is
// frozen while the surface has an empty input region — so hover can't be
// detected (empirically verified). The only Wayland-legal model is a physically
// small window that captures only its own area; the desktop outside it stays
// usable.
//
// The control bar is therefore ONE persistent, non-fullscreen, always-on-top
// window (role=panel) rendering the full toolbar — no ball, no collapse/expand.
// Mutter pins it top-left and forbids client positioning (setPosition is a
// no-op), so it can't be moved or anchored — only shown/hidden.
//
// It is a FIXED size — never resized at runtime. Mutter clamps a grow-after-
// shrink at the compositor level (setSize is accepted but the granted viewport
// is not enlarged, below the reach of any GPU/transparency flag), and Electron
// documents transparent windows as not resizable — so a tight-bar-that-grows-
// for-popovers is impossible here. The window is created once at a size that
// already contains the bar + the popovers it opens below. The transparent area
// below the bar captures clicks (no per-region passthrough on Wayland — setShape
// is a no-op here); the toggleBar shortcut / tray hide are the footprint control.
// Full investigation + decision: spec
// references/electron-wayland-window-positioning-2a-vs-2b-2026-05-30.md.
//
// LINUX_TOOLBAR_WIN_* is that fixed size (must stay large enough for the tallest
// popover rendered below the bar).
const LINUX_TOOLBAR_WIN_WIDTH = 760;
const LINUX_TOOLBAR_WIN_HEIGHT = 480;

/**
 * Per-display drawing snapshots (strokes + history) for Wayland, where the
 * overlay window is destroyed on drawing-exit. The overlay renderer reports its
 * snapshot here on every change; a freshly-created overlay replays it so strokes
 * survive across drawing sessions.
 * @type {Map<number, unknown>}
 */
const linuxDrawingSnapshots = new Map();

/**
 * Last tool config / stroke style broadcast from the control bar. On Wayland the
 * overlay is created on drawing-enter, so it misses the live broadcast that fired
 * when the user picked a tool/colour while no overlay existed (e.g. switch tool
 * → enter drawing). We remember the latest and replay it into a fresh overlay so
 * it draws with the selected tool instead of the freehand default. Mac/Win keep
 * one persistent overlay that already received the live broadcast, so these are
 * Wayland-only carriers (harmless to populate everywhere).
 * @type {unknown}
 */
let lastToolConfig = null;
/** @type {unknown} */
let lastStrokeStyle = null;

/**
 * Linux/Wayland window-mode coordinator state. This field plus the module
 * `drawingMode` / `activeDisplayId` / `linuxControlsHiddenForSettings` are the
 * SINGLE source of truth for which Wayland windows must exist.
 * `reconcileLinuxWindows()` is the only function that shows/hides the persistent
 * bar window and creates/destroys the drawing overlay; every transition (drawing
 * toggle, hide-bar shortcut, settings open/close, display change) mutates these
 * fields then calls reconcile. This replaced independent writers that mutated the
 * window set on incompatible clocks and raced each other — the root cause of the
 * "fix one thing, break another" regressions.
 *
 * `barHidden`: the user toggled the bar off (toggleBar shortcut / tray hide).
 * Gates ONLY the non-drawing bar window — NEVER the drawing overlay, so the
 * drawing surface can never be hidden out from under an active drawing session.
 * @type {boolean}
 */
let barHidden = false;

/**
 * Wayland: true while the overlay renderer reports a stroke in progress
 * (pointer-down ↔ pointer-up, via OVERLAY.STROKE_ACTIVE). Drawing-mode EXIT is
 * blocked while true so the on-demand overlay isn't destroyed mid-stroke (which
 * would discard the not-yet-committed stroke — it only enters the store on
 * pointer-up). Reset whenever an overlay is (re)created.
 * @type {boolean}
 */
let _strokeActive = false;

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

/** @type {((hidden: boolean) => void) | null} */
let _barHiddenChangedCb = null;

/**
 * Register a callback that fires whenever the control-bar hidden state changes
 * (toggleBar shortcut / tray hide). Used by tray-manager to keep its hide/show
 * menu label in sync when the shortcut — not the menu — drives the change.
 * @param {(hidden: boolean) => void} cb
 */
export function setBarHiddenChangedListener(cb) {
  _barHiddenChangedCb = cb;
}

/**
 * @param {string} entry - Renderer entry URL.
 */
export function initWindowManager(entry) {
  rendererEntry = entry;
  registerIpcHandlers();
  registerScreenHotplugHandlers();
  initCursorOs();
  registerCursorCrashSafety();
  registerCursorFocusHandlers();
}

/**
 * Restore the OS cursor on any process teardown path so a crash/quit mid-drawing
 * never leaves the system cursor hidden. SIGKILL bypasses these and is an
 * accepted footgun (the user recovers by alt-tabbing).
 */
function registerCursorCrashSafety() {
  app.on('before-quit', () => showOsCursor());
  process.on('exit', () => showOsCursor());
  // Restore the cursor on a fatal error, then exit non-zero: swallowing an
  // uncaught exception leaves a zombie process whose crash is undetectable by
  // any supervisor or the user.
  process.on('uncaughtException', (err) => {
    showOsCursor();
    log.error('[window-manager] uncaught exception, exiting:', err);
    process.exit(1);
  });
}

/**
 * macOS: CGDisplayHideCursor is process-wide, so if the user alt-tabs to another
 * app mid-drawing the cursor would stay hidden over that app. Restore it whenever
 * our windows lose focus and re-hide when they regain it, but only while drawing.
 * Windows ShowCursor only affects our own HWNDs, so this is macOS-only.
 */
function registerCursorFocusHandlers() {
  if (process.platform !== 'darwin') return;
  app.on('browser-window-blur', () => {
    if (drawingMode) showOsCursor();
  });
  app.on('browser-window-focus', () => {
    if (drawingMode) hideOsCursor();
  });
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

    if (IS_WAYLAND) {
      // The persistent per-display bar lives in mainWindowsByDisplayId; create it
      // for a new display. The drawing overlay is owned by reconcileLinuxWindows
      // (drawing mode) and must NEVER be created here — a fullscreen capturing
      // overlay per display would lock the desktop. Mutter pins/sizes the bar, so
      // there is no setBounds on existing ones either.
      if (!mainWindowsByDisplayId.has(id)) createLinuxControlWindowsForDisplay(display);
      continue;
    }

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

  // Re-establish z-order for every display after hotplug (no-op on Wayland —
  // clients can't restack toplevels on Mutter; the coordinator call below
  // re-applies the correct Wayland window set instead).
  if (!IS_WAYLAND) {
    for (const [id, mainWin] of mainWindowsByDisplayId) {
      const overlayWin = overlayWindowsByDisplayId.get(id);
      if (overlayWin && !overlayWin.isDestroyed()) overlayWin.moveTop();
      if (!mainWin.isDestroyed()) mainWin.moveTop();
    }
    // A display added during hotplug shows its window on CONTENT_READY; reconcile
    // so a newly-present display matches barHidden instead of always appearing.
    reconcileStandardBarWindows();
  } else {
    reconcileLinuxWindows();
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
  if (IS_WAYLAND) {
    createLinuxControlWindowsForDisplay(display);
    return;
  }
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
    readyMainDisplayIds.add(display.id);
    if (!win.isDestroyed() && !win.isVisible() && !barHidden) {
      log.warn(`[WindowManager] CONTENT_READY timeout, force-showing main window for display ${display.id}`);
      win.show();
      log.info(`[WindowManager] main window visible: ${win.isVisible()} (display ${display.id})`);
    }
  }, 3000);

  win.webContents.ipc.once(WINDOW.CONTENT_READY, () => {
    clearTimeout(showTimeoutId);
    readyMainDisplayIds.add(display.id);
    if (!win.isDestroyed() && !barHidden) {
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
    readyMainDisplayIds.delete(display.id);
    if (activeDisplayId === display.id) activeDisplayId = -1;
  });
}

// ─── Linux control window (the persistent always-shown bar) ─────────────────────

/**
 * Create the Wayland control-bar window for a display: ONE persistent,
 * fixed-size, transparent always-on-top window rendering the full toolbar
 * (role=panel — no ball). Stored in mainWindowsByDisplayId so every per-display
 * IPC path (history, drawing-mode, quit dialog, settings-dim) targets it
 * unchanged. Mutter pins it top-left and forbids client positioning, so it is
 * never placed — only shown/hidden by reconcileLinuxWindows(). It is NOT
 * resizable: Mutter clamps a grow-after-shrink at the compositor level (so a
 * tight-bar-that-grows-for-popovers can't work), so it is fixed at a size that
 * already contains the bar + the popovers it opens below. The transparent area
 * below the bar captures clicks (no per-region passthrough on Wayland); the
 * toggleBar shortcut / tray hide are the footprint control.
 *
 * Visibility is owned SOLELY by reconcileLinuxWindows(): created show:false, the
 * window asks reconcile to (re)evaluate once its renderer is ready
 * (CONTENT_READY, with a 3s fallback) so the transparent window never flashes
 * empty before its first paint.
 *
 * @param {Electron.Display} display
 */
function createLinuxControlWindowsForDisplay(display) {
  const bar = new BrowserWindow({
    width: LINUX_TOOLBAR_WIN_WIDTH, height: LINUX_TOOLBAR_WIN_HEIGHT,
    frame: false, transparent: true, hasShadow: false, resizable: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: true,
    show: false,
    webPreferences: { preload: preloadPath(), contextIsolation: true, nodeIntegration: false },
  });
  bar.setAlwaysOnTop(true, 'screen-saver');
  bar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  bar.webContents.setBackgroundThrottling(false);
  bar.setIgnoreMouseEvents(false);

  // Fresh renderer: hydrate current module manifests + drawing-mode once loaded,
  // so the toolbar boots with its module buttons (the bar's content-driven width
  // depends on them).
  bar.webContents.on('did-finish-load', () => {
    if (bar.isDestroyed()) return;
    sendModuleManifests(bar.webContents);
    bar.webContents.send(OVERLAY.DRAWING_MODE_CHANGED, drawingMode);
  });

  // Visibility owned by reconcile; defer the first reveal until the renderer is
  // ready (CONTENT_READY, 3s fallback) so the transparent window never flashes.
  const barShowTimeout = setTimeout(() => {
    if (!bar.isDestroyed()) reconcileLinuxWindows();
  }, 3000);
  bar.webContents.ipc.once(WINDOW.CONTENT_READY, () => {
    clearTimeout(barShowTimeout);
    if (!bar.isDestroyed()) reconcileLinuxWindows();
  });

  loadRenderer(bar, `?displayId=${display.id}&role=panel`);
  if (shouldOpenDevTools('main')) bar.webContents.openDevTools({ mode: 'detach' });

  mainWindowsByDisplayId.set(display.id, bar);
  bar.on('closed', () => {
    clearTimeout(barShowTimeout);
    if (mainWindowsByDisplayId.get(display.id) === bar) mainWindowsByDisplayId.delete(display.id);
    if (activeDisplayId === display.id) activeDisplayId = -1;
  });
}

/**
 * Engine → coordinator bridge. The engine calls this after it has already
 * updated activeDisplayId (setActiveDisplayId runs first in _broadcastState).
 * In the always-bar model the bar is pinned top-left and always shown, so the
 * only thing a positioning broadcast can change about the Wayland window set is
 * which display is active — re-derive the set for it. The engine's `barExpanded`
 * / `ballScreenPos` are Mac/Win machinery and are intentionally ignored here
 * (Wayland can neither position the bar nor collapse it).
 *
 * @param {import('./positioning-engine.js').PositioningState} state
 */
export function applyLinuxWindowPositioning(state) {
  if (!IS_WAYLAND || !state) return;
  reconcileLinuxWindows();
}

/**
 * THE single owner of the Linux/Wayland window set. Derives the desired windows
 * from the current mode tuple — (drawingMode, linuxControlsHiddenForSettings,
 * barHidden, activeDisplayId) — and diffs against the actual windows. Because
 * every transition routes through here and re-derives the FULL set, no two
 * concerns can interleave and leave an inconsistent state.
 *
 * Desired set (only the active display shows controls):
 *   bar     : !drawing && !settingsOpen && !barHidden   (the always-shown toolbar)
 *   overlay :  drawing && !settingsOpen                  (drawing surface + in-overlay bar)
 *
 * The bar is a single persistent window per display (in mainWindowsByDisplayId,
 * fixed-size — never resized; see the LINUX_TOOLBAR_WIN_* constant block for why).
 * During drawing the bar window is
 * HIDDEN (not destroyed — it is small, so hide/show is crash-safe on Mutter) and
 * the toolbar rides inside the fullscreen overlay instead. Settings-open hides
 * everything (including the drawing overlay; strokes persist and replay on
 * close). `barHidden` (toggleBar shortcut / tray hide) gates ONLY the bar, never
 * the overlay. The existence/visibility guards make repeated reconciles
 * idempotent, so a fullscreen transparent overlay is never re-mapped (which would
 * crash Viz on virtio-gpu).
 */
function reconcileLinuxWindows() {
  if (!IS_WAYLAND) return;
  const activeId = activeDisplayId;
  const drawing = drawingMode;
  const settingsOpen = linuxControlsHiddenForSettings;

  // The persistent bar window per display: show only the active display's, and
  // only when not drawing / settings-open / user-hidden. Mutter pins it top-left
  // (setPosition is a no-op), so there is nothing to position — just show/hide.
  for (const [displayId, barWin] of mainWindowsByDisplayId) {
    if (!barWin || barWin.isDestroyed()) continue;
    const { showBar } = deriveLinuxWindowState({ displayId, activeId, drawing, settingsOpen, barHidden });
    if (showBar && !barWin.isVisible()) barWin.show();
    else if (!showBar && barWin.isVisible()) barWin.hide();
  }

  // Overlay is on-demand (create on drawing-enter / destroy on exit), active display only.
  for (const display of screen.getAllDisplays()) {
    const { wantOverlay } = deriveLinuxWindowState({ displayId: display.id, activeId, drawing, settingsOpen, barHidden });
    const ov = overlayWindowsByDisplayId.get(display.id);
    const hasOverlay = !!(ov && !ov.isDestroyed());
    if (wantOverlay && !hasOverlay) {
      createOverlayWindowForDisplay(display);
    } else if (!wantOverlay && hasOverlay) {
      ov.destroy();
      overlayWindowsByDisplayId.delete(display.id);
      // The overlay carried the in-flight stroke; once it's gone there is no
      // stroke to protect. Clear the flag so a teardown on a path that does NOT
      // consult it (settings-open / display-change mid-stroke) can't leave
      // drawing-mode exit permanently blocked.
      _strokeActive = false;
    }
  }
}

/**
 * Linux/Wayland equivalent of the Mac/Win settings-open dim: set the flag and
 * reconcile, so the bar (and any drawing overlay) is hidden while settings is up
 * and the controls don't sit over (or bleed clicks past) the settings window. The
 * matching gsettings shortcut suspension is driven separately by
 * suspendShortcuts() → onShortcutsSuspendChange.
 */
function hideLinuxControlsForSettings() {
  linuxControlsHiddenForSettings = true;
  reconcileLinuxWindows();
}

/** Restore the controls after the settings window closes. */
function showLinuxControlsAfterSettings() {
  linuxControlsHiddenForSettings = false;
  reconcileLinuxWindows();
}

/**
 * Create the overlay window (full-screen transparent drawing surface) for the given display.
 * The window covers the display's full workArea — its canvas state is fully independent
 * from overlays on other displays.
 *
 * @param {Electron.Display} display
 */
export function createOverlayWindowForDisplay(display) {
  // A fresh overlay starts with no in-flight stroke; clear any stale flag so a
  // prior session can't leave drawing-mode exit permanently blocked.
  _strokeActive = false;
  const appConfig = getAppConfig();
  const overlayOnTopLevel = appConfig.electron.window.overlayAlwaysOnTopLevel;
  const overlayOnTopRelativeLevel = appConfig.electron.window.overlayAlwaysOnTopRelativeLevel;
  const { x, y, width, height } = display.workArea;

  // Linux/Wayland overlay model: on Mutter a visible fullscreen surface can be
  // neither made click-through (setIgnoreMouseEvents(true) keeps capturing) nor
  // moved off-screen (a fullscreen window is pinned/maximized — setPosition is a
  // no-op), and hide/show re-maps a transparent <canvas> window which crashes
  // Viz on virtio-gpu (SIGTRAP). So the overlay is NOT created at boot; it is
  // CREATED fresh on drawing-enter and DESTROYED on drawing-exit (see
  // setDrawingModeState). A fresh first-map is stable; only re-show of a hidden
  // canvas window crashes. When absent, the desktop is fully usable. Mac/Win
  // keep one always-present passthrough overlay.
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
    show: true,
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
  if (IS_WAYLAND) {
    // Created only while drawing → always capturing. The control bar rides INSIDE
    // this overlay (role=overlay-bar); a separate control window can't be stacked
    // above a capturing fullscreen sibling on Mutter (clients can't restack), so
    // DOM hit-testing inside this one window separates bar clicks from drawing.
    win.setIgnoreMouseEvents(false);
  } else {
    // Passthrough by default; only intercept pointer events while drawing.
    platform.setClickThrough(win);
  }

  const overlayQuery = IS_WAYLAND
    ? `?window=overlay&displayId=${display.id}&role=overlay-bar`
    : `?window=overlay&displayId=${display.id}`;
  loadRenderer(win, overlayQuery);

  if (shouldOpenDevTools('overlay')) {
    win.webContents.openDevTools({ mode: 'detach' });
  }

  overlayWindowsByDisplayId.set(display.id, win);

  win.on('closed', () => {
    overlayWindowsByDisplayId.delete(display.id);
  });

  // Linux overlays are created on drawing-enter, so the fresh renderer must be
  // told drawing mode is on once it loads (it missed any earlier broadcast).
  if (IS_WAYLAND) {
    win.webContents.on('did-finish-load', () => {
      if (win.isDestroyed()) return;
      // Replay strokes from the previous drawing session into this fresh overlay.
      const snapshot = linuxDrawingSnapshots.get(display.id);
      if (snapshot) win.webContents.send(OVERLAY.RESTORE_STATE, snapshot);
      // Seed the selected tool + stroke style, which were broadcast live while
      // this overlay didn't exist (it boots in freehand otherwise).
      if (lastToolConfig) win.webContents.send(CONTROL_BAR.TOOL_CONFIG_CHANGED, lastToolConfig);
      if (lastStrokeStyle) win.webContents.send(CONTROL_BAR.STROKE_STYLE_CHANGED, lastStrokeStyle);
      if (drawingMode) {
        win.webContents.send(OVERLAY.DRAWING_MODE_CHANGED, true);
      }
    });
  }

  // Z-order recovery for compositors that do not honour setAlwaysOnTop's
  // relativeLevel between same-app top-most windows. macOS uses
  // level + relativeLevel to keep the control bar strictly above the overlay.
  // Windows DWM ignores relativeLevel, so the overlay can rise above the control
  // bar whenever it gains focus; re-assert mainWin.moveTop() on the next tick.
  // Wayland is excluded: the bar rides inside this overlay (role=overlay-bar) so
  // there's no separate window to keep on top, AND moveTop can't restack
  // toplevels on Mutter anyway.
  if (process.platform === 'win32') {
    win.on('focus', () => {
      if (!drawingMode) return;
      setImmediate(() => {
        const topWin = mainWindowsByDisplayId.get(display.id);
        if (topWin && !topWin.isDestroyed()) {
          topWin.moveTop();
        }
      });
    });
  }

  // Wayland: the bar is inside this overlay, nothing else to stack. Mac/Win keep
  // the separate main control-bar window on top.
  if (IS_WAYLAND) return;
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

  // Same-state reentry would re-broadcast DRAWING_MODE_CHANGED, racing the
  // renderer's passthrough wiring with itself.
  if (enabled === prev) {
    return;
  }

  // Wayland: don't let a drawing-mode TOGGLE exit mid-stroke. The on-demand
  // overlay is destroyed on exit, and a stroke only enters the store on
  // pointer-up — tearing it down between pointer-down and pointer-up would
  // discard the in-flight stroke. Ignore the toggle until the stroke ends
  // (pointer-up clears _strokeActive); the user re-issues it afterward.
  // This guards the toggle path only; settings-open / display-change can still
  // reconcile the overlay away mid-stroke (pre-existing, rare — you can't open
  // settings with a pointer already down, and a hotplug mid-stroke is luck) and
  // those clear _strokeActive on destroy rather than block. Mac/Win/X11 keep a
  // persistent overlay, so there is nothing to lose and no gate.
  if (!enabled && IS_WAYLAND && _strokeActive) {
    return;
  }

  drawingMode = enabled;

  // Hide/show the OS cursor through the native platform API. No-op on Linux and
  // any platform without bindings. The DOM cursor rendered by the overlay takes
  // over while drawing; on exit the native cursor is restored immediately
  // (no dependence on a subsequent pointer move).
  if (enabled) hideOsCursor();
  else showOsCursor();

  // Wayland: the fullscreen drawing overlay only exists while drawing — created
  // on enter, destroyed on exit. A fresh map is the only stable way to show a
  // transparent fullscreen surface on Mutter/virtio-gpu (re-mapping a hidden one
  // crashes Viz), and while it's absent the desktop is fully usable. The overlay's
  // did-finish-load handler tells the renderer drawing mode is on; reconcile hides
  // the persistent bar so the in-overlay toolbar takes over.
  // The overlay-lifecycle for this transition is platform-divergent: a persistent
  // overlay (toggle passthrough + keep the control bar on top) vs an on-demand
  // overlay (hide the bar + reconcile the window set). Both live behind the
  // port now. reconcile stays in window-manager, invoked via the injected
  // callback, so no module state crosses the seam (each adapter reads only the
  // deps it needs).
  platform.applyDrawingMode(drawingMode, {
    activeOverlay,
    activeMain: mainWindowsByDisplayId.get(activeDisplayId),
    reconcileWayland: () => {
      // On a drawing transition the persistent bar window is hidden (enter) or
      // re-shown (exit) by reconcile; during drawing the toolbar rides inside the
      // fullscreen overlay instead. The bar's renderer closes any open popover on
      // the drawing-mode change, so it returns tight.
      reconcileLinuxWindows();
    },
  });

  if (!IS_WAYLAND && activeOverlay && !activeOverlay.isDestroyed()) {
    // Tell the persistent overlay's renderer so it shows/hides its DOM cursor.
    // (On Wayland the on-demand overlay learns drawing mode via its own
    // did-finish-load.)
    activeOverlay.webContents.send(OVERLAY.DRAWING_MODE_CHANGED, drawingMode);
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
  // Wayland owns bar visibility solely through reconcileLinuxWindows(); a
  // setOpacity(0) dim here would be a second visibility mutator (and is
  // redundant with the reconcile-hide below). So dim-by-opacity is the
  // Mac/Win path only.
  if (!IS_WAYLAND) {
    const activeMain = mainWindowsByDisplayId.get(activeDisplayId);
    if (activeMain && !activeMain.isDestroyed()) {
      activeMain.setOpacity(0);
      activeMain.setIgnoreMouseEvents(true, { forward: true });
      dimmedMainForSettings = activeMain;
    }
  }

  // Wayland: hide the bar (and any drawing overlay) via the single coordinator —
  // `linuxControlsHiddenForSettings` is an independent reconcile input from
  // `barHidden`, so it composes cleanly with a user-hidden bar.
  if (IS_WAYLAND) hideLinuxControlsForSettings();

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
    if (IS_WAYLAND) showLinuxControlsAfterSettings();
  });
}

export function closeSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.close();
  }
}

// ─── Show / hide ──────────────────────────────────────────────────────────────

/**
 * Standard-path (non-Wayland) analogue of reconcileLinuxWindows for the user-driven
 * bar visibility. Each display owns its own transparent fullscreen control-bar window
 * (the ball renders only on the active display); they must hide/show together so the
 * single `barHidden` flag stays a true derived state across every display. Toggling
 * only the active display's window would let a display drift out of sync — switching
 * the active display or hot-plugging a monitor while hidden would re-reveal the bar.
 * Settings-open dims the active window via opacity, not visibility, so it composes
 * cleanly with this reconcile.
 *
 * Reveal is gated on `readyMainDisplayIds`: a window created `show:false` owns its
 * own first reveal via the CONTENT_READY handler (which already respects barHidden).
 * Reconcile must not force-show a pre-CONTENT_READY window or DWM may flash an empty
 * transparent frame — the exact hazard the show:false gate exists to prevent. A
 * monitor hot-plugged while the bar is visible hits this: its window is still
 * pre-CONTENT_READY when reconcile runs, so it is left to self-reveal. Hide is
 * applied to every window unconditionally — hiding never flashes.
 */
function reconcileStandardBarWindows() {
  if (IS_WAYLAND) return;
  for (const [id, win] of mainWindowsByDisplayId) {
    if (win.isDestroyed()) continue;
    if (barHidden) {
      if (win.isVisible()) win.hide();
    } else if (!win.isVisible() && readyMainDisplayIds.has(id)) {
      win.show();
    }
  }
}

/**
 * Show the control bar. `barHidden` is the single cross-platform source of truth
 * for the user-driven hide/show (toggleBar shortcut + tray hide). On Wayland the
 * visibility is owned solely by reconcileLinuxWindows() (a direct win.show() here
 * would be a second window-mutating path, violating the single-coordinator rule);
 * elsewhere every per-display window is reconciled to barHidden.
 */
export function showMainWindow() {
  barHidden = false;
  if (IS_WAYLAND) reconcileLinuxWindows();
  else reconcileStandardBarWindows();
  _barHiddenChangedCb?.(false);
}

export function hideMainWindow() {
  barHidden = true;
  if (IS_WAYLAND) reconcileLinuxWindows();
  else reconcileStandardBarWindows();
  _barHiddenChangedCb?.(true);
}

/**
 * Toggle the control bar's hidden state. Meaning is identical on every platform —
 * "hide/show the overlay controls" — wired to the toggleBar global shortcut and,
 * on Wayland, the gsettings desktop keybinding (--toggle-bar). Delegates to
 * show/hideMainWindow so the platform-divergent visibility action and the
 * tray-label sync stay in one place.
 */
export function toggleControlsHidden() {
  if (barHidden) showMainWindow();
  else hideMainWindow();
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
  // Re-derive per-display bar visibility for the new active display: switching
  // displays while the bar is hidden must not re-reveal it on the new display.
  reconcileStandardBarWindows();
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
 * Return all per-display control-bar renderers that consume positioning state
 * and module manifests — one per display (the persistent bar window on Wayland,
 * the fullscreen main window elsewhere; both live in mainWindowsByDisplayId).
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

  // Wayland: track whether a stroke is in progress so setDrawingModeState can
  // refuse to tear the on-demand overlay down mid-stroke (see _strokeActive).
  ipcMain.on(OVERLAY.STROKE_ACTIVE, (_, active) => {
    if (!IS_WAYLAND) return;
    _strokeActive = !!active;
  });

  // Wayland: store the overlay's drawing snapshot (keyed by its display) so it
  // can be replayed when that display's overlay is recreated next session.
  ipcMain.on(OVERLAY.PERSIST_STATE, (event, snapshot) => {
    if (!IS_WAYLAND) return;
    for (const [displayId, overlay] of overlayWindowsByDisplayId) {
      if (!overlay.isDestroyed() && overlay.webContents === event.sender) {
        linuxDrawingSnapshots.set(displayId, snapshot);
        return;
      }
    }
  });

  // Cross-window relay: ControlBar (main window) → overlay window.
  // The renderer-side event-bus is per-window, so cross-window
  // synchronisation goes through these IPC channels.
  ipcMain.on(CONTROL_BAR.TOOL_CHANGED, (_, config) => {
    lastToolConfig = config;
    // Broadcast to all overlay windows — all displays need the active tool.
    for (const win of overlayWindowsByDisplayId.values()) {
      if (!win.isDestroyed()) {
        win.webContents.send(CONTROL_BAR.TOOL_CONFIG_CHANGED, config);
      }
    }
  });

  ipcMain.on(CONTROL_BAR.STROKE_STYLE, (_, style) => {
    lastStrokeStyle = style;
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
