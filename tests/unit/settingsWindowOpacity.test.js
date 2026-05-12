/**
 * Verifies that opening the settings window hides the active main window via
 * setOpacity(0) without moving it, and restores via setOpacity(1) on close.
 * Moving the window off-screen instead would leave it partially visible at
 * the screen edge on platforms that clamp extreme coordinates.
 *
 * Assertions:
 *   - setOpacity(0) is called on the active main window when settings opens.
 *   - setOpacity(1) is called on the active main window when settings closes.
 *   - setPosition is NEVER called on the main window during open/close.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Shared mock instances ────────────────────────────────────────────────────

/**
 * The main window mock — populated once per test suite run by
 * createMainWindowForDisplay's `new BrowserWindow(...)` call.
 * We capture it via the BrowserWindow mock constructor.
 */
const mainWinMock = {
  isDestroyed: vi.fn(() => false),
  setOpacity:  vi.fn(),
  setPosition: vi.fn(),
  getPosition: vi.fn(() => [0, 25]),
  setIgnoreMouseEvents: vi.fn(),
  setAlwaysOnTop: vi.fn(),
  setVisibleOnAllWorkspaces: vi.fn(),
  webContents: {
    ipc: { once: vi.fn() },
    on: vi.fn(),
    send: vi.fn(),
    setBackgroundThrottling: vi.fn(),
  },
  on: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  close: vi.fn(),
  loadURL: vi.fn(() => Promise.resolve()),
};

/** Tracks each `new BrowserWindow(...)` call in order. */
const browserWindowInstances = [];

/** Callbacks registered via `settingsWindow.on('closed', cb)`. */
let settingsClosedCallback = null;

// ─── Electron mock ────────────────────────────────────────────────────────────

vi.mock('electron', () => {
  const screen = {
    getAllDisplays: vi.fn(() => [
      {
        id: 1,
        bounds:   { x: 0, y: 0, width: 1440, height: 900 },
        workArea: { x: 0, y: 25, width: 1440, height: 875 },
        scaleFactor: 2,
      },
    ]),
    getPrimaryDisplay: vi.fn(() => ({
      id: 1,
      bounds:   { x: 0, y: 0, width: 1440, height: 900 },
      workArea: { x: 0, y: 25, width: 1440, height: 875 },
      scaleFactor: 2,
    })),
    getCursorScreenPoint: vi.fn(() => ({ x: 720, y: 462 })),
    on: vi.fn(),
  };

  const BrowserWindow = vi.fn().mockImplementation(() => {
    const instance = {
      isDestroyed: vi.fn(() => false),
      setOpacity:  vi.fn(),
      setPosition: vi.fn(),
      getPosition: vi.fn(() => [0, 25]),
      setIgnoreMouseEvents: vi.fn(),
      setAlwaysOnTop: vi.fn(),
      setVisibleOnAllWorkspaces: vi.fn(),
      webContents: {
        ipc: { once: vi.fn() },
        on: vi.fn(),
        send: vi.fn(),
        setBackgroundThrottling: vi.fn(),
      },
      on: vi.fn().mockImplementation((event, cb) => {
        if (event === 'closed') settingsClosedCallback = cb;
      }),
      show: vi.fn(),
      focus: vi.fn(),
      close: vi.fn(),
      loadURL: vi.fn(() => Promise.resolve()),
    };
    browserWindowInstances.push(instance);
    return instance;
  });

  const app = { isPackaged: false };
  return { app, BrowserWindow, ipcMain: { on: vi.fn(), handle: vi.fn() }, screen };
});

vi.mock('../../electron/ipc-channels.js', () => ({
  WINDOW: {
    OPEN_SETTINGS:         'window:open-settings',
    CLOSE_SETTINGS:        'window:close-settings',
    CONTENT_READY:         'window:content-ready',
    SET_POSITION:          'window:set-position',
    GET_DISPLAY_INFO:      'window:get-display-info',
    GET_POSITION:          'window:get-position',
    SET_IGNORE_MOUSE_EVENTS: 'window:set-ignore-mouse-events',
    GET_CURSOR_POSITION:   'window:get-cursor-position',
  },
  OVERLAY:     { SET_DRAWING_MODE: 'overlay:set-drawing-mode', DRAWING_MODE_CHANGED: 'overlay:drawing-mode-changed' },
  CONTROL_BAR: { TOOL_CHANGED: 'c:tc', TOOL_CONFIG_CHANGED: 'c:tcc', STROKE_STYLE: 'c:ss', STROKE_STYLE_CHANGED: 'c:ssc', CLEAR_CANVAS: 'c:cc', CLEAR_CANVAS_TRIGGERED: 'c:cct' },
  HISTORY:     { UNDO: 'h:u', REDO: 'h:r', TRIGGER_UNDO: 'h:tu', TRIGGER_REDO: 'h:tr', STATE_CHANGED: 'h:sc' },
  POSITIONING: { STATE_CHANGED: 'positioning:state-changed', INTENT: 'positioning:intent', GET_STATE: 'positioning:get-state' },
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

vi.mock('../../electron/module-manifest-loader.js', () => ({
  sendModuleManifests: vi.fn(),
}));

vi.mock('../../electron/shortcut-manager.js', () => ({
  suspendShortcuts: vi.fn(),
  resumeShortcuts:  vi.fn(),
}));

vi.mock('electron-log/main.js', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// ─── Subject ──────────────────────────────────────────────────────────────────

import {
  initWindowManager,
  createMainWindowForDisplay,
  createSettingsWindow,
  closeSettingsWindow,
  setActiveDisplayId,
} from '../../electron/window-manager.js';

// ─── Fixture ──────────────────────────────────────────────────────────────────

const PRIMARY_DISPLAY = {
  id: 1,
  bounds:   { x: 0, y: 0, width: 1440, height: 900 },
  workArea: { x: 0, y: 25, width: 1440, height: 875 },
  scaleFactor: 2,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('createSettingsWindow — opacity-based hide/restore of the active main window', () => {
  let mainWin;
  let settingsWin;

  beforeEach(() => {
    // Reset module-scoped test state before vi.clearAllMocks so the mock
    // implementations (vi.fn(() => false)) survive the clear.
    browserWindowInstances.length = 0;
    settingsClosedCallback = null;

    vi.clearAllMocks();

    initWindowManager('http://localhost:5173');
    // createMainWindowForDisplay registers one BrowserWindow instance — that's mainWin.
    createMainWindowForDisplay(PRIMARY_DISPLAY);
    mainWin = browserWindowInstances[0];
    expect(mainWin).toBeDefined();
    // Activate display 1 so createSettingsWindow routes to mainWin.
    setActiveDisplayId(PRIMARY_DISPLAY.id);
  });

  afterEach(() => {
    // Drain the singleton settingsWindow reference so the next test starts clean.
    // closeSettingsWindow calls win.close(); the mock's 'closed' handler (if any)
    // was registered with a stale cb — we reset settingsClosedCallback manually.
    if (settingsClosedCallback) {
      settingsClosedCallback();
      settingsClosedCallback = null;
    }
  });

  it('calls setOpacity(0) on the main window when settings opens', () => {
    createSettingsWindow();

    // mainWin is the first BrowserWindow created; the settings window is the second.
    expect(mainWin.setOpacity).toHaveBeenCalledWith(0);
  });

  it('does NOT call setPosition on the main window when settings opens', () => {
    createSettingsWindow();

    expect(mainWin.setPosition).not.toHaveBeenCalled();
  });

  it('calls setOpacity(1) on the main window when the settings window closes', () => {
    createSettingsWindow();
    settingsWin = browserWindowInstances[1];

    // Simulate the settings window closing.
    expect(settingsClosedCallback).not.toBeNull();
    settingsClosedCallback();

    expect(mainWin.setOpacity).toHaveBeenCalledWith(1);
  });

  it('does NOT call setPosition on the main window when settings closes', () => {
    createSettingsWindow();
    settingsClosedCallback();

    expect(mainWin.setPosition).not.toHaveBeenCalled();
  });

  it('restores passthrough (setIgnoreMouseEvents true) when settings closes', () => {
    createSettingsWindow();
    settingsClosedCallback();

    expect(mainWin.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
  });

  it('focuses the existing settings window on a second call (no duplicate open)', () => {
    createSettingsWindow();
    settingsWin = browserWindowInstances[1];

    // Second call while settings is already open.
    createSettingsWindow();

    // No third BrowserWindow should be created.
    expect(browserWindowInstances).toHaveLength(2);
    expect(settingsWin.focus).toHaveBeenCalled();
  });

  it('immediately forces passthrough on the dimmed main window when settings opens', () => {
    // Simulate the renderer having previously toggled the main window into
    // input-receiving mode (cursor on UI). Without forcing passthrough at
    // open time, the opacity-0 window would still intercept every click.
    createSettingsWindow();

    const passthroughCalls = mainWin.setIgnoreMouseEvents.mock.calls.filter(
      ([ignore, opts]) => ignore === true && opts?.forward === true,
    );
    expect(passthroughCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('restores the originally dimmed window even after a display hotplug shifts activeDisplayId', () => {
    // Open settings on display 1; main window 1 is dimmed.
    createSettingsWindow();
    const settingsInstance = browserWindowInstances[1];
    expect(mainWin.setOpacity).toHaveBeenCalledWith(0);

    // Hotplug: a second display appears and becomes active. The mock's
    // shared `settingsClosedCallback` gets overwritten by the new main
    // window's own `on('closed', ...)`, so grab the settings window's
    // closed handler directly before that happens.
    const settingsClosed = settingsInstance.on.mock.calls.find(
      ([event]) => event === 'closed',
    )?.[1];
    expect(settingsClosed).toBeTypeOf('function');

    const SECONDARY_DISPLAY = {
      id: 2,
      bounds:   { x: 1440, y: 0, width: 1920, height: 1080 },
      workArea: { x: 1440, y: 0, width: 1920, height: 1080 },
      scaleFactor: 1,
    };
    createMainWindowForDisplay(SECONDARY_DISPLAY);
    const mainWin2 = browserWindowInstances[2];
    setActiveDisplayId(SECONDARY_DISPLAY.id);

    // Reset the setOpacity spy on the original window so we count only the
    // restore call, not the earlier setOpacity(0).
    mainWin.setOpacity.mockClear();
    mainWin2.setOpacity.mockClear();

    // Close settings — restore must target the originally dimmed window.
    settingsClosed();

    expect(mainWin.setOpacity).toHaveBeenCalledWith(1);
    expect(mainWin2.setOpacity).not.toHaveBeenCalled();
  });
});
