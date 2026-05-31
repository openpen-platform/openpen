/**
 * Linux desktop-keybinding bridge.
 *
 * Electron's `globalShortcut.register` cannot grab keys on a Wayland session:
 * Wayland has no global key-grab and the `org.freedesktop.portal.GlobalShortcuts`
 * portal backend only ships in GNOME 48 (we target 46). To restore "press a key,
 * drawing mode toggles" UX, we register the chord at the *desktop* level via the
 * `gsettings`-managed custom-keybinding store. GNOME Settings Daemon intercepts
 * the chord and runs our binary with `--toggle-drawing-mode`; the single-instance
 * lock in main.js forwards that argv to the running OpenPen.
 *
 * Scope: GNOME only (Mutter / GNOME Shell). KDE has an equivalent
 * `kwriteconfig5` + `kglobalaccel` path; add a second backend module if we ship there.
 */

import { execFile } from 'node:child_process';
import { app } from 'electron';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const execFileAsync = promisify(execFile);

// Repo root = parent of this file's electron/ directory. Deterministic regardless
// of how the process was launched, unlike app.getAppPath() (which returns the
// repo root under `electron .` but `.../electron` under `electron electron/main.js`
// — the latter writes a broken command into the GLOBAL gsettings binding).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..');

const KEYBINDINGS_SCHEMA = 'org.gnome.settings-daemon.plugins.media-keys';
const KEYBINDINGS_KEY = 'custom-keybindings';
const KEYBINDING_PATH_PREFIX = '/org/gnome/settings-daemon/plugins/media-keys/custom-keybindings/';
const CUSTOM_KEYBINDING_SCHEMA = 'org.gnome.settings-daemon.plugins.media-keys.custom-keybinding';

/** Stable id used for the drawing-mode toggle keybinding. */
export const DRAWING_MODE_BINDING_ID = 'openpen-toggle-drawing-mode';

/** CLI flag the desktop keybinding passes to forward a toggle to the running instance. */
export const TOGGLE_DRAWING_MODE_FLAG = '--toggle-drawing-mode';

/** Stable id used for the control-bar hide/show keybinding. */
export const BAR_BINDING_ID = 'openpen-toggle-bar';

/** CLI flag the desktop keybinding passes to forward a bar hide/show to the running instance. */
export const TOGGLE_BAR_FLAG = '--toggle-bar';

/** Stable id of the legacy summon keybinding — kept only so launch can REMOVE it
 *  (summon-to-cursor is unsupported on Wayland: no global cursor, no client
 *  window positioning). */
export const SUMMON_BINDING_ID = 'openpen-summon';

/**
 * @returns {boolean} true when the session looks like GNOME (Mutter shell).
 *   Detected via XDG_CURRENT_DESKTOP, which Ubuntu sets to "ubuntu:GNOME"
 *   and Fedora to "GNOME". Falls back to false on any other DE.
 */
export function isGnome() {
  if (process.platform !== 'linux') return false;
  const desktop = (process.env.XDG_CURRENT_DESKTOP || '').toLowerCase();
  return desktop.split(':').some((d) => d === 'gnome' || d === 'unity');
}

/**
 * Resolve the shell command the desktop should execute when the chord fires.
 * In dev, process.execPath is the electron binary so the app directory must be
 * passed explicitly; in a packaged build process.execPath is already the app
 * launcher (AppImage / installed binary) so the directory argument is omitted.
 *
 * @returns {string}
 */
export function buildCliCommand(flag) {
  // Quote each segment so paths containing spaces survive the shell that
  // GNOME Settings Daemon uses to run custom commands.
  if (app.isPackaged) {
    return `'${process.execPath}' ${flag}`;
  }
  // Dev: the electron in node_modules has no SUID chrome-sandbox, so a plain
  // `electron <app>` relaunch aborts before it can forward argv. Match the dev
  // launcher's --no-sandbox. Packaged builds ship a proper sandbox and omit it.
  return `'${process.execPath}' '${APP_ROOT}' --no-sandbox ${flag}`;
}

async function _gsettingsGet(schemaOrPath, key) {
  const { stdout } = await execFileAsync('gsettings', ['get', schemaOrPath, key]);
  return stdout.trim();
}

async function _gsettingsSet(schemaOrPath, key, value) {
  // gsettings parses the value as a GVariant literal. String values MUST be
  // wrapped in double quotes — a bare string with embedded single quotes
  // (e.g. `'/path/A' '/path/B' --flag`) parses as the first quoted variant,
  // leaving the rest as "expected end of input". Pre-formatted GVariant
  // containers (`[...]` / `@as ...`) carry their own type discriminator and
  // pass through verbatim.
  const literal = (value.startsWith('[') || value.startsWith('@'))
    ? value
    : `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  await execFileAsync('gsettings', ['set', schemaOrPath, key, literal]);
}

async function _gsettingsReset(schemaOrPath, key) {
  await execFileAsync('gsettings', ['reset', schemaOrPath, key]);
}

/**
 * Parse the GVariant string `gsettings get` returns for the custom-keybindings
 * array (e.g. `['/path/a/', '/path/b/']`).
 *
 * @param {string} raw
 * @returns {string[]}
 */
function _parseArray(raw) {
  const trimmed = raw.trim();
  if (trimmed === '@as []' || trimmed === '[]') return [];
  const inner = trimmed.replace(/^\[|\]$/g, '').trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((s) => s.trim().replace(/^'|'$/g, ''))
    .filter(Boolean);
}

/**
 * Compose the GVariant string for a string array.
 *
 * @param {string[]} arr
 * @returns {string}
 */
function _formatArray(arr) {
  if (arr.length === 0) return '@as []';
  return `[${arr.map((s) => `'${s}'`).join(', ')}]`;
}

/**
 * @param {string} id
 * @returns {string}
 */
function _keybindingPath(id) {
  return `${KEYBINDING_PATH_PREFIX}${id}/`;
}

/**
 * @param {string} id
 * @returns {string}
 */
function _customSchemaPath(id) {
  return `${CUSTOM_KEYBINDING_SCHEMA}:${_keybindingPath(id)}`;
}

/**
 * Check whether the given keybinding id is currently present in the GNOME
 * custom-keybinding list.
 *
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function isShortcutRegistered(id) {
  if (!isGnome()) return false;
  try {
    const raw = await _gsettingsGet(KEYBINDINGS_SCHEMA, KEYBINDINGS_KEY);
    return _parseArray(raw).includes(_keybindingPath(id));
  } catch {
    return false;
  }
}

/**
 * Install (or update) a custom GNOME keybinding. Idempotent — calling with the
 * same id twice updates the existing entry rather than duplicating it.
 *
 * @param {{ id: string; name: string; accelerator: string; command: string }} opts
 * @returns {Promise<{ ok: boolean; error?: string }>}
 */
export async function registerDesktopShortcut({ id, name, accelerator, command }) {
  if (!isGnome()) {
    return { ok: false, error: 'Desktop-keybinding registration is only supported on GNOME.' };
  }
  try {
    const raw = await _gsettingsGet(KEYBINDINGS_SCHEMA, KEYBINDINGS_KEY);
    const list = _parseArray(raw);
    const myPath = _keybindingPath(id);
    if (!list.includes(myPath)) {
      list.push(myPath);
      await _gsettingsSet(KEYBINDINGS_SCHEMA, KEYBINDINGS_KEY, _formatArray(list));
    }
    const schemaPath = _customSchemaPath(id);
    await _gsettingsSet(schemaPath, 'name', name);
    await _gsettingsSet(schemaPath, 'command', command);
    await _gsettingsSet(schemaPath, 'binding', accelerator);
    _lastRegistered.set(id, { id, name, accelerator, command });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: /** @type {Error} */ (err).message };
  }
}

/**
 * Last successful register params per id, so a suspended binding can be
 * re-installed verbatim on resume without the caller re-deriving the
 * accelerator from settings.
 * @type {Map<string, { id: string; name: string; accelerator: string; command: string }>}
 */
const _lastRegistered = new Map();

/**
 * Temporarily remove a registered keybinding from the desktop while remembering
 * its params, so it stops firing (e.g. while the settings window is open) and
 * can be restored with resumeDesktopShortcut. No-op if the id was never
 * registered through registerDesktopShortcut. Idempotent.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function suspendDesktopShortcut(id) {
  if (!isGnome() || !_lastRegistered.has(id)) return;
  await unregisterDesktopShortcut(id).catch(() => {});
}

/**
 * Re-install a keybinding previously taken down by suspendDesktopShortcut.
 * No-op if the id has no remembered params. Idempotent.
 *
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function resumeDesktopShortcut(id) {
  const params = _lastRegistered.get(id);
  if (!isGnome() || !params) return;
  await registerDesktopShortcut(params).catch(() => {});
}

/**
 * Remove a previously-registered keybinding. Idempotent.
 *
 * @param {string} id
 * @returns {Promise<{ ok: boolean; error?: string }>}
 */
export async function unregisterDesktopShortcut(id) {
  if (!isGnome()) {
    return { ok: false, error: 'Desktop-keybinding registration is only supported on GNOME.' };
  }
  try {
    const raw = await _gsettingsGet(KEYBINDINGS_SCHEMA, KEYBINDINGS_KEY);
    const myPath = _keybindingPath(id);
    const list = _parseArray(raw).filter((p) => p !== myPath);
    await _gsettingsSet(KEYBINDINGS_SCHEMA, KEYBINDINGS_KEY, _formatArray(list));
    // Reset the individual keybinding's keys so a future register starts clean.
    // Best-effort: the schema may not exist if it was never written.
    const schemaPath = _customSchemaPath(id);
    await _gsettingsReset(schemaPath, 'name').catch(() => {});
    await _gsettingsReset(schemaPath, 'command').catch(() => {});
    await _gsettingsReset(schemaPath, 'binding').catch(() => {});
    return { ok: true };
  } catch (err) {
    return { ok: false, error: /** @type {Error} */ (err).message };
  }
}

/**
 * Convert an Electron accelerator string (e.g. `'CommandOrControl+Shift+A'`) to
 * the GTK accelerator format GNOME's custom-keybinding `binding` key expects
 * (e.g. `'<Primary><Shift>a'`).
 *
 * @param {string} accelerator
 * @returns {string | null} null when the accelerator is empty / invalid.
 */
export function electronToGtkAccelerator(accelerator) {
  if (!accelerator || typeof accelerator !== 'string') return null;
  const parts = accelerator.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const modOrder = ['Primary', 'Super', 'Hyper', 'Meta', 'Control', 'Alt', 'Shift'];
  const mods = new Set();
  /** @type {string | null} */
  let key = null;

  for (const part of parts) {
    const lower = part.toLowerCase();
    switch (lower) {
      case 'commandorcontrol':
      case 'cmdorctrl':
        mods.add('Primary');
        break;
      case 'command':
      case 'cmd':
      case 'meta':
        // Cmd does not exist on Linux; GNOME maps <Super> to the meta key,
        // the closest equivalent and how Electron treats `Super`.
        mods.add('Super');
        break;
      case 'control':
      case 'ctrl':
        mods.add('Control');
        break;
      case 'alt':
      case 'option':
      case 'altgr':
        mods.add('Alt');
        break;
      case 'shift':
        mods.add('Shift');
        break;
      case 'super':
        mods.add('Super');
        break;
      default:
        key = _electronKeyToGtkKey(part);
        break;
    }
  }
  if (!key) return null;

  const sortedMods = modOrder.filter((m) => mods.has(m));
  return `${sortedMods.map((m) => `<${m}>`).join('')}${key}`;
}

/** ASCII punctuation → GTK keysym name (the literal char is not a valid keysym name). */
const SINGLE_CHAR_KEYSYMS = {
  '\\': 'backslash',
  '/': 'slash',
  '.': 'period',
  ',': 'comma',
  ';': 'semicolon',
  "'": 'apostrophe',
  '`': 'grave',
  '=': 'equal',
  '-': 'minus',
  '[': 'bracketleft',
  ']': 'bracketright',
};

/**
 * Map an Electron key token to the GTK key name. Single alphanumeric keys are
 * lowercased; punctuation maps to its keysym name; named keys use GTK keysym names.
 *
 * @param {string} key
 * @returns {string}
 */
function _electronKeyToGtkKey(key) {
  // Single-char punctuation: Electron / HotkeyInput emit the literal character
  // (from KeyboardEvent.key), but GTK's accelerator parser needs the keysym NAME
  // (e.g. '\' → 'backslash'), or gtk_accelerator_parse rejects it and the desktop
  // keybinding never fires.
  if (key.length === 1) return SINGLE_CHAR_KEYSYMS[key] ?? key.toLowerCase();
  const upper = key.toUpperCase();
  if (/^F\d+$/.test(upper)) return upper;
  const named = {
    SPACE: 'space',
    TAB: 'Tab',
    ENTER: 'Return',
    RETURN: 'Return',
    ESC: 'Escape',
    ESCAPE: 'Escape',
    BACKSPACE: 'BackSpace',
    DELETE: 'Delete',
    INSERT: 'Insert',
    HOME: 'Home',
    END: 'End',
    PAGEUP: 'Page_Up',
    PAGEDOWN: 'Page_Down',
    UP: 'Up',
    DOWN: 'Down',
    LEFT: 'Left',
    RIGHT: 'Right',
    PRINTSCREEN: 'Print',
    SCROLLLOCK: 'Scroll_Lock',
    PAUSE: 'Pause',
    CAPSLOCK: 'Caps_Lock',
    PLUS: 'plus',
    MINUS: 'minus',
    EQUAL: 'equal',
    COMMA: 'comma',
    PERIOD: 'period',
    SLASH: 'slash',
    BACKSLASH: 'backslash',
    SEMICOLON: 'semicolon',
  };
  return named[upper] ?? key;
}
