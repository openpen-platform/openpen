/**
 * Hold-to-draw hides the OS cursor while its key has the mouse. If the display
 * under it is unplugged mid-hold, the overlay is destroyed before the key is
 * released: the OS cursor must come back right then, not stay hidden.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => { process.env.XDG_SESSION_TYPE = 'x11'; });

const browserWindowInstances = [];
const ipcHandlers = new Map();
const screenHandlers = new Map();
let displays = [];

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
    getAllDisplays: vi.fn(() => displays),
    getPrimaryDisplay: vi.fn(() => DISPLAY_A),
    getCursorScreenPoint: vi.fn(() => ({ x: 2000, y: 100 })),
    getDisplayNearestPoint: vi.fn(() => DISPLAY_B),
    on: vi.fn((event, cb) => { screenHandlers.set(event, cb); }),
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
const DISPLAY_B = {
  id: 2,
  bounds: { x: 1440, y: 0, width: 1920, height: 1080 },
  workArea: { x: 1440, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
};

describe('hold-to-draw when its display is removed', () => {
  beforeEach(() => {
    browserWindowInstances.length = 0;
    ipcHandlers.clear();
    screenHandlers.clear();
    displays = [DISPLAY_A, DISPLAY_B];
    vi.clearAllMocks();
    vi.resetModules();
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); });

  it('restores the OS cursor and ends the hold the normal way', async () => {
    const { hideOsCursor, showOsCursor } = await import('../../electron/cursor-os.js');
    const wm = await import('../../electron/window-manager.js');
    wm.initWindowManager('http://localhost:5173');
    wm.setHideStrokesOnExitReader(() => true);
    wm.createOverlayWindowForDisplay(DISPLAY_A);
    wm.createOverlayWindowForDisplay(DISPLAY_B);
    wm.setActiveDisplayId(DISPLAY_A.id);

    wm.setHoldToDraw(true);
    expect(hideOsCursor).toHaveBeenCalledTimes(1);
    expect(showOsCursor).not.toHaveBeenCalled();

    displays = [DISPLAY_A];
    screenHandlers.get('display-removed')();
    vi.advanceTimersByTime(250);
    expect(showOsCursor).toHaveBeenCalledTimes(1);
    // "Hide strokes when leaving" still applies: the remaining overlay hides them.
    const overlayA = browserWindowInstances[0];
    expect(overlayA.webContents.send).toHaveBeenLastCalledWith('overlay:strokes-hidden-changed', true);

    // Releasing the key afterwards changes nothing more.
    wm.setHoldToDraw(false);
    expect(showOsCursor).toHaveBeenCalledTimes(1);
  });
});
