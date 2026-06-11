/**
 * Verifies invariant #4 of issue #50: on a native Wayland session,
 * reconcileStandardBarWindows() MUST early-return so it never mutates windows —
 * visibility is owned solely by reconcileLinuxWindows(), which shows ONLY the
 * active display's bar (per deriveLinuxWindowState). If the standard reconcile
 * leaked into the Wayland path it would show EVERY display's bar, so asserting
 * "only the active display's window is visible" proves the early-return holds.
 *
 * IS_WAYLAND is resolved once at window-manager load from is-wayland-session.js,
 * which keys off process.platform === 'linux'. To force the Wayland branch on
 * any host OS this module mocks is-wayland-session.js to export true, so it lives
 * in its own file (separate module instance) from the standard-path suite.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../electron/is-wayland-session.js', () => ({
  IS_WAYLAND_SESSION: true,
}));

const browserWindowInstances = [];
const contentReadyByWindow = new Map();
let displayList = [];

const CONTENT_READY_CHANNEL = 'window:content-ready';

function makeWindowMock() {
  let visible = false;
  let destroyed = false;
  const instance = {
    isVisible: vi.fn(() => visible),
    isDestroyed: vi.fn(() => destroyed),
    show: vi.fn(() => { visible = true; }),
    hide: vi.fn(() => { visible = false; }),
    destroy: vi.fn(() => { destroyed = true; }),
    setBounds: vi.fn(),
    moveTop: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    focus: vi.fn(),
    close: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    webContents: {
      ipc: {
        once: vi.fn((channel, cb) => {
          if (channel === CONTENT_READY_CHANNEL) contentReadyByWindow.set(instance, cb);
        }),
      },
      on: vi.fn(),
      send: vi.fn(),
      setBackgroundThrottling: vi.fn(),
      openDevTools: vi.fn(),
    },
    on: vi.fn(),
  };
  return instance;
}

vi.mock('electron', () => {
  const screen = {
    getAllDisplays: vi.fn(() => displayList),
    getPrimaryDisplay: vi.fn(() => displayList[0]),
    getCursorScreenPoint: vi.fn(() => ({ x: 10, y: 10 })),
    on: vi.fn(),
  };
  const BrowserWindow = vi.fn().mockImplementation(() => {
    const instance = makeWindowMock();
    browserWindowInstances.push(instance);
    return instance;
  });
  const app = { isPackaged: false };
  return { app, BrowserWindow, ipcMain: { on: vi.fn(), handle: vi.fn() }, screen };
});

vi.mock('../../electron/ipc-channels.js', () => ({
  WINDOW: {
    OPEN_SETTINGS: 'window:open-settings',
    CLOSE_SETTINGS: 'window:close-settings',
    CONTENT_READY: 'window:content-ready',
    SET_POSITION: 'window:set-position',
    GET_DISPLAY_INFO: 'window:get-display-info',
    GET_POSITION: 'window:get-position',
    SET_IGNORE_MOUSE_EVENTS: 'window:set-ignore-mouse-events',
    GET_CURSOR_POSITION: 'window:get-cursor-position',
  },
  OVERLAY: { SET_DRAWING_MODE: 'overlay:set-drawing-mode', DRAWING_MODE_CHANGED: 'overlay:drawing-mode-changed' },
  CONTROL_BAR: { TOOL_CHANGED: 'c:tc', TOOL_CONFIG_CHANGED: 'c:tcc', STROKE_STYLE: 'c:ss', STROKE_STYLE_CHANGED: 'c:ssc', CLEAR_CANVAS: 'c:cc', CLEAR_CANVAS_TRIGGERED: 'c:cct' },
  HISTORY: { UNDO: 'h:u', REDO: 'h:r', TRIGGER_UNDO: 'h:tu', TRIGGER_REDO: 'h:tr', STATE_CHANGED: 'h:sc' },
  POSITIONING: { STATE_CHANGED: 'positioning:state-changed', INTENT: 'positioning:intent', GET_STATE: 'positioning:get-state' },
  CURSOR: { GET_POSITION: 'cursor:get-position' },
}));

vi.mock('../../electron/config-loader.js', () => ({
  getAppConfig: vi.fn(() => ({
    electron: {
      window: {
        mainAlwaysOnTopLevel: 'screen-saver',
        mainAlwaysOnTopRelativeLevel: 1,
        overlayAlwaysOnTopLevel: 'screen-saver',
        overlayAlwaysOnTopRelativeLevel: 0,
      },
      devtools: { enabled: false, openMainWindow: false, openOverlayWindow: false, openSettingsWindow: false },
    },
  })),
}));

vi.mock('../../electron/module-manifest-loader.js', () => ({ sendModuleManifests: vi.fn() }));
vi.mock('../../electron/shortcut-manager.js', () => ({ suspendShortcuts: vi.fn(), resumeShortcuts: vi.fn() }));
vi.mock('electron-log/main.js', () => ({ default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));
vi.mock('../../electron/positioning-engine.js', () => ({ processIntent: vi.fn(() => Promise.resolve()) }));

// Re-imported fresh per test via vi.resetModules (window-manager keeps
// module-level state); bound in beforeEach.
let initWindowManager;
let createMainWindowForDisplay;
let showMainWindow;
let hideMainWindow;
let setActiveDisplayId;

const DISPLAY_A = { id: 1, bounds: { x: 0, y: 0, width: 1440, height: 900 }, workArea: { x: 0, y: 25, width: 1440, height: 875 }, scaleFactor: 2 };
const DISPLAY_B = { id: 2, bounds: { x: 1440, y: 0, width: 1920, height: 1080 }, workArea: { x: 1440, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };

/** Create the Wayland bar window for a display and drive its CONTENT_READY. */
function createAndReady(display) {
  const before = browserWindowInstances.length;
  createMainWindowForDisplay(display);
  const win = browserWindowInstances[before];
  const cb = contentReadyByWindow.get(win);
  if (cb) cb();
  return win;
}

describe('Wayland: reconcileStandardBarWindows early-returns (visibility owned by reconcileLinuxWindows)', () => {
  beforeEach(async () => {
    browserWindowInstances.length = 0;
    contentReadyByWindow.clear();
    displayList = [DISPLAY_A, DISPLAY_B];
    vi.clearAllMocks();
    vi.resetModules();
    ({
      initWindowManager,
      createMainWindowForDisplay,
      showMainWindow,
      hideMainWindow,
      setActiveDisplayId,
    } = await import('../../electron/window-manager.js'));
    initWindowManager('http://localhost:5173');
  });

  it('with two displays visible, only the ACTIVE display bar shows (standard reconcile did NOT show both)', () => {
    // Set the active display before the windows signal CONTENT_READY so the
    // Wayland reconcile (fired from each window's CONTENT_READY) derives from
    // the correct activeId. On Wayland, post-creation active switches are
    // reconciled by the positioning engine (applyLinuxWindowPositioning), not by
    // setActiveDisplayId — which only runs the (early-returning) standard path.
    setActiveDisplayId(DISPLAY_A.id);
    const winA = createAndReady(DISPLAY_A);
    const winB = createAndReady(DISPLAY_B);

    // reconcileLinuxWindows shows only the active display's bar. If the standard
    // reconcile had run on this path it would have shown winB too.
    expect(winA.isVisible()).toBe(true);
    expect(winB.isVisible()).toBe(false);
  });

  it('hideMainWindow on Wayland hides the active bar and switching active does not reveal the standard set', () => {
    setActiveDisplayId(DISPLAY_A.id);
    const winA = createAndReady(DISPLAY_A);
    const winB = createAndReady(DISPLAY_B);
    expect(winA.isVisible()).toBe(true);

    hideMainWindow();
    expect(winA.isVisible()).toBe(false);
    expect(winB.isVisible()).toBe(false);

    winA.show.mockClear();
    winB.show.mockClear();

    // Switching active while hidden: reconcileStandardBarWindows runs after the
    // id update but must early-return on Wayland, so no window is shown.
    setActiveDisplayId(DISPLAY_B.id);
    expect(winA.show).not.toHaveBeenCalled();
    expect(winB.show).not.toHaveBeenCalled();
  });
});
