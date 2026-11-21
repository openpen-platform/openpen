/**
 * hold-to-draw-controller — turns key samples into hold-to-draw start/end and
 * settings-row recordings. Every dependency is injected, so it has no Electron
 * or native imports and runs under unit tests; hold-to-draw-manager.js wires it
 * to the native key reader, a poll timer, settings and IPC.
 */

import { createHoldTrigger, createHoldKeyRecorder } from './hold-to-draw.js';
import { isHoldKeyForPlatform, resolveHoldKey } from '../shared/hold-to-draw.js';

/**
 * @param {{
 *   sample: () => import('./hold-to-draw.js').KeySample,
 *   platform: string,
 *   getStoredKey: () => string | null,
 *   isDrawingMode: () => boolean,
 *   isSuspended: () => boolean,
 *   onStart: () => void,
 *   onEnd: () => void,
 *   fnReadable?: boolean,
 * }} deps
 */
export function createHoldToDrawController(deps) {
  const trigger = createHoldTrigger();
  /** @type {ReturnType<typeof createHoldKeyRecorder> | null} */
  let recorder = null;
  /** @type {((key: string | null) => void) | null} */
  let resolveRecording = null;
  /** @type {string | null} */
  let lastTarget = null;

  function targetKey() {
    return resolveHoldKey(deps.getStoredKey(), deps.platform, { fnReadable: deps.fnReadable }).key;
  }

  function end() {
    if (trigger.isActive()) deps.onEnd();
    trigger.reset();
  }

  return {
    /** @returns {boolean} whether the poll timer needs to run */
    wantsPolling() {
      return recorder !== null || targetKey() !== null;
    },

    /** One poll tick. */
    tick() {
      const sample = deps.sample();
      if (recorder) {
        const recorded = recorder.step(sample);
        if (recorded !== null) this.finishRecording(recorded);
        return;
      }
      const target = targetKey();
      if (target !== lastTarget) {
        // The key changed in settings: forget a hold of the previous key.
        end();
        lastTarget = target;
      }
      const result = trigger.step({
        ...sample,
        target,
        enabled: !deps.isDrawingMode() && !deps.isSuspended(),
      });
      if (result === 'start') deps.onStart();
      else if (result === 'end') deps.onEnd();
    },

    /**
     * Record the next key held on its own (settings row). A recording in
     * progress is cancelled first.
     * @returns {Promise<string | null>} the key, or null when cancelled
     */
    startRecording() {
      this.finishRecording(null);
      end();
      recorder = createHoldKeyRecorder((k) => isHoldKeyForPlatform(k, deps.platform)
        && (k !== 'Fn' || deps.fnReadable !== false));
      return new Promise((resolve) => { resolveRecording = resolve; });
    },

    /** @param {string | null} key */
    finishRecording(key) {
      const resolve = resolveRecording;
      recorder = null;
      resolveRecording = null;
      // Releasing the recorded key must not start drawing right away.
      trigger.reset();
      resolve?.(key);
    },

    /** Stop an active hold (drawing mode was switched on, app quitting). */
    cancel() { end(); },
  };
}
