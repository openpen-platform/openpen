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
}));

const DEFAULT_SHORTCUTS_FIXTURE = {
  toggleDrawingMode: 'CommandOrControl+Shift+A',
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
