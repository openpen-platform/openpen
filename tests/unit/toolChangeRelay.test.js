/**
 * Cross-window tool-change relay in the main process.
 *
 * A tool switch reported by one renderer must reach every other window that
 * shows or consumes the active tool: all overlays (canvas) and all control-bar
 * windows (button highlight), without echoing back to the window that sent it.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => { process.env.XDG_SESSION_TYPE = 'x11'; });

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

vi.mock('electron', () => {
  const screen = {
    getAllDisplays: vi.fn(() => [DISPLAY_A, DISPLAY_B]),
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
  return {
    app: { isPackaged: false, on: vi.fn() },
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

describe('tool-change relay', () => {
  let CONTROL_BAR;
  let mainA;
  let mainB;
  let overlayA;
  let overlayB;
  let relay;

  beforeEach(async () => {
    browserWindowInstances.length = 0;
    ipcHandlers.clear();
    vi.clearAllMocks();
    vi.resetModules();

    ({ CONTROL_BAR } = await import('../../electron/ipc-channels.js'));
    const wm = await import('../../electron/window-manager.js');
    wm.initWindowManager('http://localhost:5173');
    wm.createMainWindowForDisplay(DISPLAY_A);
    mainA = browserWindowInstances[browserWindowInstances.length - 1];
    wm.createMainWindowForDisplay(DISPLAY_B);
    mainB = browserWindowInstances[browserWindowInstances.length - 1];
    wm.createOverlayWindowForDisplay(DISPLAY_A);
    overlayA = browserWindowInstances[browserWindowInstances.length - 1];
    wm.createOverlayWindowForDisplay(DISPLAY_B);
    overlayB = browserWindowInstances[browserWindowInstances.length - 1];
    wm.setActiveDisplayId(DISPLAY_A.id);

    relay = ipcHandlers.get(CONTROL_BAR.TOOL_CHANGED);
    expect(relay).toBeTypeOf('function');
    for (const w of browserWindowInstances) w.webContents.send.mockClear();
  });

  const sentConfigs = (win) =>
    win.webContents.send.mock.calls
      .filter(([channel]) => channel === CONTROL_BAR.TOOL_CONFIG_CHANGED)
      .map(([, payload]) => payload);

  it('AC-1 a tool change from an overlay reaches every overlay and every control bar except the sender', () => {
    const config = { tool: 'plugin-arrow' };

    relay({ sender: overlayA.webContents }, config);

    expect(sentConfigs(overlayB)).toEqual([config]);
    expect(sentConfigs(mainA)).toEqual([config]);
    expect(sentConfigs(mainB)).toEqual([config]);
    expect(sentConfigs(overlayA)).toEqual([]);
  });
});
