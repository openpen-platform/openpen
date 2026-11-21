/**
 * Hold-to-draw: shared vocabulary for the key that, held on its own outside
 * drawing mode, lets the user draw until it is released. Used by the main
 * process (polling + trigger) and by the renderer (settings row, tool choice).
 *
 * Only single modifier keys are accepted: the native polling APIs read
 * modifier state, and a letter key would fire while the user types.
 */

/** Every key the hold-to-draw setting can hold. Fn is macOS only. */
export const HOLD_KEYS = Object.freeze([
  'Fn',
  'ControlLeft', 'ControlRight',
  'AltLeft', 'AltRight',
  'ShiftLeft', 'ShiftRight',
  'MetaLeft', 'MetaRight',
]);

/** Stored value that turns hold-to-draw off. */
export const HOLD_KEY_OFF = 'Off';

/**
 * Tools that take typed text. Holding a key to draw never types, so such a
 * tool is swapped for the pen while the key is held.
 */
export const TYPING_TOOL_IDS = Object.freeze(['text']);

/** Tool used instead of a typing tool while the key is held. */
export const HOLD_FALLBACK_TOOL_ID = 'freehand';

/**
 * @param {string} platform
 * @returns {string | null} the default key, or null where hold-to-draw is not supported
 */
export function defaultHoldKey(platform) {
  if (platform === 'darwin') return 'Fn';
  if (platform === 'win32') return 'ControlRight';
  return null;
}

/**
 * @param {unknown} key
 * @param {string} platform
 * @returns {boolean} whether `key` can be held on `platform`
 */
export function isHoldKeyForPlatform(key, platform) {
  if (typeof key !== 'string' || !HOLD_KEYS.includes(key)) return false;
  return key !== 'Fn' || platform === 'darwin';
}

/**
 * Resolve the stored setting into the key to watch.
 *
 * `stored` is null for "platform default", HOLD_KEY_OFF for off, or a key.
 * A key this platform cannot read (Fn outside macOS, or Fn where the native
 * reader reports it unreadable) falls back to the platform default, and
 * `fallback` tells the settings row to say so.
 *
 * @param {string | null | undefined} stored
 * @param {string} platform
 * @param {{ fnReadable?: boolean }} [opts]
 * @returns {{ key: string | null, fallback: boolean }} key is null when off or unsupported
 */
export function resolveHoldKey(stored, platform, opts = {}) {
  const fnReadable = opts.fnReadable !== false;
  const platformDefault = defaultHoldKey(platform);
  const usable = (k) => isHoldKeyForPlatform(k, platform) && (k !== 'Fn' || fnReadable);
  const fallbackKey = () => {
    if (platformDefault && usable(platformDefault)) return platformDefault;
    // macOS with Fn unreadable: Right Control is the closest one-key choice.
    if (platform === 'darwin') return 'ControlRight';
    return null;
  };
  if (stored === HOLD_KEY_OFF) return { key: null, fallback: false };
  if (stored === null || stored === undefined) {
    if (platformDefault && usable(platformDefault)) return { key: platformDefault, fallback: false };
    return { key: fallbackKey(), fallback: platformDefault !== null };
  }
  if (usable(stored)) return { key: stored, fallback: false };
  return { key: fallbackKey(), fallback: true };
}

/**
 * @param {string | null | undefined} toolId
 * @returns {string | null | undefined} the tool to draw with while the key is held
 */
export function holdToDrawToolId(toolId) {
  if (toolId && TYPING_TOOL_IDS.includes(toolId)) return HOLD_FALLBACK_TOOL_ID;
  return toolId;
}
