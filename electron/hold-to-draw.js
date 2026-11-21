/**
 * hold-to-draw — pure state machines behind the hold-to-draw key. No Electron
 * or native imports, so they run under unit tests.
 *
 * Both consume one sample per poll tick:
 *   keys     — the hold-candidate keys (shared/hold-to-draw.js HOLD_KEYS) held down now
 *   otherKey — a non-modifier key is held, or was pressed since the previous tick
 */

/**
 * @typedef {{ keys: Set<string>, otherKey: boolean }} KeySample
 */

/**
 * The trigger fires only while the key is held ON ITS OWN, so a shortcut that
 * contains the same modifier (Ctrl+C with Right Ctrl, Fn+arrow) never starts
 * drawing, and pressing another key mid-hold ends it.
 *
 * States: idle → active (key down alone) → idle (released);
 * blocked = held together with something else, waits for the release.
 */
export function createHoldTrigger() {
  /** @type {'idle' | 'active' | 'blocked'} */
  let state = 'idle';

  return {
    /**
     * @param {KeySample & { target: string | null, enabled: boolean }} sample
     *   target  — the key to watch (null: off)
     *   enabled — false while drawing mode is on or shortcuts are suspended
     * @returns {'start' | 'end' | null}
     */
    step({ keys, otherKey, target, enabled }) {
      const held = target !== null && keys.has(target);
      const alone = held && keys.size === 1 && !otherKey;
      if (state === 'active') {
        if (!held) { state = 'idle'; return 'end'; }
        if (!alone || !enabled) { state = 'blocked'; return 'end'; }
        return null;
      }
      if (!held) { state = 'idle'; return null; }
      if (state === 'idle') {
        if (alone && enabled) { state = 'active'; return 'start'; }
        // Held while drawing mode is on, or as part of a combo: do nothing
        // until it is released, so leaving drawing mode with the key still
        // down does not start drawing.
        state = 'blocked';
      }
      return null;
    },
    /** @returns {boolean} whether the key currently has the mouse */
    isActive() { return state === 'active'; },
    /** Forget the current hold (key changed, trigger switched off). */
    reset() { state = 'idle'; },
  };
}

/**
 * Records one hold key for the settings row: a single key pressed and released
 * with nothing else pressed in between. A combo (Ctrl+C, Shift+Alt) is ignored
 * and recording keeps waiting, as the other shortcut rows do for invalid keys.
 *
 * @param {(key: string) => boolean} accepts which keys this platform can hold
 */
export function createHoldKeyRecorder(accepts) {
  /** @type {string | null} */
  let candidate = null;
  let dirty = false;

  return {
    /**
     * @param {KeySample} sample
     * @returns {string | null} the recorded key, once it is released
     */
    step({ keys, otherKey }) {
      if (keys.size === 0) {
        const recorded = candidate !== null && !dirty && !otherKey ? candidate : null;
        candidate = null;
        dirty = false;
        return recorded;
      }
      if (otherKey || keys.size > 1) dirty = true;
      if (candidate === null) {
        const [first] = keys;
        candidate = first;
        if (!accepts(first)) dirty = true;
      } else if (!keys.has(candidate)) {
        dirty = true;
      }
      return null;
    },
  };
}
