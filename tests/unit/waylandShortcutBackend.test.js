/**
 * Wayland plugin-shortcut backends.
 *
 * Three backends decide how a plugin shortcut can reach the app on a Wayland
 * session:
 *   - 'portal'        XDG GlobalShortcuts portal is available; Electron's
 *                     globalShortcut works, no desktop keybinding is needed.
 *   - 'gnome-desktop' no portal but GNOME: each plugin shortcut becomes a
 *                     GNOME custom keybinding that relaunches the app with
 *                     --plugin-shortcut=<namespacedId>.
 *   - 'none'          nothing usable: plugin shortcuts are not registered.
 *
 * main.js is loaded with its collaborators mocked (real shortcut-manager and
 * linux-shortcut). External commands (gsettings, D-Bus probes) go through a
 * mocked child_process.execFile with a stateful fake of the GNOME keybinding
 * store; nothing touches the real desktop or settings.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { createHash } from 'node:crypto';

const ipcHandlers = new Map();
const appHandlers = new Map();

/** Every external command the code under test tried to run. */
const execCalls = [];
/** Whether the mocked session bus exposes the GlobalShortcuts portal. */
let portalPresent = true;

const KEYBINDINGS_SCHEMA = 'org.gnome.settings-daemon.plugins.media-keys';
const KEYBINDING_PATH_PREFIX = '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/';

/** Stateful fake of the GNOME custom-keybinding store. */
const keybindings = { list: [], values: new Map() };

/** Test hooks into the fake gsettings: delay a call, or make writes fail. */
const gsettingsControl = { before: null, failWrites: false };

const overlayWin = { isDestroyed: vi.fn(() => false), webContents: { send: vi.fn() } };
const mainWin = { isDestroyed: vi.fn(() => false), webContents: { send: vi.fn() } };

/** Full paths (forward slashes) where the mocked file system has the app's desktop entry. */
const desktopFiles = new Set();
const DESKTOP_ENTRY_NAME = 'com.openpen.app.desktop';

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal();
  const norm = (p) => String(p).replace(/\\/g, '/');
  const isDesktopEntry = (p) => norm(p).endsWith(`/applications/${DESKTOP_ENTRY_NAME}`);
  const missing = (p) => Object.assign(new Error(`ENOENT: ${norm(p)}`), { code: 'ENOENT' });
  const wrapped = {
    ...actual,
    existsSync: (p) => (isDesktopEntry(p) ? desktopFiles.has(norm(p)) : actual.existsSync(p)),
    accessSync: (p, ...rest) => {
      if (!isDesktopEntry(p)) return actual.accessSync(p, ...rest);
      if (!desktopFiles.has(norm(p))) throw missing(p);
      return undefined;
    },
    statSync: (p, ...rest) => {
      if (!isDesktopEntry(p)) return actual.statSync(p, ...rest);
      if (!desktopFiles.has(norm(p))) throw missing(p);
      return { isFile: () => true };
    },
    promises: {
      ...actual.promises,
      access: async (p, ...rest) => {
        if (!isDesktopEntry(p)) return actual.promises.access(p, ...rest);
        if (!desktopFiles.has(norm(p))) throw missing(p);
        return undefined;
      },
      stat: async (p, ...rest) => {
        if (!isDesktopEntry(p)) return actual.promises.stat(p, ...rest);
        if (!desktopFiles.has(norm(p))) throw missing(p);
        return { isFile: () => true };
      },
    },
  };
  return { ...wrapped, default: wrapped };
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal();
  const norm = (p) => String(p).replace(/\\/g, '/');
  const isDesktopEntry = (p) => norm(p).endsWith(`/applications/${DESKTOP_ENTRY_NAME}`);
  const missing = (p) => Object.assign(new Error(`ENOENT: ${norm(p)}`), { code: 'ENOENT' });
  const wrapped = {
    ...actual,
    access: async (p, ...rest) => {
      if (!isDesktopEntry(p)) return actual.access(p, ...rest);
      if (!desktopFiles.has(norm(p))) throw missing(p);
      return undefined;
    },
    stat: async (p, ...rest) => {
      if (!isDesktopEntry(p)) return actual.stat(p, ...rest);
      if (!desktopFiles.has(norm(p))) throw missing(p);
      return { isFile: () => true };
    },
  };
  return { ...wrapped, default: wrapped };
});

vi.mock('node:child_process', async () => {
  const { promisify } = await import('node:util');
  const parseList = (v) => [...v.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  const unquote = (v) => v.replace(/^"|"$/g, '').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  const ok = (stdout = '') => Promise.resolve({ stdout, stderr: '' });
  const run = async (file, args) => {
    execCalls.push({ file, args });
    if (file === 'gsettings') {
      await gsettingsControl.before?.(args);
      if (gsettingsControl.failWrites && (args[0] === 'set' || args[0] === 'reset')) {
        throw new Error('gsettings write failed');
      }
      const [verb, target, key, value] = args;
      if (verb === 'get') {
        const list = keybindings.list;
        return ok(list.length ? `[${list.map((p) => `'${p}'`).join(', ')}]\n` : '@as []\n');
      }
      if (verb === 'set' && target === KEYBINDINGS_SCHEMA) {
        keybindings.list = parseList(value);
        return ok();
      }
      if (verb === 'set') {
        const p = target.split(':')[1];
        keybindings.values.set(p, { ...(keybindings.values.get(p) ?? {}), [key]: unquote(value) });
        return ok();
      }
      if (verb === 'reset') {
        const p = target.split(':')[1];
        const current = { ...(keybindings.values.get(p) ?? {}) };
        delete current[key];
        keybindings.values.set(p, current);
        return ok();
      }
      return ok();
    }
    // Only a query for the GlobalShortcuts portal's `version` property succeeds.
    const joined = [file, ...args].join(' ');
    if (
      portalPresent &&
      joined.includes('org.freedesktop.portal.GlobalShortcuts') &&
      joined.includes('version')
    ) {
      return ok('u 1\n');
    }
    return Promise.reject(Object.assign(new Error('not available'), { code: 1 }));
  };
  const execFile = vi.fn((file, args, opts, cb) => {
    const callback = [opts, cb].find((f) => typeof f === 'function');
    run(file, args).then(
      (r) => callback(null, r.stdout, r.stderr),
      (e) => callback(e),
    );
  });
  execFile[promisify.custom] = (file, args) => run(file, args);
  return { execFile, default: { execFile } };
});

// The shared IPC validation helper imports electron-log, which loads the real
// electron package; with node:fs mocked above that load cannot find the binary.
vi.mock('electron-log/main.js', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    on: vi.fn((event, handler) => {
      appHandlers.set(event, [...(appHandlers.get(event) ?? []), handler]);
    }),
    setPath: vi.fn(),
    setDesktopName: vi.fn(),
    getVersion: vi.fn(() => '0.0.0'),
    getLocale: vi.fn(() => 'en'),
    quit: vi.fn(),
    exit: vi.fn(),
    requestSingleInstanceLock: vi.fn(() => true),
    disableHardwareAcceleration: vi.fn(),
    whenReady: vi.fn(() => Promise.resolve()),
    commandLine: { appendSwitch: vi.fn() },
  },
  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn(),
    unregisterAll: vi.fn(),
  },
  ipcMain: {
    on: vi.fn((channel, handler) => { ipcHandlers.set(channel, handler); }),
    handle: vi.fn((channel, handler) => { ipcHandlers.set(channel, handler); }),
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
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

const SHORTCUTS_FIXTURE = {
  toggleDrawingMode: 'CommandOrControl+Shift+A',
  toggleBar: 'CommandOrControl+Shift+\\',
  undo: 'CommandOrControl+Z',
  redo: 'CommandOrControl+Shift+Z',
  quitApp: 'CommandOrControl+Q',
};

vi.mock('../../electron/settings-store.js', () => ({
  DEFAULT_SHORTCUTS: SHORTCUTS_FIXTURE,
  getShortcuts: vi.fn(() => ({ ...SHORTCUTS_FIXTURE })),
  setShortcut: vi.fn(),
  resetShortcut: vi.fn(),
  getModuleShortcuts: vi.fn(() => ({})),
  setModuleShortcut: vi.fn(),
  resetModuleShortcut: vi.fn(),
  initSettingsStore: vi.fn(),
  getSetting: vi.fn((key) => (key === 'shortcuts' ? { ...SHORTCUTS_FIXTURE } : undefined)),
  updateSettings: vi.fn(),
  flushWrites: vi.fn(),
}));

vi.mock('../../electron/window-manager.js', () => ({
  initWindowManager: vi.fn(),
  createMainWindowForDisplay: vi.fn(),
  createOverlayWindowForDisplay: vi.fn(),
  showMainWindow: vi.fn(),
  hideMainWindow: vi.fn(),
  toggleControlsHidden: vi.fn(),
  createSettingsWindow: vi.fn(),
  toggleDrawingMode: vi.fn(),
  getMainWindow: vi.fn(() => mainWin),
  getOverlayWindow: vi.fn(() => overlayWin),
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
vi.mock('../../electron/audit-log.js', () => ({ createAuditLog: vi.fn(() => ({ append: vi.fn(), updateByRequestId: vi.fn() })) }));
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

const PLUGIN_SHORTCUT = { id: '@acme/arrow/pick', keys: 'CommandOrControl+Alt+T' };
// Binding id rule: 'openpen-plugin-' + the namespaced id lower-cased with every character
// outside [a-z0-9-] replaced by '-' + '-' + the first 8 hex digits of its SHA-1.
function bindingPathFor(namespacedId) {
  const sanitized = namespacedId.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const digest = createHash('sha1').update(namespacedId).digest('hex').slice(0, 8);
  return `${KEYBINDING_PATH_PREFIX}openpen-plugin-${sanitized}-${digest}/`;
}
const PLUGIN_BINDING_PATH = bindingPathFor(PLUGIN_SHORTCUT.id);

function makeSender(id) {
  return Object.assign(new EventEmitter(), { id });
}

const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
const savedEnv = {
  XDG_CURRENT_DESKTOP: process.env.XDG_CURRENT_DESKTOP,
  XDG_SESSION_TYPE: process.env.XDG_SESSION_TYPE,
  OPENPEN_USER_DATA_DIR: process.env.OPENPEN_USER_DATA_DIR,
  XDG_DATA_HOME: process.env.XDG_DATA_HOME,
  XDG_DATA_DIRS: process.env.XDG_DATA_DIRS,
};

const DATA_HOME = '/xdg-home-test';
const DATA_DIRS = ['/xdg-dirs-a', '/xdg-dirs-b'];
const desktopEntryIn = (dir) => `${dir}/applications/${DESKTOP_ENTRY_NAME}`;

function restoreEnv() {
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

const gsettingsWrites = () =>
  execCalls.filter((c) => c.file === 'gsettings' && (c.args[0] === 'set' || c.args[0] === 'reset'));

/** Plugin keybindings currently present in the fake GNOME store. */
const pluginBindings = () =>
  keybindings.list
    .filter((p) => p.includes('openpen-plugin-'))
    .map((p) => ({ path: p, ...(keybindings.values.get(p) ?? {}) }));

const settle = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Wayland plugin shortcut backends', () => {
  let mockGlobalShortcut;
  let detectWaylandShortcutBackend;
  let shouldRegisterBuiltinDesktopShortcuts;
  let SHORTCUTS;
  let exitSpy;

  beforeEach(async () => {
    vi.resetModules();
    ipcHandlers.clear();
    appHandlers.clear();
    execCalls.length = 0;
    keybindings.list = [];
    keybindings.values.clear();
    gsettingsControl.before = null;
    gsettingsControl.failWrites = false;
    overlayWin.webContents.send.mockClear();
    mainWin.webContents.send.mockClear();
    portalPresent = true;
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined);
    Object.defineProperty(process, 'platform', { value: 'linux' });
    process.env.XDG_SESSION_TYPE = 'wayland';
    process.env.XDG_CURRENT_DESKTOP = 'ubuntu:GNOME';
    delete process.env.OPENPEN_USER_DATA_DIR;
    process.env.XDG_DATA_HOME = DATA_HOME;
    process.env.XDG_DATA_DIRS = DATA_DIRS.join(':');
    desktopFiles.clear();

    mockGlobalShortcut = (await import('electron')).globalShortcut;
    mockGlobalShortcut.register.mockClear();
    mockGlobalShortcut.register.mockReturnValue(true);
    ({ SHORTCUTS } = await import('../../electron/ipc-channels.js'));
    ({ detectWaylandShortcutBackend, shouldRegisterBuiltinDesktopShortcuts } = await import(
      '../../electron/linux-shortcut.js'
    ));
  });

  afterEach(() => {
    exitSpy.mockRestore();
    Object.defineProperty(process, 'platform', realPlatform);
    restoreEnv();
  });

  async function bootMain() {
    await import('../../electron/main.js');
    await vi.waitFor(() => expect(ipcHandlers.has('module:register-shortcut')).toBe(true));
  }

  const registerPluginShortcut = (sender = makeSender(1)) =>
    ipcHandlers.get('module:register-shortcut')({ sender }, PLUGIN_SHORTCUT);

  it('AC-11 detects portal when the GlobalShortcuts portal answers, gnome-desktop on GNOME without it, none otherwise', async () => {
    portalPresent = true;
    // Outside GNOME the portal is only usable when the app's desktop entry is installed.
    process.env.XDG_CURRENT_DESKTOP = 'KDE';
    desktopFiles.add(desktopEntryIn(DATA_HOME));
    expect(await detectWaylandShortcutBackend()).toBe('portal');
    // The portal is probed by asking for the GlobalShortcuts interface's version property.
    const probe = execCalls.find(
      (c) =>
        c.file !== 'gsettings' &&
        [c.file, ...c.args].join(' ').includes('org.freedesktop.portal.GlobalShortcuts') &&
        [c.file, ...c.args].join(' ').includes('version'),
    );
    expect(probe).toBeDefined();

    portalPresent = false;
    process.env.XDG_CURRENT_DESKTOP = 'ubuntu:GNOME';
    expect(await detectWaylandShortcutBackend()).toBe('gnome-desktop');

    process.env.XDG_CURRENT_DESKTOP = 'KDE';
    expect(await detectWaylandShortcutBackend()).toBe('none');
  });

  it('AC-11 with the portal backend plugin and built-in shortcuts go through globalShortcut and no GNOME keybinding is written', async () => {
    portalPresent = true;
    process.env.XDG_CURRENT_DESKTOP = 'KDE';
    desktopFiles.add(desktopEntryIn(DATA_HOME));
    await bootMain();
    await settle();

    registerPluginShortcut();
    await settle();

    expect(mockGlobalShortcut.register).toHaveBeenCalledWith(PLUGIN_SHORTCUT.keys, expect.any(Function));
    const builtinBindingWrites = gsettingsWrites().filter(
      (c) => String(c.args[1]).includes('openpen-toggle-drawing-mode') || String(c.args[1]).includes('openpen-toggle-bar'),
    );
    expect(builtinBindingWrites).toEqual([]);
    expect(gsettingsWrites()).toEqual([]);
    expect(shouldRegisterBuiltinDesktopShortcuts({ backend: 'portal', isolated: false })).toBe(false);
    expect(shouldRegisterBuiltinDesktopShortcuts({ backend: 'gnome-desktop', isolated: false })).toBe(true);
  });

  it('AC-11 with the gnome-desktop backend a plugin shortcut becomes an openpen-plugin-* keybinding that follows rebind, suspend/resume and unregister, and the relaunch flag triggers it', async () => {
    portalPresent = false;
    await bootMain();
    // Control: the built-in drawing-mode binding is installed on this backend.
    await vi.waitFor(() =>
      expect(keybindings.list).toContain(`${KEYBINDING_PATH_PREFIX}openpen-toggle-drawing-mode/`),
    );

    const sender = makeSender(1);
    registerPluginShortcut(sender);

    // Registration: one binding with the sanitised id, the relaunch command and the GTK accelerator.
    await vi.waitFor(() => expect(pluginBindings()).toHaveLength(1));
    const [binding] = pluginBindings();
    expect(binding.path).toBe(PLUGIN_BINDING_PATH);
    expect(binding.command).toContain(`--plugin-shortcut=${PLUGIN_SHORTCUT.id}`);
    expect(binding.binding).toBe('<Primary><Alt>t');
    expect(mockGlobalShortcut.register).not.toHaveBeenCalledWith(PLUGIN_SHORTCUT.keys, expect.any(Function));

    // The relaunched instance forwards its argv; the trigger reaches the target window.
    for (const handler of appHandlers.get('second-instance') ?? []) {
      handler({}, [`--plugin-shortcut=${PLUGIN_SHORTCUT.id}`]);
    }
    expect(overlayWin.webContents.send).toHaveBeenCalledTimes(1);
    expect(overlayWin.webContents.send).toHaveBeenCalledWith('module:shortcut-triggered', { id: PLUGIN_SHORTCUT.id });

    // Rebinding updates the same binding id to the new key.
    const setShortcut = ipcHandlers.get(SHORTCUTS.SET);
    await setShortcut({}, { id: PLUGIN_SHORTCUT.id, accelerator: 'CommandOrControl+Alt+Y' });
    await vi.waitFor(() => expect(pluginBindings().map((b) => b.binding)).toEqual(['<Primary><Alt>y']));
    expect(pluginBindings()[0].path).toBe(PLUGIN_BINDING_PATH);

    // Suspend removes the binding from the desktop; resume restores it with the same command.
    const setSuspended = ipcHandlers.get(SHORTCUTS.SET_SUSPENDED);
    setSuspended({}, true);
    await vi.waitFor(() => expect(pluginBindings()).toEqual([]));
    setSuspended({}, false);
    await vi.waitFor(() => expect(pluginBindings()).toHaveLength(1));
    expect(pluginBindings()[0].command).toContain(`--plugin-shortcut=${PLUGIN_SHORTCUT.id}`);

    // Unregistering the last registrant removes the binding.
    ipcHandlers.get('module:unregister-shortcut')({ sender }, { id: PLUGIN_SHORTCUT.id });
    await vi.waitFor(() => expect(pluginBindings()).toEqual([]));
  });

  it('AC-11 an isolated instance (OPENPEN_USER_DATA_DIR set) never writes a system keybinding', async () => {
    portalPresent = false;
    process.env.OPENPEN_USER_DATA_DIR = 'isolated-user-data';
    await bootMain();

    registerPluginShortcut();
    await settle(50);

    expect(gsettingsWrites()).toEqual([]);
  });

  it('AC-12 with the none backend a plugin shortcut is not registered anywhere', async () => {
    portalPresent = false;
    process.env.XDG_CURRENT_DESKTOP = 'KDE';
    await bootMain();

    registerPluginShortcut();
    await settle(50);

    expect(mockGlobalShortcut.register).not.toHaveBeenCalledWith(PLUGIN_SHORTCUT.keys, expect.any(Function));
    expect(gsettingsWrites()).toEqual([]);
  });

  it('AC-11 regression: a failed gsettings write on rebind reports { ok: false } and does not persist the new key', async () => {
    portalPresent = false;
    const { setModuleShortcut } = await import('../../electron/settings-store.js');
    await bootMain();
    const sender = makeSender(1);
    registerPluginShortcut(sender);
    await vi.waitFor(() => expect(pluginBindings()).toHaveLength(1));
    setModuleShortcut.mockClear();

    gsettingsControl.failWrites = true;
    const result = await ipcHandlers.get(SHORTCUTS.SET)({}, {
      id: PLUGIN_SHORTCUT.id,
      accelerator: 'CommandOrControl+Alt+Y',
    });

    expect(result.ok).toBe(false);
    expect(setModuleShortcut).not.toHaveBeenCalled();
  });

  it('AC-11 regression: a first registration whose write is still in flight when suspend starts ends up suspended', async () => {
    portalPresent = false;
    await bootMain();
    await vi.waitFor(() =>
      expect(keybindings.list).toContain(`${KEYBINDING_PATH_PREFIX}openpen-toggle-drawing-mode/`),
    );

    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    gsettingsControl.before = async (args) => { if (args[0] === 'set') await gate; };

    registerPluginShortcut();
    await settle();
    ipcHandlers.get(SHORTCUTS.SET_SUSPENDED)({}, true);
    await settle();
    release();
    gsettingsControl.before = null;
    await settle(100);

    expect(pluginBindings()).toEqual([]);

    // Resuming brings the binding back, so the empty state above was a real suspension.
    ipcHandlers.get(SHORTCUTS.SET_SUSPENDED)({}, false);
    await vi.waitFor(() => expect(pluginBindings()).toHaveLength(1));
  });

  it('AC-11 regression: namespaced ids that sanitise to the same text get distinct bindings that are removed independently', async () => {
    portalPresent = false;
    await bootMain();
    const first = { id: '@acme/arrow-x/pick', keys: 'CommandOrControl+Alt+1' };
    const second = { id: '@acme/arrow/x-pick', keys: 'CommandOrControl+Alt+2' };
    const sender = makeSender(1);
    const register = ipcHandlers.get('module:register-shortcut');

    register({ sender }, first);
    register({ sender }, second);

    await vi.waitFor(() => expect(pluginBindings()).toHaveLength(2));
    expect(pluginBindings().map((b) => b.path).sort()).toEqual(
      [bindingPathFor(first.id), bindingPathFor(second.id)].sort(),
    );

    ipcHandlers.get('module:unregister-shortcut')({ sender }, { id: first.id });
    await vi.waitFor(() => expect(pluginBindings().map((b) => b.path)).toEqual([bindingPathFor(second.id)]));
  });

  it('AC-11 regression: a plugin registered while the startup cleanup is still reading the list keeps its binding', async () => {
    portalPresent = false;
    const stale = `${KEYBINDING_PATH_PREFIX}openpen-plugin-stale-00000000/`;
    keybindings.list = [stale];
    keybindings.values.set(stale, { name: 'stale', command: 'stale', binding: '<Primary>x' });

    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    // Hold only the first list read (the startup cleanup's) until the plugin is fully registered.
    let held = false;
    gsettingsControl.before = async (args) => {
      if (args[0] === 'get' && !held) {
        held = true;
        await gate;
      }
    };

    await bootMain();
    registerPluginShortcut();
    await vi.waitFor(() =>
      expect(execCalls.some((c) => c.file === 'gsettings' && c.args[0] === 'set' && c.args[2] === 'binding' && String(c.args[1]).includes('openpen-plugin-'))).toBe(true),
    );
    release();
    gsettingsControl.before = null;

    // Cleanup removes the stale binding and must leave exactly the one just registered.
    await vi.waitFor(() => expect(keybindings.list).not.toContain(stale));
    await settle(50);
    expect(pluginBindings()).toHaveLength(1);
    expect(pluginBindings()[0].command).toContain(`--plugin-shortcut=${PLUGIN_SHORTCUT.id}`);
  });

  it('AC-11 regression: startup cleanup with several stale bindings never removes a binding registered during the cleanup', async () => {
    portalPresent = false;
    const staleA = `${KEYBINDING_PATH_PREFIX}openpen-plugin-stale-a-00000001/`;
    const staleB = `${KEYBINDING_PATH_PREFIX}openpen-plugin-stale-b-00000002/`;
    // A leftover binding with the same id the plugin registers this run, bound to an old key.
    keybindings.list = [staleA, PLUGIN_BINDING_PATH, staleB];
    for (const p of keybindings.list) {
      keybindings.values.set(p, { name: 'old', command: 'old', binding: '<Primary>x' });
    }

    // Stop the cleanup in the middle of removing the first stale binding.
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    let held = false;
    gsettingsControl.before = async (args) => {
      if (!held && args[0] === 'reset' && String(args[1]).includes('openpen-plugin-')) {
        held = true;
        await gate;
      }
    };

    await bootMain();
    await vi.waitFor(() => expect(held).toBe(true));
    registerPluginShortcut();
    await settle(100);
    release();
    gsettingsControl.before = null;

    await vi.waitFor(() => expect(keybindings.list).not.toContain(staleA));
    await settle(100);
    expect(pluginBindings().map((b) => b.path)).toEqual([PLUGIN_BINDING_PATH]);
    expect(pluginBindings()[0].binding).toBe('<Primary><Alt>t');
    expect(pluginBindings()[0].command).toContain(`--plugin-shortcut=${PLUGIN_SHORTCUT.id}`);
  });

  it('AC-11 regression: on GNOME the backend is gnome-desktop even when the GlobalShortcuts portal answers', async () => {
    portalPresent = true;
    process.env.XDG_CURRENT_DESKTOP = 'ubuntu:GNOME';

    expect(await detectWaylandShortcutBackend()).toBe('gnome-desktop');
  });

  it('AC-12 regression: without a com.openpen.app desktop entry the portal backend is reported as none', async () => {
    portalPresent = true;
    process.env.XDG_CURRENT_DESKTOP = 'KDE';

    desktopFiles.clear();
    expect(await detectWaylandShortcutBackend()).toBe('none');

    desktopFiles.add(desktopEntryIn(DATA_HOME));
    expect(await detectWaylandShortcutBackend()).toBe('portal');

    desktopFiles.clear();
    desktopFiles.add(desktopEntryIn(DATA_DIRS[1]));
    expect(await detectWaylandShortcutBackend()).toBe('portal');

    // At startup the desktop name is set before any global shortcut is registered.
    const { app, globalShortcut } = await import('electron');
    app.setDesktopName.mockClear();
    globalShortcut.register.mockClear();
    await bootMain();
    await settle();
    expect(app.setDesktopName).toHaveBeenCalledWith(DESKTOP_ENTRY_NAME);
    expect(globalShortcut.register).toHaveBeenCalled();
    expect(app.setDesktopName.mock.invocationCallOrder[0]).toBeLessThan(
      globalShortcut.register.mock.invocationCallOrder[0],
    );
  });
});
