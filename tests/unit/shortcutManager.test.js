/**
 * shortcut-manager unit tests.
 *
 * Two responsibilities under test:
 *   1. Pre-registers built-in shortcuts (drawing-mode toggle, undo, redo)
 *      with provided callbacks; reports conflicts.
 *   2. Listens to MODULE.REGISTER_SHORTCUT IPC for renderer-side modules
 *      that contribute additional shortcuts via system.shortcuts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

const ipcHandlers = new Map();
const ipcInvokeHandlers = new Map();

vi.mock('electron', () => ({
  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
  },
  ipcMain: {
    on: vi.fn((channel, handler) => {
      ipcHandlers.set(channel, handler);
    }),
    handle: vi.fn((channel, handler) => {
      ipcInvokeHandlers.set(channel, handler);
    }),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  // The members below are only used when a test loads electron/main.js.
  app: {
    isPackaged: false,
    on: vi.fn(),
    setPath: vi.fn(),
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
    getAllDisplays: vi.fn(() => []),
    getPrimaryDisplay: vi.fn(() => ({ id: 1 })),
    on: vi.fn(),
  },
}));

/** Windows the mocked window manager reports; tests reassign these. */
const managedWindows = { overlay: null, main: null };

vi.mock('../../electron/window-manager.js', () => ({
  initWindowManager: vi.fn(),
  createMainWindowForDisplay: vi.fn(),
  createOverlayWindowForDisplay: vi.fn(),
  showMainWindow: vi.fn(),
  hideMainWindow: vi.fn(),
  toggleControlsHidden: vi.fn(),
  createSettingsWindow: vi.fn(),
  toggleDrawingMode: vi.fn(),
  getMainWindow: vi.fn(() => managedWindows.main),
  getOverlayWindow: vi.fn(() => managedWindows.overlay),
  getAllMainWindows: vi.fn(() => []),
  getAllOverlayWindows: vi.fn(() => []),
  setActiveDisplayId: vi.fn(),
  setDrawingModeChangedListener: vi.fn(),
  setBarHiddenChangedListener: vi.fn(),
  applyLinuxWindowPositioning: vi.fn(),
  destroyAllWindowsForUpdate: vi.fn(),
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
vi.mock('../../electron/config-loader.js', () => ({ initConfigLoader: vi.fn(), getAppConfig: vi.fn() }));
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
  processIntent: vi.fn(),
  getState: vi.fn(),
}));
vi.mock('../../electron/transparent-render-probe.js', () => ({ probeTransparentRendering: vi.fn() }));
vi.mock('../../electron/renderer-ready-watchdog.js', () => ({
  createRendererReadyWatchdog: vi.fn(),
  resolveTimeoutMs: vi.fn(),
}));

const DEFAULT_SHORTCUTS_FIXTURE = {
  toggleDrawingMode: 'CommandOrControl+Shift+A',
  toggleBar: 'CommandOrControl+Shift+H',
  quitApp: 'CommandOrControl+Q',
  undo: 'CommandOrControl+Z',
  redo: 'CommandOrControl+Shift+Z',
};

vi.mock('../../electron/settings-store.js', () => ({
  DEFAULT_SHORTCUTS: DEFAULT_SHORTCUTS_FIXTURE,
  getShortcuts: vi.fn(() => ({ ...DEFAULT_SHORTCUTS_FIXTURE })),
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

let registerShortcut;
let unregisterAllShortcuts;
let initShortcutManager;
let mockGlobalShortcut;
let mockIpcMain;

beforeEach(async () => {
  vi.resetModules();
  ipcHandlers.clear();
  ipcInvokeHandlers.clear();
  const electron = await import('electron');
  mockGlobalShortcut = electron.globalShortcut;
  mockIpcMain = electron.ipcMain;
  mockGlobalShortcut.register.mockReturnValue(true);

  const store = await import('../../electron/settings-store.js');
  store.getShortcuts.mockReturnValue({ ...DEFAULT_SHORTCUTS_FIXTURE });
  store.setShortcut.mockClear();
  store.resetShortcut.mockClear();
  store.getModuleShortcuts.mockReturnValue({});
  store.setModuleShortcut.mockClear();
  store.resetModuleShortcut.mockClear();

  const mod = await import('../../electron/shortcut-manager.js');
  registerShortcut = mod.registerShortcut;
  unregisterAllShortcuts = mod.unregisterAllShortcuts;
  initShortcutManager = mod.initShortcutManager;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('registerShortcut', () => {
  it('returns true on successful registration', () => {
    mockGlobalShortcut.register.mockReturnValue(true);
    const result = registerShortcut('CommandOrControl+Alt+J', vi.fn());
    expect(result).toBe(true);
    expect(mockGlobalShortcut.register).toHaveBeenCalledWith(
      'CommandOrControl+Alt+J',
      expect.any(Function),
    );
  });

  it('returns false when globalShortcut.register fails', () => {
    mockGlobalShortcut.register.mockReturnValue(false);
    const result = registerShortcut('CommandOrControl+Alt+J', vi.fn());
    expect(result).toBe(false);
  });

  it('returns false (does NOT throw) when globalShortcut.register throws on an unparseable accelerator', () => {
    // Electron throws — rather than returning false — on tokens it can't parse
    // (e.g. the literal "Backslash"). An unguarded throw would propagate through
    // initShortcutManager and crash startup via the main.js init chain.
    mockGlobalShortcut.register.mockImplementation(() => {
      throw new Error('conversion failure from CommandOrControl+Shift+Backslash');
    });
    expect(() => registerShortcut('CommandOrControl+Shift+Backslash', vi.fn())).not.toThrow();
    expect(registerShortcut('CommandOrControl+Shift+Backslash', vi.fn())).toBe(false);
  });

  it('initShortcutManager survives a built-in accelerator that throws (no crash, reports conflict)', () => {
    mockGlobalShortcut.register.mockImplementation(() => {
      throw new Error('conversion failure');
    });
    const onShortcutConflict = vi.fn();
    expect(() => initShortcutManager({ onShortcutConflict })).not.toThrow();
    expect(onShortcutConflict).toHaveBeenCalled();
  });

  it('flags a built-in that failed to register in shortcuts:get-conflicts', async () => {
    mockGlobalShortcut.register.mockImplementation((accel) => accel !== 'CommandOrControl+Z');
    initShortcutManager();
    const get = ipcInvokeHandlers.get('shortcuts:get-conflicts');
    expect(await get()).toEqual(['undo']);
  });

  it('lets the user rebind a built-in whose default key failed to register, and clears its flag', async () => {
    mockGlobalShortcut.register.mockImplementation((accel) => accel !== 'CommandOrControl+Z');
    initShortcutManager();
    const store = await import('../../electron/settings-store.js');
    const set = ipcInvokeHandlers.get('shortcuts:set');

    const result = await set({}, { id: 'undo', accelerator: 'CommandOrControl+Alt+U' });

    expect(result).toEqual({ ok: true });
    expect(store.setShortcut).toHaveBeenCalledWith('undo', 'CommandOrControl+Alt+U');
    expect(await ipcInvokeHandlers.get('shortcuts:get-conflicts')()).toEqual([]);
  });

  it('rejects double-registration (does not call globalShortcut.register twice)', () => {
    registerShortcut('CommandOrControl+Alt+J', vi.fn());
    const result = registerShortcut('CommandOrControl+Alt+J', vi.fn());
    expect(result).toBe(false);
    expect(mockGlobalShortcut.register).toHaveBeenCalledTimes(1);
  });
});

describe('unregisterAllShortcuts', () => {
  it('calls globalShortcut.unregisterAll', () => {
    unregisterAllShortcuts();
    expect(mockGlobalShortcut.unregisterAll).toHaveBeenCalled();
  });

  it('clears internal map so the same accelerator can be re-registered', () => {
    registerShortcut('CommandOrControl+Alt+J', vi.fn());
    unregisterAllShortcuts();
    const result = registerShortcut('CommandOrControl+Alt+J', vi.fn());
    expect(result).toBe(true);
  });
});

describe('initShortcutManager', () => {
  it('registers Cmd+Shift+A, Cmd+Z, Cmd+Shift+Z by default', () => {
    initShortcutManager();
    expect(mockGlobalShortcut.register).toHaveBeenCalledWith(
      'CommandOrControl+Shift+A',
      expect.any(Function),
    );
    expect(mockGlobalShortcut.register).toHaveBeenCalledWith(
      'CommandOrControl+Z',
      expect.any(Function),
    );
    expect(mockGlobalShortcut.register).toHaveBeenCalledWith(
      'CommandOrControl+Shift+Z',
      expect.any(Function),
    );
  });

  it('subscribes to MODULE.REGISTER_SHORTCUT and MODULE.UNREGISTER_SHORTCUT IPC', () => {
    initShortcutManager();
    expect(mockIpcMain.on).toHaveBeenCalledWith(
      'module:register-shortcut',
      expect.any(Function),
    );
    expect(mockIpcMain.on).toHaveBeenCalledWith(
      'module:unregister-shortcut',
      expect.any(Function),
    );
  });

  it('triggers onToggleDrawingMode callback when Cmd+Shift+A fires', () => {
    const toggle = vi.fn();
    initShortcutManager({ onToggleDrawingMode: toggle });
    const handler = mockGlobalShortcut.register.mock.calls.find(
      ([accel]) => accel === 'CommandOrControl+Shift+A',
    )[1];
    handler();
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('triggers onUndo callback when Cmd+Z fires', () => {
    const onUndo = vi.fn();
    initShortcutManager({ onUndo });
    const handler = mockGlobalShortcut.register.mock.calls.find(
      ([accel]) => accel === 'CommandOrControl+Z',
    )[1];
    handler();
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('triggers onRedo callback when Cmd+Shift+Z fires', () => {
    const onRedo = vi.fn();
    initShortcutManager({ onRedo });
    const handler = mockGlobalShortcut.register.mock.calls.find(
      ([accel]) => accel === 'CommandOrControl+Shift+Z',
    )[1];
    handler();
    expect(onRedo).toHaveBeenCalledOnce();
  });
});

describe('module:register-shortcut IPC handler', () => {
  it('registers the accelerator on a valid payload', () => {
    initShortcutManager();
    mockGlobalShortcut.register.mockClear();
    const handler = ipcHandlers.get('module:register-shortcut');
    handler({}, { id: 'mod/foo', keys: 'CommandOrControl+Shift+F' });
    expect(mockGlobalShortcut.register).toHaveBeenCalledWith(
      'CommandOrControl+Shift+F',
      expect.any(Function),
    );
  });

  it('rejects duplicate id without registering', () => {
    initShortcutManager();
    mockGlobalShortcut.register.mockClear();
    const handler = ipcHandlers.get('module:register-shortcut');
    handler({}, { id: 'mod/foo', keys: 'CommandOrControl+A' });
    handler({}, { id: 'mod/foo', keys: 'CommandOrControl+B' });
    expect(mockGlobalShortcut.register).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed payloads', () => {
    initShortcutManager();
    mockGlobalShortcut.register.mockClear();
    const handler = ipcHandlers.get('module:register-shortcut');
    handler({}, null);
    handler({}, { id: 123, keys: 'X' });
    handler({}, { id: 'ok', keys: 456 });
    expect(mockGlobalShortcut.register).not.toHaveBeenCalled();
  });
});

describe('module:unregister-shortcut IPC handler', () => {
  it('removes the accelerator and the id mapping', () => {
    initShortcutManager();
    const reg = ipcHandlers.get('module:register-shortcut');
    const unreg = ipcHandlers.get('module:unregister-shortcut');

    reg({}, { id: 'mod/foo', keys: 'CommandOrControl+G' });
    unreg({}, { id: 'mod/foo' });

    expect(mockGlobalShortcut.unregister).toHaveBeenCalledWith('CommandOrControl+G');

    // Re-registering the same id should now succeed.
    mockGlobalShortcut.register.mockClear();
    reg({}, { id: 'mod/foo', keys: 'CommandOrControl+H' });
    expect(mockGlobalShortcut.register).toHaveBeenCalledWith(
      'CommandOrControl+H',
      expect.any(Function),
    );
  });

  it('is a no-op for unknown ids', () => {
    initShortcutManager();
    const unreg = ipcHandlers.get('module:unregister-shortcut');
    expect(() => unreg({}, { id: 'nope' })).not.toThrow();
    expect(mockGlobalShortcut.unregister).not.toHaveBeenCalled();
  });
});

describe('shortcuts:* IPC handlers', () => {
  it('shortcuts:get returns the current map', async () => {
    initShortcutManager();
    const get = ipcInvokeHandlers.get('shortcuts:get');
    expect(await get()).toEqual(DEFAULT_SHORTCUTS_FIXTURE);
  });

  it('shortcuts:set rebinds the built-in and persists on success', async () => {
    initShortcutManager();
    const store = await import('../../electron/settings-store.js');
    const set = ipcInvokeHandlers.get('shortcuts:set');

    mockGlobalShortcut.register.mockClear();
    mockGlobalShortcut.unregister.mockClear();
    mockGlobalShortcut.register.mockReturnValue(true);

    const result = await set({}, { id: 'undo', accelerator: 'CommandOrControl+Alt+U' });

    expect(result).toEqual({ ok: true });
    expect(mockGlobalShortcut.register).toHaveBeenCalledWith(
      'CommandOrControl+Alt+U',
      expect.any(Function),
    );
    expect(mockGlobalShortcut.unregister).toHaveBeenCalledWith('CommandOrControl+Z');
    expect(store.setShortcut).toHaveBeenCalledWith('undo', 'CommandOrControl+Alt+U');
  });

  it('shortcuts:set rejects invalid payloads', async () => {
    initShortcutManager();
    const set = ipcInvokeHandlers.get('shortcuts:set');
    expect(await set({}, null)).toEqual({ ok: false, error: 'Invalid payload' });
    expect(await set({}, { id: 'undo' })).toEqual({ ok: false, error: 'Invalid payload' });
  });

  it('shortcuts:set leaves the OLD binding intact when the new accelerator fails to register (rollback)', async () => {
    initShortcutManager();
    const store = await import('../../electron/settings-store.js');
    const set = ipcInvokeHandlers.get('shortcuts:set');

    mockGlobalShortcut.register.mockClear();
    mockGlobalShortcut.unregister.mockClear();
    // Simulate OS / another-app collision: globalShortcut.register returns false.
    mockGlobalShortcut.register.mockReturnValue(false);

    const result = await set({}, { id: 'undo', accelerator: 'CommandOrControl+Alt+U' });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('CommandOrControl+Alt+U');
    // Critical: old undo binding (Cmd+Z) MUST NOT be released on failure.
    expect(mockGlobalShortcut.unregister).not.toHaveBeenCalledWith('CommandOrControl+Z');
    // Persistence must not be touched on failure.
    expect(store.setShortcut).not.toHaveBeenCalled();
  });

  it('shortcuts:set rejects new accelerator that collides with another built-in (no state corruption)', async () => {
    initShortcutManager();
    const store = await import('../../electron/settings-store.js');
    const set = ipcInvokeHandlers.get('shortcuts:set');

    mockGlobalShortcut.register.mockClear();
    mockGlobalShortcut.unregister.mockClear();
    mockGlobalShortcut.register.mockReturnValue(true);

    // Try to set undo to toggleDrawingMode's accelerator (Cmd+Shift+A is taken).
    const result = await set({}, { id: 'undo', accelerator: 'CommandOrControl+Shift+A' });

    expect(result.ok).toBe(false);
    // No call to globalShortcut.register because in-memory bookkeeping
    // already detected the duplicate.
    expect(mockGlobalShortcut.register).not.toHaveBeenCalled();
    // Old undo binding still intact.
    expect(mockGlobalShortcut.unregister).not.toHaveBeenCalledWith('CommandOrControl+Z');
    expect(store.setShortcut).not.toHaveBeenCalled();
  });

  it('shortcuts:set does not touch globalShortcut when new accelerator equals the current one', async () => {
    initShortcutManager();
    const set = ipcInvokeHandlers.get('shortcuts:set');

    mockGlobalShortcut.register.mockClear();
    mockGlobalShortcut.unregister.mockClear();

    const result = await set({}, { id: 'undo', accelerator: 'CommandOrControl+Z' });

    expect(result).toEqual({ ok: true });
    expect(mockGlobalShortcut.register).not.toHaveBeenCalled();
    expect(mockGlobalShortcut.unregister).not.toHaveBeenCalled();
  });

  it('shortcuts:reset rebinds to default and calls resetShortcut', async () => {
    // Start with a non-default user shortcut for undo.
    const store = await import('../../electron/settings-store.js');
    store.getShortcuts.mockReturnValue({
      ...DEFAULT_SHORTCUTS_FIXTURE,
      undo: 'CommandOrControl+Alt+U',
    });
    initShortcutManager();

    const reset = ipcInvokeHandlers.get('shortcuts:reset');
    mockGlobalShortcut.register.mockClear();
    mockGlobalShortcut.unregister.mockClear();
    mockGlobalShortcut.register.mockReturnValue(true);

    const result = await reset({}, { id: 'undo' });

    expect(result).toEqual({ ok: true });
    expect(mockGlobalShortcut.register).toHaveBeenCalledWith(
      'CommandOrControl+Z',
      expect.any(Function),
    );
    expect(mockGlobalShortcut.unregister).toHaveBeenCalledWith('CommandOrControl+Alt+U');
    expect(store.resetShortcut).toHaveBeenCalledWith('undo');
  });

  it('shortcuts:reset rejects unknown id', async () => {
    initShortcutManager();
    const reset = ipcInvokeHandlers.get('shortcuts:reset');
    const result = await reset({}, { id: 'doesNotExist' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Unknown shortcut id');
  });
});

describe('module shortcut trigger target and registrant counting', () => {
  const PLUGIN_ID = '@acme/arrow/pick';
  const PLUGIN_KEYS = 'CommandOrControl+Alt+T';

  const makeWindow = () => ({
    isDestroyed: vi.fn(() => false),
    webContents: { send: vi.fn() },
  });
  const makeSender = (id) => Object.assign(new EventEmitter(), { id });

  it('AC-11 a trigger is sent only to the resolved target window (overlay when present, else main)', async () => {
    const overlay = makeWindow();
    const main = makeWindow();
    const { BrowserWindow } = await import('electron');
    BrowserWindow.getAllWindows.mockReturnValue([overlay, main]);
    let target = overlay;
    initShortcutManager({ resolveShortcutTarget: () => target });

    ipcHandlers.get('module:register-shortcut')(
      { sender: makeSender(1) },
      { id: PLUGIN_ID, keys: PLUGIN_KEYS },
    );
    const trigger = mockGlobalShortcut.register.mock.calls.find(([accel]) => accel === PLUGIN_KEYS)[1];

    trigger();
    expect(overlay.webContents.send).toHaveBeenCalledTimes(1);
    expect(overlay.webContents.send).toHaveBeenCalledWith('module:shortcut-triggered', { id: PLUGIN_ID });
    expect(main.webContents.send).not.toHaveBeenCalled();

    target = main;
    trigger();
    expect(main.webContents.send).toHaveBeenCalledTimes(1);
    expect(main.webContents.send).toHaveBeenCalledWith('module:shortcut-triggered', { id: PLUGIN_ID });
    expect(overlay.webContents.send).toHaveBeenCalledTimes(1);

    // Wiring: main.js passes a resolveShortcutTarget backed by the window manager —
    // a live overlay wins; with no overlay or a destroyed one the main window is used.
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    const wm = await import('../../electron/window-manager.js');
    const wiredOverlay = makeWindow();
    const wiredMain = makeWindow();
    managedWindows.overlay = wiredOverlay;
    managedWindows.main = wiredMain;
    await import('../../electron/main.js');
    await vi.waitFor(() => expect(wm.setActiveDisplayId).toHaveBeenCalled());

    const WIRED_ID = '@acme/arrow/other';
    const WIRED_KEYS = 'CommandOrControl+Alt+U';
    ipcHandlers.get('module:register-shortcut')({ sender: makeSender(3) }, { id: WIRED_ID, keys: WIRED_KEYS });
    const wiredTrigger = mockGlobalShortcut.register.mock.calls.find(([accel]) => accel === WIRED_KEYS)[1];

    wiredTrigger();
    expect(wiredOverlay.webContents.send).toHaveBeenCalledTimes(1);
    expect(wiredOverlay.webContents.send).toHaveBeenCalledWith('module:shortcut-triggered', { id: WIRED_ID });
    expect(wiredMain.webContents.send).not.toHaveBeenCalled();

    managedWindows.overlay = null;
    wiredTrigger();
    expect(wiredMain.webContents.send).toHaveBeenCalledTimes(1);
    expect(wiredMain.webContents.send).toHaveBeenCalledWith('module:shortcut-triggered', { id: WIRED_ID });

    managedWindows.overlay = { ...makeWindow(), isDestroyed: vi.fn(() => true) };
    wiredTrigger();
    expect(wiredMain.webContents.send).toHaveBeenCalledTimes(2);
    expect(managedWindows.overlay.webContents.send).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it('AC-11 the global binding survives until the last registering renderer unregisters or is destroyed', () => {
    initShortcutManager();
    const register = ipcHandlers.get('module:register-shortcut');
    const unregister = ipcHandlers.get('module:unregister-shortcut');
    const first = makeSender(1);
    const second = makeSender(2);
    mockGlobalShortcut.register.mockClear();

    register({ sender: first }, { id: PLUGIN_ID, keys: PLUGIN_KEYS });
    register({ sender: second }, { id: PLUGIN_ID, keys: PLUGIN_KEYS });
    expect(mockGlobalShortcut.register).toHaveBeenCalledTimes(1);

    unregister({ sender: first }, { id: PLUGIN_ID });
    expect(mockGlobalShortcut.unregister).not.toHaveBeenCalledWith(PLUGIN_KEYS);

    second.emit('destroyed');
    expect(mockGlobalShortcut.unregister).toHaveBeenCalledWith(PLUGIN_KEYS);
  });

  it('AC-11 regression: an unregister from a renderer that never registered the id does not release the binding', () => {
    initShortcutManager();
    const register = ipcHandlers.get('module:register-shortcut');
    const unregister = ipcHandlers.get('module:unregister-shortcut');
    const stranger = makeSender(9);
    mockGlobalShortcut.unregister.mockClear();

    // Registered by an event without a sender: no registrant record exists for the id.
    register({}, { id: PLUGIN_ID, keys: PLUGIN_KEYS });
    unregister({ sender: stranger }, { id: PLUGIN_ID });
    expect(mockGlobalShortcut.unregister).not.toHaveBeenCalledWith(PLUGIN_KEYS);

    // The same sender-less path that registered it can still release it.
    unregister({}, { id: PLUGIN_ID });
    expect(mockGlobalShortcut.unregister).toHaveBeenCalledWith(PLUGIN_KEYS);
  });
});

describe('drawing-scoped module shortcuts', () => {
  const registerFromRenderer = (payload) => ipcHandlers.get('module:register-shortcut')({}, payload);

  it('does not grab the key from the OS while drawing mode is off', () => {
    initShortcutManager();
    mockGlobalShortcut.register.mockClear();
    registerFromRenderer({ id: 'mod/pen', keys: 'P', scope: 'drawing' });
    expect(mockGlobalShortcut.register).not.toHaveBeenCalled();
  });

  it('grabs the key on entering drawing mode and releases it on exit', async () => {
    initShortcutManager();
    const { setDrawingScopeActive } = await import('../../electron/shortcut-manager.js');
    registerFromRenderer({ id: 'mod/pen', keys: 'P', scope: 'drawing' });
    mockGlobalShortcut.register.mockClear();

    setDrawingScopeActive(true);
    expect(mockGlobalShortcut.register).toHaveBeenCalledWith('P', expect.any(Function));

    setDrawingScopeActive(false);
    expect(mockGlobalShortcut.unregister).toHaveBeenCalledWith('P');
  });

  it('binds immediately when registered while drawing mode is already on', async () => {
    initShortcutManager();
    const { setDrawingScopeActive } = await import('../../electron/shortcut-manager.js');
    setDrawingScopeActive(true);
    mockGlobalShortcut.register.mockClear();
    registerFromRenderer({ id: 'mod/pen', keys: 'P', scope: 'drawing' });
    expect(mockGlobalShortcut.register).toHaveBeenCalledWith('P', expect.any(Function));
  });

  it('keeps global-scope shortcuts bound regardless of drawing mode', async () => {
    initShortcutManager();
    const { setDrawingScopeActive } = await import('../../electron/shortcut-manager.js');
    registerFromRenderer({ id: 'mod/g', keys: 'CommandOrControl+Shift+G', scope: 'global' });
    setDrawingScopeActive(true);
    setDrawingScopeActive(false);
    expect(mockGlobalShortcut.unregister).not.toHaveBeenCalledWith('CommandOrControl+Shift+G');
  });

  it('does not re-grab drawing keys on resume when drawing mode is off', () => {
    initShortcutManager();
    registerFromRenderer({ id: 'mod/pen', keys: 'P', scope: 'drawing' });
    const setSuspended = ipcHandlers.get('shortcuts:set-suspended');
    setSuspended({}, true);
    mockGlobalShortcut.register.mockClear();
    setSuspended({}, false);
    expect(mockGlobalShortcut.register).not.toHaveBeenCalledWith('P', expect.any(Function));
    expect(mockGlobalShortcut.register).toHaveBeenCalledWith('CommandOrControl+Z', expect.any(Function));
  });

  it('rejects rebinding to a key another drawing shortcut already holds', async () => {
    initShortcutManager();
    registerFromRenderer({ id: 'mod/pen', keys: 'P', scope: 'drawing' });
    registerFromRenderer({ id: 'mod/line', keys: 'L', scope: 'drawing' });
    const set = ipcInvokeHandlers.get('shortcuts:set');
    const result = await set({}, { id: 'mod/line', accelerator: 'P' });
    expect(result.ok).toBe(false);
  });

  it('rejects rebinding a drawing shortcut onto a built-in accelerator', async () => {
    initShortcutManager();
    registerFromRenderer({ id: 'mod/pen', keys: 'P', scope: 'drawing' });
    const set = ipcInvokeHandlers.get('shortcuts:set');
    const result = await set({}, { id: 'mod/pen', accelerator: 'CommandOrControl+Z' });
    expect(result.ok).toBe(false);
  });

  it('rebinds to a free key and moves the OS binding while drawing', async () => {
    initShortcutManager();
    const { setDrawingScopeActive } = await import('../../electron/shortcut-manager.js');
    registerFromRenderer({ id: 'mod/pen', keys: 'P', scope: 'drawing' });
    setDrawingScopeActive(true);
    mockGlobalShortcut.register.mockClear();
    const set = ipcInvokeHandlers.get('shortcuts:set');
    const result = await set({}, { id: 'mod/pen', accelerator: 'Q' });
    expect(result.ok).toBe(true);
    expect(mockGlobalShortcut.register).toHaveBeenCalledWith('Q', expect.any(Function));
    expect(mockGlobalShortcut.unregister).toHaveBeenCalledWith('P');
  });

  it('flags a drawing shortcut whose key the OS refuses on entry', async () => {
    initShortcutManager();
    const { setDrawingScopeActive } = await import('../../electron/shortcut-manager.js');
    registerFromRenderer({ id: 'mod/pen', keys: 'P', scope: 'drawing' });
    mockGlobalShortcut.register.mockReturnValue(false);
    setDrawingScopeActive(true);
    const conflicts = await ipcInvokeHandlers.get('shortcuts:get-conflicts')();
    expect(conflicts).toContain('mod/pen');
  });
});
