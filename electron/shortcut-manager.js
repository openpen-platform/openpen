/**
 * Global shortcut bridge.
 *
 * Two responsibilities:
 *   1. Pre-register the host's hardcoded shortcuts (drawing-mode toggle,
 *      undo, redo). Pre-registered at startup so they are available before
 *      any module is loaded.
 *   2. Expose the MODULE.REGISTER_SHORTCUT IPC bridge so renderer-side
 *      modules can dynamically register their own accelerators (e.g.
 *      `summon-to-cursor` registers Cmd+Shift+S).
 *
 * Both paths share the same `registerShortcut` implementation so
 * conflict-detection and bookkeeping stay consistent.
 */

import { BrowserWindow, globalShortcut, ipcMain } from 'electron';
import { MODULE, SHORTCUTS } from './ipc-channels.js';
import { handleValidated, onValidated } from './ipc-validation.js';
import {
  booleanSchema,
  moduleShortcutRegisterSchema,
  shortcutIdSchema,
  shortcutSetSchema,
} from './ipc-payload-schemas.js';
import {
  getShortcuts,
  setShortcut as persistShortcut,
  resetShortcut as persistResetShortcut,
  DEFAULT_SHORTCUTS,
  getModuleShortcuts,
  setModuleShortcut as persistModuleShortcut,
  resetModuleShortcut as persistResetModuleShortcut,
} from './settings-store.js';
import {
  electronToGtkAccelerator,
  registerDesktopShortcut,
  unregisterDesktopShortcut,
  suspendDesktopShortcut,
  resumeDesktopShortcut,
  pluginBindingId,
  buildPluginShortcutCommand,
} from './linux-shortcut.js';

/**
 * Suspension uses a nest counter so multiple independent suspenders compose
 * correctly: settings-window-open + hotkey-input-capture can both request
 * suspension, and only the last resume actually re-registers the OS hooks.
 * Without nesting, an earlier resume from one source would clobber another
 * source's still-active suspension.
 */
let _suspendCount = 0;
let _suspended = false;

/**
 * Hooks fired on the suspend↔resume transition (not on every nested call).
 * Lets platform shortcut backends that live outside globalShortcut follow the
 * same suspension — notably the Linux/Wayland gsettings desktop keybinding,
 * which globalShortcut.unregisterAll() cannot touch, so without this it would
 * keep firing while the settings window (or a hotkey-capture field) is open.
 * @type {Array<(suspended: boolean) => void>}
 */
const _suspendChangeHooks = [];

/** Register a callback fired with `true` on first suspend, `false` on final resume. */
export function onShortcutsSuspendChange(cb) {
  _suspendChangeHooks.push(cb);
  return () => {
    const i = _suspendChangeHooks.indexOf(cb);
    if (i >= 0) _suspendChangeHooks.splice(i, 1);
  };
}

/** @type {Map<string, () => void>} accelerator → handler */
const acceleratorToHandler = new Map();

/** @type {Map<string, string>} shortcutId → accelerator (module shortcuts only) */
const idToAccelerator = new Map();

/** @type {Map<string, string>} namespacedId → original default accelerator declared by the module */
const idDefaultKeys = new Map();

/** @type {Map<string, () => void>} namespacedId → handler (for re-registration on key change) */
const moduleShortcutHandlers = new Map();

/** @type {Map<string, () => void>} builtinId → handler (for re-registration) */
const _builtinHandlers = new Map();

/** @type {Map<string, string>} builtinId → current accelerator */
const _builtinAccelerators = new Map();

/**
 * How plugin shortcuts are delivered on this session: 'portal' and 'none' are
 * Wayland-only values, 'gnome-desktop' routes them through desktop keybindings,
 * null means the platform's own globalShortcut path.
 * @type {'portal' | 'gnome-desktop' | 'none' | null}
 */
let _pluginBackend = null;

/** False for an isolated instance, which must never write desktop keybindings. */
let _desktopBindingsAllowed = true;

/** @type {(() => import('electron').BrowserWindow | null) | null} */
let _resolveShortcutTarget = null;

/**
 * Every renderer that loads modules registers the same shortcut ids, so each id
 * is owned by the set of webContents ids that registered it. The OS binding is
 * created by the first registrant and released only when the set empties.
 * @type {Map<string, Set<number | string>>}
 */
const _registrants = new Map();

/** @type {Set<number | string>} webContents ids already watched for destruction */
const _watchedSenders = new Set();

/** Registrant key for events that carry no sender (direct calls). */
const ANONYMOUS_SENDER = 'anonymous';

/** @type {Set<string>} namespacedIds of module shortcuts that failed to register due to key conflicts. */
const idConflicts = new Set();

/**
 * Initialise. Registers built-in shortcuts and the module IPC bridge.
 *
 * @param {{
 *   onToggleDrawingMode?: () => void,
 *   onToggleBar?: () => void,
 *   onUndo?: () => void,
 *   onRedo?: () => void,
 *   onQuitApp?: () => void,
 *   onShortcutConflict?: (accelerator: string) => void,
 *   pluginShortcutBackend?: 'portal' | 'gnome-desktop' | 'none' | null,
 *   desktopBindingsAllowed?: boolean,
 *   resolveShortcutTarget?: () => import('electron').BrowserWindow | null,
 * }} [callbacks]
 */
export function initShortcutManager({
  onToggleDrawingMode,
  onToggleBar,
  onUndo,
  onRedo,
  onQuitApp,
  onShortcutConflict,
  pluginShortcutBackend = null,
  desktopBindingsAllowed = true,
  resolveShortcutTarget,
} = {}) {
  _pluginBackend = pluginShortcutBackend;
  _desktopBindingsAllowed = desktopBindingsAllowed;
  _resolveShortcutTarget = resolveShortcutTarget ?? null;
  const shortcuts = getShortcuts();

  // Built-in: drawing-mode toggle.
  const drawingHandler = () => { if (!_suspended) onToggleDrawingMode?.(); };
  const drawingAccel = shortcuts.toggleDrawingMode;
  if (registerShortcut(drawingAccel, drawingHandler)) {
    _builtinHandlers.set('toggleDrawingMode', drawingHandler);
    _builtinAccelerators.set('toggleDrawingMode', drawingAccel);
  } else {
    onShortcutConflict?.(drawingAccel);
  }

  // Built-in: hide/show the control bar.
  const barHandler = () => { if (!_suspended) onToggleBar?.(); };
  const barAccel = shortcuts.toggleBar;
  if (registerShortcut(barAccel, barHandler)) {
    _builtinHandlers.set('toggleBar', barHandler);
    _builtinAccelerators.set('toggleBar', barAccel);
  } else {
    onShortcutConflict?.(barAccel);
  }

  // Built-in: undo / redo.
  const undoHandler = () => { if (!_suspended) onUndo?.(); };
  const undoAccel = shortcuts.undo;
  if (registerShortcut(undoAccel, undoHandler)) {
    _builtinHandlers.set('undo', undoHandler);
    _builtinAccelerators.set('undo', undoAccel);
  } else {
    onShortcutConflict?.(undoAccel);
  }

  const redoHandler = () => { if (!_suspended) onRedo?.(); };
  const redoAccel = shortcuts.redo;
  if (registerShortcut(redoAccel, redoHandler)) {
    _builtinHandlers.set('redo', redoHandler);
    _builtinAccelerators.set('redo', redoAccel);
  } else {
    onShortcutConflict?.(redoAccel);
  }

  // Built-in: quit app. Not suspended by shortcut-capture UX — quit must always work.
  const quitHandler = () => onQuitApp?.();
  const quitAccel = shortcuts.quitApp;
  if (registerShortcut(quitAccel, quitHandler)) {
    _builtinHandlers.set('quitApp', quitHandler);
    _builtinAccelerators.set('quitApp', quitAccel);
  } else {
    onShortcutConflict?.(quitAccel);
  }

  // Module IPC bridge: renderer-side modules register their accelerators
  // dynamically via system.shortcuts contributions.
  onValidated(ipcMain, MODULE.REGISTER_SHORTCUT, moduleShortcutRegisterSchema, (event, { id, keys }) => {
    // No delivery path on this desktop: the shortcut cannot work, so nothing is registered.
    if (_pluginBackend === 'none') return;
    if (_pluginBackend === 'gnome-desktop' && !_desktopBindingsAllowed) return;

    _trackRegistrant(id, event?.sender);
    if (idToAccelerator.has(id) || moduleShortcutHandlers.has(id)) return;

    // Apply any persisted custom key; fall back to the module's declared default.
    const customKeys = getModuleShortcuts();
    const effectiveKeys = customKeys[id] ?? keys;
    const handler = () => triggerModuleShortcut(id);
    idDefaultKeys.set(id, keys);
    moduleShortcutHandlers.set(id, handler);

    if (_pluginBackend === 'gnome-desktop') {
      void _installPluginDesktopBinding(id, effectiveKeys).then((ok) => {
        if (!_registrants.has(id)) return;
        if (ok) {
          idToAccelerator.set(id, effectiveKeys);
        } else {
          idConflicts.add(id);
          _broadcastConflicts();
        }
      });
      return;
    }

    const ok = registerShortcut(effectiveKeys, handler);
    if (ok) {
      idToAccelerator.set(id, effectiveKeys);
    } else {
      idConflicts.add(id);
      _broadcastConflicts();
    }
  });

  onValidated(ipcMain, MODULE.UNREGISTER_SHORTCUT, shortcutIdSchema, (event, { id }) => {
    const registrants = _registrants.get(id);
    if (registrants) {
      registrants.delete(event?.sender?.id ?? ANONYMOUS_SENDER);
      if (registrants.size > 0) return;
    }
    _releaseModuleShortcut(id);
  });

  _registerIpcHandlers();
}

/**
 * Record `sender` as an owner of shortcut `id` and watch it for destruction so a
 * closed window never leaves a stale ownership behind.
 *
 * @param {string} id
 * @param {{ id?: number, once?: Function } | undefined} sender
 * @returns {number | string} the registrant key
 */
function _trackRegistrant(id, sender) {
  const key = sender?.id ?? ANONYMOUS_SENDER;
  if (!_registrants.has(id)) _registrants.set(id, new Set());
  _registrants.get(id).add(key);
  if (sender && typeof sender.once === 'function' && !_watchedSenders.has(key)) {
    _watchedSenders.add(key);
    sender.once('destroyed', () => {
      _watchedSenders.delete(key);
      for (const [shortcutId, owners] of [..._registrants]) {
        if (owners.delete(key) && owners.size === 0) _releaseModuleShortcut(shortcutId);
      }
    });
  }
  return key;
}

/** Drop every trace of a module shortcut and release its OS / desktop binding. */
function _releaseModuleShortcut(id) {
  _registrants.delete(id);
  const accelerator = idToAccelerator.get(id);
  if (_pluginBackend === 'gnome-desktop') {
    if (moduleShortcutHandlers.has(id)) void unregisterDesktopShortcut(pluginBindingId(id));
  } else if (accelerator) {
    globalShortcut.unregister(accelerator);
    acceleratorToHandler.delete(accelerator);
  }
  idToAccelerator.delete(id);
  idDefaultKeys.delete(id);
  moduleShortcutHandlers.delete(id);
  if (idConflicts.delete(id)) _broadcastConflicts();
}

/**
 * Install (or re-key) the desktop keybinding of a plugin shortcut.
 *
 * @param {string} id namespaced shortcut id
 * @param {string} accelerator Electron accelerator
 * @returns {Promise<boolean>}
 */
async function _installPluginDesktopBinding(id, accelerator) {
  const gtkAccel = electronToGtkAccelerator(accelerator);
  if (!gtkAccel) return false;
  const result = await registerDesktopShortcut({
    id: pluginBindingId(id),
    name: `OpenPen: ${id}`,
    accelerator: gtkAccel,
    command: buildPluginShortcutCommand(id),
  });
  // A suspend that began while the write was in flight found nothing to take
  // down; apply it now so the binding does not stay live during suspension.
  if (result.ok && _suspended) await suspendDesktopShortcut(pluginBindingId(id));
  return result.ok;
}

/**
 * Deliver a module shortcut to the renderer. Sends to exactly one window — the
 * one `resolveShortcutTarget` names — so the handler runs once. Used by the
 * globalShortcut path and by the desktop-keybinding relaunch flag alike.
 *
 * @param {string} id namespaced shortcut id
 */
export function triggerModuleShortcut(id) {
  if (_suspended) return;
  if (!moduleShortcutHandlers.has(id)) return;
  if (_resolveShortcutTarget) {
    const target = _resolveShortcutTarget();
    if (target && !target.isDestroyed()) target.webContents.send(MODULE.SHORTCUT_TRIGGERED, { id });
    return;
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(MODULE.SHORTCUT_TRIGGERED, { id });
  }
}


/**
 * IPC handlers for user-configurable shortcuts. Kept inside the manager so
 * the IPC surface lives next to the bookkeeping it mutates.
 */
function _registerIpcHandlers() {
  onValidated(ipcMain, SHORTCUTS.SET_SUSPENDED, booleanSchema, (_event, suspended) => {
    if (suspended) {
      _suspendShortcuts();
    } else {
      _resumeShortcuts();
    }
  });

  ipcMain.handle(SHORTCUTS.GET, () => getShortcuts());

  ipcMain.handle(SHORTCUTS.GET_MODULE, () => getModuleShortcuts());

  ipcMain.handle(SHORTCUTS.GET_CONFLICTS, () => [...idConflicts]);

  ipcMain.handle(SHORTCUTS.GET_PLUGIN_BACKEND, () => _pluginBackend);

  handleValidated(ipcMain, SHORTCUTS.SET, shortcutSetSchema, async (_event, payload) => {
    // Route to module shortcut path if the id belongs to a registered module shortcut.
    if (idDefaultKeys.has(payload.id)) {
      const result = await _updateModuleShortcut(payload.id, payload.accelerator);
      if (result.ok) persistModuleShortcut(payload.id, payload.accelerator);
      return result;
    }
    const result = _updateBuiltinShortcut(payload.id, payload.accelerator);
    if (result.ok) persistShortcut(payload.id, payload.accelerator);
    return result;
  }, { onInvalid: () => ({ ok: false, error: 'Invalid payload' }) });

  handleValidated(ipcMain, SHORTCUTS.RESET, shortcutIdSchema, async (_event, payload) => {
    // Route to module shortcut path if the id belongs to a registered module shortcut.
    if (idDefaultKeys.has(payload.id)) {
      const defaultAccel = idDefaultKeys.get(payload.id);
      const result = await _updateModuleShortcut(payload.id, defaultAccel);
      if (result.ok) persistResetModuleShortcut(payload.id);
      return result;
    }
    const defaultAccel = DEFAULT_SHORTCUTS[/** @type {keyof typeof DEFAULT_SHORTCUTS} */ (payload.id)];
    if (!defaultAccel) return { ok: false, error: `Unknown shortcut id: ${payload.id}` };
    const result = _updateBuiltinShortcut(payload.id, defaultAccel);
    if (result.ok) persistResetShortcut(payload.id);
    return result;
  }, { onInvalid: () => ({ ok: false, error: 'Invalid payload' }) });
}

/**
 * Register a single global accelerator. Used both by the built-in
 * shortcuts above and by the module IPC bridge.
 *
 * @param {string} accelerator e.g. `'CommandOrControl+Shift+A'`
 * @param {() => void} handler
 * @returns {boolean} success
 */
export function registerShortcut(accelerator, handler) {
  if (acceleratorToHandler.has(accelerator)) {
    console.warn(`[ShortcutManager] Accelerator already registered: ${accelerator}`);
    return false;
  }
  let ok = false;
  try {
    ok = globalShortcut.register(accelerator, handler);
  } catch (err) {
    // Electron THROWS (not returns false) on an accelerator it can't parse —
    // e.g. the literal token "Backslash" instead of "\". Unguarded, that throw
    // propagates through initShortcutManager and main.js turns any init-chain
    // exception into process.exit(1); on a settings update it bypasses the
    // {ok:false} rollback. Treat an unparseable accelerator as a failed
    // registration so a bad persisted/user/module key can't crash startup.
    console.error(`[ShortcutManager] Invalid accelerator "${accelerator}": ${err?.message}`);
    return false;
  }
  if (ok) {
    acceleratorToHandler.set(accelerator, handler);
  } else {
    console.error(`[ShortcutManager] Failed to register accelerator (likely taken): ${accelerator}`);
  }
  return ok;
}

/**
 * Re-register a built-in shortcut under a new accelerator.
 * Try-new-first: only release the old binding once the new one is live, so a
 * failed registration (collision with another shortcut or with another app)
 * leaves the user's existing shortcut intact.
 *
 * @param {string} id  - one of 'toggleDrawingMode', 'undo', 'redo'
 * @param {string} newAccelerator
 * @returns {{ ok: boolean; error?: string }}
 */
function _updateBuiltinShortcut(id, newAccelerator) {
  const handler = _builtinHandlers.get(id);
  if (!handler) return { ok: false, error: `Unknown built-in shortcut: ${id}` };

  const oldAccelerator = _builtinAccelerators.get(id);
  if (oldAccelerator === newAccelerator) return { ok: true };

  if (!registerShortcut(newAccelerator, handler)) {
    return {
      ok: false,
      error: `Failed to register "${newAccelerator}" — it may be taken by another shortcut or app`,
    };
  }

  if (oldAccelerator && acceleratorToHandler.has(oldAccelerator)) {
    globalShortcut.unregister(oldAccelerator);
    acceleratorToHandler.delete(oldAccelerator);
  }
  _builtinAccelerators.set(id, newAccelerator);
  return { ok: true };
}

/**
 * Re-register a module shortcut under a new accelerator. Uses the same
 * try-new-first pattern as `_updateBuiltinShortcut`.
 *
 * @param {string} namespacedId
 * @param {string} newAccelerator
 * @returns {{ ok: boolean; error?: string } | Promise<{ ok: boolean; error?: string }>}
 */
function _updateModuleShortcut(namespacedId, newAccelerator) {
  const handler = moduleShortcutHandlers.get(namespacedId);
  if (!handler) return { ok: false, error: `Module shortcut not registered: ${namespacedId}` };

  const oldAccelerator = idToAccelerator.get(namespacedId);
  if (oldAccelerator === newAccelerator) return { ok: true };

  if (_pluginBackend === 'gnome-desktop') {
    // The binding id is stable, so registering again re-keys it in place.
    if (!electronToGtkAccelerator(newAccelerator)) {
      return { ok: false, error: `Unsupported accelerator "${newAccelerator}"` };
    }
    return _installPluginDesktopBinding(namespacedId, newAccelerator).then((ok) => {
      if (!ok) {
        return { ok: false, error: `Failed to register "${newAccelerator}" as a desktop keybinding` };
      }
      idToAccelerator.set(namespacedId, newAccelerator);
      if (idConflicts.delete(namespacedId)) _broadcastConflicts();
      return { ok: true };
    });
  }

  if (!registerShortcut(newAccelerator, handler)) {
    return {
      ok: false,
      error: `Failed to register "${newAccelerator}" — it may be taken by another shortcut or app`,
    };
  }

  if (oldAccelerator && acceleratorToHandler.has(oldAccelerator)) {
    globalShortcut.unregister(oldAccelerator);
    acceleratorToHandler.delete(oldAccelerator);
  }
  idToAccelerator.set(namespacedId, newAccelerator);
  if (idConflicts.delete(namespacedId)) _broadcastConflicts();
  return { ok: true };
}

/**
 * Unregister all shortcuts from the OS but keep acceleratorToHandler intact.
 * Key events flow to the focused renderer window, and the in-memory map still
 * enables conflict detection when setShortcut is called after resume.
 */
function _suspendShortcuts() {
  _suspendCount++;
  if (_suspended) return;
  _suspended = true;
  globalShortcut.unregisterAll();
  if (_pluginBackend === 'gnome-desktop') {
    for (const id of moduleShortcutHandlers.keys()) void suspendDesktopShortcut(pluginBindingId(id));
  }
  for (const hook of _suspendChangeHooks) hook(true);
}

/**
 * Decrement the suspend counter; only re-register when count returns to zero.
 */
function _resumeShortcuts() {
  if (_suspendCount === 0) return;
  _suspendCount--;
  if (_suspendCount > 0) return;
  if (!_suspended) return;
  _suspended = false;
  for (const [accel, handler] of acceleratorToHandler) {
    globalShortcut.register(accel, handler);
  }
  if (_pluginBackend === 'gnome-desktop') {
    for (const id of moduleShortcutHandlers.keys()) void resumeDesktopShortcut(pluginBindingId(id));
  }
  for (const hook of _suspendChangeHooks) hook(false);
}

/**
 * Public wrappers exposed to other main-process modules (e.g. the window
 * manager when it opens / closes the settings window). Renderer-driven
 * suspension still flows through SHORTCUTS.SET_SUSPENDED IPC.
 */
export function suspendShortcuts() { _suspendShortcuts(); }
export function resumeShortcuts() { _resumeShortcuts(); }

/** Broadcast the current conflict set to all renderer windows. */
function _broadcastConflicts() {
  const conflicts = [...idConflicts];
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(SHORTCUTS.CONFLICT_UPDATED, conflicts);
  }
}

/** Unregister every shortcut and clear bookkeeping (called on app quit). */
export function unregisterAllShortcuts() {
  globalShortcut.unregisterAll();
  acceleratorToHandler.clear();
  idToAccelerator.clear();
  idDefaultKeys.clear();
  moduleShortcutHandlers.clear();
  _builtinHandlers.clear();
  _builtinAccelerators.clear();
  idConflicts.clear();
  _registrants.clear();
  _watchedSenders.clear();
}
