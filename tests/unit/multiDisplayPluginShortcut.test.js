/**
 * A plugin shortcut pressed once must reach the plugin handler once, however
 * many displays are attached. Each display owns its own overlay window (and
 * control-bar window), every one of which loads the plugin and listens for
 * `module:shortcut-triggered`, so a trigger delivered to more than one window
 * runs the handler more than once.
 *
 * The test boots the real main.js wiring with the real window-manager and
 * shortcut-manager, only the Electron surface is mocked. It counts the
 * trigger messages that reach every window the app created.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Standard (X11-like) path: one overlay window per display is created at boot.
vi.hoisted(() => { process.env.XDG_SESSION_TYPE = 'x11'; delete process.env.WAYLAND_DISPLAY; });

const ipcHandlers = new Map();
/** Every window the app constructed, in creation order. */
const windows = [];
let displayList = [];

function makeWindow() {
  let visible = false;
  let destroyed = false;
  const win = {
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
    setFullScreenable: vi.fn(),
    setFocusable: vi.fn(),
    focus: vi.fn(),
    close: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    webContents: {
      ipc: { once: vi.fn(), on: vi.fn() },
      on: vi.fn(),
      once: vi.fn(),
      send: vi.fn(),
      setBackgroundThrottling: vi.fn(),
      openDevTools: vi.fn(),
    },
    on: vi.fn(),
    once: vi.fn(),
  };
  return win;
}

vi.mock('electron', () => ({
  globalShortcut: { register: vi.fn(() => true), unregister: vi.fn(), unregisterAll: vi.fn() },
  ipcMain: {
    on: vi.fn((channel, handler) => { ipcHandlers.set(channel, handler); }),
    handle: vi.fn((channel, handler) => { ipcHandlers.set(channel, handler); }),
  },
  BrowserWindow: Object.assign(
    vi.fn().mockImplementation(() => {
      const win = makeWindow();
      windows.push(win);
      return win;
    }),
    { getAllWindows: vi.fn(() => windows.filter((w) => !w.isDestroyed())) },
  ),
  app: {
    isPackaged: false,
    on: vi.fn(),
    setPath: vi.fn(),
    getPath: vi.fn(() => '.'),
    getVersion: vi.fn(() => '0.0.0'),
    getLocale: vi.fn(() => 'en'),
    quit: vi.fn(),
    exit: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
    disableHardwareAcceleration: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    commandLine: { appendSwitch: vi.fn() },
  },
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
  net: { fetch: vi.fn() },
  session: {
    defaultSession: { webRequest: { onBeforeSendHeaders: vi.fn(), onCompleted: vi.fn() } },
  },
  screen: {
    getAllDisplays: vi.fn(() => displayList),
    getPrimaryDisplay: vi.fn(() => displayList[0]),
    getCursorScreenPoint: vi.fn(() => ({ x: 10, y: 10 })),
    on: vi.fn(),
  },
}));

vi.mock('../../electron/cursor-os.js', () => ({
  initCursorOs: vi.fn(),
  hideOsCursor: vi.fn(),
  showOsCursor: vi.fn(),
}));
vi.mock('electron-log/main.js', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock('../../electron/tray-manager.js', () => ({
  initTrayManager: vi.fn(),
  setTrayWarning: vi.fn(),
  setTrayDrawingMode: vi.fn(),
  setTrayBarHidden: vi.fn(),
}));
vi.mock('../../electron/screen-capture-manager.js', () => ({ initScreenCaptureManager: vi.fn() }));
vi.mock('../../electron/diagnostics-manager.js', () => ({ initDiagnosticsManager: vi.fn() }));
vi.mock('../../electron/update-manager.js', () => ({ initUpdateManager: vi.fn() }));
vi.mock('../../electron/plugin-meta-manager.js', () => ({ initPluginMetaManager: vi.fn() }));
vi.mock('../../electron/i18n/index.js', () => ({ initI18n: vi.fn() }));
vi.mock('../../electron/config-loader.js', () => ({
  initConfigLoader: vi.fn(),
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
  initModuleManifestLoader: vi.fn(),
  sendModuleManifests: vi.fn(),
  resolvePluginFilePath: vi.fn(),
}));
vi.mock('../../electron/plugin-manager-bridge.js', () => ({ initPluginManagerBridge: vi.fn() }));
vi.mock('../../electron/audit-log.js', () => ({
  createAuditLog: vi.fn(() => ({ append: vi.fn(), updateByRequestId: vi.fn() })),
}));
vi.mock('../../electron/logger.js', () => ({
  initLogger: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../electron/positioning-engine.js', () => ({
  initPositioningEngine: vi.fn(),
  processIntent: vi.fn(() => Promise.resolve()),
  getState: vi.fn(),
}));
vi.mock('../../electron/transparent-render-probe.js', () => ({ probeTransparentRendering: vi.fn() }));
vi.mock('../../electron/renderer-ready-watchdog.js', () => ({
  createRendererReadyWatchdog: vi.fn(),
  resolveTimeoutMs: vi.fn(),
}));

const SHORTCUTS = {
  toggleDrawingMode: 'CommandOrControl+Shift+A',
  toggleBar: 'CommandOrControl+Shift+B',
  undo: 'CommandOrControl+Z',
  redo: 'CommandOrControl+Shift+Z',
  quitApp: 'CommandOrControl+Shift+Q',
};
vi.mock('../../electron/settings-store.js', () => ({
  DEFAULT_SHORTCUTS: SHORTCUTS,
  getShortcuts: vi.fn(() => ({ ...SHORTCUTS })),
  setShortcut: vi.fn(),
  resetShortcut: vi.fn(),
  getModuleShortcuts: vi.fn(() => ({})),
  setModuleShortcut: vi.fn(),
  resetModuleShortcut: vi.fn(),
  initSettingsStore: vi.fn(),
  getSetting: vi.fn(() => undefined),
  updateSettings: vi.fn(),
  flushWrites: vi.fn(),
}));

const makeDisplay = (id, x, width) => ({
  id,
  bounds: { x, y: 0, width, height: 1080 },
  workArea: { x, y: 0, width, height: 1080 },
  scaleFactor: 1,
});

const PLUGIN_ID = '@acme/spotlight/toggle';
const PLUGIN_KEYS = 'CommandOrControl+Alt+L';
const TRIGGER_CHANNEL = 'module:shortcut-triggered';

/** Total plugin-trigger messages delivered to every window the app created. */
function deliveredTriggers() {
  return windows.reduce(
    (sum, w) => sum + w.webContents.send.mock.calls.filter(([channel, payload]) => channel === TRIGGER_CHANNEL && payload?.id === PLUGIN_ID).length,
    0,
  );
}

/** Boot main.js and press the plugin shortcut once. */
async function bootAndPressOnce(displays) {
  displayList = displays;
  const electron = await import('electron');
  await import('../../electron/main.js');
  await vi.waitFor(() => expect(electron.screen.getPrimaryDisplay).toHaveBeenCalled());
  await vi.waitFor(() => expect(electron.globalShortcut.register).toHaveBeenCalled());

  const sender = Object.assign({ on: vi.fn(), once: vi.fn(), id: 1 });
  ipcHandlers.get('module:register-shortcut')({ sender }, { id: PLUGIN_ID, keys: PLUGIN_KEYS });
  const press = electron.globalShortcut.register.mock.calls.find(([accel]) => accel === PLUGIN_KEYS)[1];
  press();
}

describe('plugin shortcut delivery across displays', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    windows.length = 0;
    ipcHandlers.clear();
    vi.spyOn(process, 'exit').mockImplementation(() => undefined);
  });

  it('two displays, one press: the plugin handler runs once', async () => {
    await bootAndPressOnce([makeDisplay(1, 0, 1920), makeDisplay(2, 1920, 1920)]);
    // Two overlays and two control-bar windows exist: four renderers could react.
    expect(windows.length).toBeGreaterThanOrEqual(4);
    expect(deliveredTriggers()).toBe(1);
  });

  it('one display, one press: the plugin handler still runs once', async () => {
    await bootAndPressOnce([makeDisplay(1, 0, 1920)]);
    expect(deliveredTriggers()).toBe(1);
  });
});
