/**
 * While drawing mode hides the OS cursor process-wide (cursor-os), hovering the
 * control bar disables passthrough (ignore=false) and the overlay's DOM cursor
 * hides — so the OS cursor MUST be shown over the bar or the user has no
 * pointer at all there. Re-hiding must happen when passthrough resumes, and
 * none of this applies outside drawing mode.
 *
 * Drives the real SET_IGNORE_MOUSE_EVENTS ipc handler captured from the
 * electron mock and asserts against the mocked cursor-os surface.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => { process.env.XDG_SESSION_TYPE = 'x11'; });

// ─── Shared mock state ──────────────────────────────────────────────────────

const browserWindowInstances = [];
const ipcHandlers = new Map();

function makeWindowMock() {
  let visible = false;
  let destroyed = false;
  const instance = {
    isVisible: vi.fn(() => visible),
    isDestroyed: vi.fn(() => destroyed),
    show: vi.fn(() => { visible = true; }),
    hide: vi.fn(() => { visible = false; }),
    destroy: vi.fn(() => { destroyed = true; }),
    setOpacity: vi.fn(),
    setPosition: vi.fn(),
    getPosition: vi.fn(() => [0, 0]),
    setBounds: vi.fn(),
    moveTop: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    focus: vi.fn(),
    close: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    webContents: {
      ipc: { once: vi.fn() },
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
    getAllDisplays: vi.fn(() => [DISPLAY_A]),
    getPrimaryDisplay: vi.fn(() => DISPLAY_A),
    getCursorScreenPoint: vi.fn(() => ({ x: 10, y: 10 })),
    on: vi.fn(),
  };
  const BrowserWindow = vi.fn().mockImplementation(() => {
    const instance = makeWindowMock();
    browserWindowInstances.push(instance);
    return instance;
  });
  BrowserWindow.fromWebContents = vi.fn(
    (wc) => browserWindowInstances.find((w) => w.webContents === wc) ?? null,
  );
  const app = { isPackaged: false, on: vi.fn() };
  return {
    app,
    BrowserWindow,
    ipcMain: {
      on: vi.fn((channel, cb) => { ipcHandlers.set(channel, cb); }),
      handle: vi.fn((channel, cb) => { ipcHandlers.set(channel, cb); }),
    },
    screen,
  };
});

vi.mock('../../electron/cursor-os.js', () => ({
  initCursorOs: vi.fn(),
  hideOsCursor: vi.fn(),
  showOsCursor: vi.fn(),
}));

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
  CURSOR: { INTERACTIVE_HOVER_CHANGED: 'cursor:interactive-hover-changed' },
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

const DISPLAY_A = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1440, height: 900 },
  workArea: { x: 0, y: 25, width: 1440, height: 875 },
  scaleFactor: 2,
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('drawing mode — OS cursor over the control bar (passthrough toggles)', () => {
  let hideOsCursor;
  let showOsCursor;
  let mainWin;
  let ignoreHandler;
  let setDrawingHandler;

  beforeEach(async () => {
    browserWindowInstances.length = 0;
    ipcHandlers.clear();
    vi.clearAllMocks();
    vi.resetModules();

    ({ hideOsCursor, showOsCursor } = await import('../../electron/cursor-os.js'));
    const wm = await import('../../electron/window-manager.js');
    wm.initWindowManager('http://localhost:5173');
    wm.createMainWindowForDisplay(DISPLAY_A);
    mainWin = browserWindowInstances[0];
    wm.setActiveDisplayId(DISPLAY_A.id);

    ignoreHandler = ipcHandlers.get('window:set-ignore-mouse-events');
    setDrawingHandler = ipcHandlers.get('overlay:set-drawing-mode');
    expect(ignoreHandler).toBeTypeOf('function');
    expect(setDrawingHandler).toBeTypeOf('function');
  });

  function hover(ignore) {
    ignoreHandler({ sender: mainWin.webContents }, ignore);
  }

  it('entering drawing mode hides the OS cursor', () => {
    setDrawingHandler(null, true);
    expect(hideOsCursor).toHaveBeenCalled();
  });

  it('pointer enters the bar (ignore=false) while drawing → OS cursor shows', () => {
    setDrawingHandler(null, true);
    vi.clearAllMocks();

    hover(false);

    expect(showOsCursor).toHaveBeenCalledTimes(1);
    expect(hideOsCursor).not.toHaveBeenCalled();
  });

  it('pointer leaves the bar (ignore=true) while drawing → OS cursor re-hides', () => {
    setDrawingHandler(null, true);
    hover(false);
    vi.clearAllMocks();

    hover(true);

    expect(hideOsCursor).toHaveBeenCalledTimes(1);
    expect(showOsCursor).not.toHaveBeenCalled();
  });

  it('outside drawing mode the passthrough toggle never touches the OS cursor', () => {
    hover(false);
    hover(true);

    expect(showOsCursor).not.toHaveBeenCalled();
    expect(hideOsCursor).not.toHaveBeenCalled();
  });

  it('exiting drawing mode restores the OS cursor even after a bar hover cycle', () => {
    setDrawingHandler(null, true);
    hover(false);
    hover(true);
    vi.clearAllMocks();

    setDrawingHandler(null, false);

    expect(showOsCursor).toHaveBeenCalled();
  });
});
