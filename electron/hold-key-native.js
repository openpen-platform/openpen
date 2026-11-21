/**
 * hold-key-native — reads which modifier keys are held, system-wide, through
 * koffi. Polled by hold-to-draw-manager.js; no permission prompt is needed:
 *   - macOS: the device-dependent bits of CGEventSourceFlagsState for the
 *     left/right modifiers, CGEventSourceKeyState for Fn and for keys still
 *     held, CGEventSourceSecondsSinceLastEventType(keyDown) for any other key
 *     pressed. None needs Accessibility or Input Monitoring.
 *   - Windows: GetAsyncKeyState per virtual key.
 * Other platforms get null: hold-to-draw is not offered there.
 *
 * koffi is lazy-loaded; a load or bind failure is logged once and returns null.
 */

import { createRequire } from 'node:module';
import log from 'electron-log/main.js';

const require = createRequire(import.meta.url);

/** macOS virtual key codes (HIToolbox Events.h). */
const MAC_KEYCODES = Object.freeze({
  Fn: 63,
  ControlLeft: 59, ControlRight: 62,
  AltLeft: 58, AltRight: 61,
  ShiftLeft: 56, ShiftRight: 60,
  MetaLeft: 55, MetaRight: 54,
});

/** Windows virtual-key codes. */
const WIN_VKS = Object.freeze({
  ControlLeft: 0xa2, ControlRight: 0xa3,
  AltLeft: 0xa4, AltRight: 0xa5,
  ShiftLeft: 0xa0, ShiftRight: 0xa1,
  MetaLeft: 0x5b, MetaRight: 0x5c,
});

/**
 * Windows virtual keys that are NOT "another key": mouse buttons, the generic
 * and sided modifiers. Every other code from 0x08 to 0xFE counts.
 */
const WIN_IGNORED_VKS = new Set([
  0x01, 0x02, 0x03, 0x04, 0x05, 0x06,
  0x10, 0x11, 0x12,
  0xa0, 0xa1, 0xa2, 0xa3, 0xa4, 0xa5,
  0x5b, 0x5c,
]);

const CG_COMBINED_SESSION_STATE = 0;
const CG_EVENT_KEY_DOWN = 10;

/**
 * @typedef {{
 *   sample: () => import('./hold-to-draw.js').KeySample,
 *   fnReadable: boolean,
 * }} HoldKeyReader
 */

/**
 * @param {string} [platform]
 * @returns {HoldKeyReader | null}
 */
export function createNativeKeyReader(platform = process.platform) {
  try {
    if (platform === 'darwin') return createMacReader();
    if (platform === 'win32') return createWinReader();
  } catch (err) {
    log.warn('[hold-to-draw] native key reader unavailable, hold-to-draw is off:', err?.message);
  }
  return null;
}

function createMacReader() {
  const koffi = require('koffi');
  const cg = koffi.load('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices');
  const keyState = cg.func('bool CGEventSourceKeyState(int32_t, uint16_t)');
  const sinceLast = cg.func('double CGEventSourceSecondsSinceLastEventType(int32_t, uint32_t)');
  const flagsState = cg.func('uint64_t CGEventSourceFlagsState(int32_t)');
  return {
    fnReadable: true,
    sample: createMacSampler({
      isDown: (code) => keyState(CG_COMBINED_SESSION_STATE, code),
      flags: () => flagsState(CG_COMBINED_SESSION_STATE),
      secondsSinceKeyDown: () => sinceLast(CG_COMBINED_SESSION_STATE, CG_EVENT_KEY_DOWN),
    }),
  };
}

function createWinReader() {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const getAsyncKeyState = user32.func('int16_t __stdcall GetAsyncKeyState(int vKey)');
  return {
    fnReadable: false,
    sample: createWinSampler((vk) => (getAsyncKeyState(vk) & 0x8000) !== 0),
  };
}

/** Device-dependent modifier bits of CGEventFlags (IOKit NX_DEVICE*KEYMASK). */
const MAC_SIDE_BITS = Object.freeze([
  ['ControlLeft', 0x1], ['ControlRight', 0x2000],
  ['ShiftLeft', 0x2], ['ShiftRight', 0x4],
  ['MetaLeft', 0x8], ['MetaRight', 0x10],
  ['AltLeft', 0x20], ['AltRight', 0x40],
]);

/** macOS key codes that are modifiers (or Caps Lock), never "another key". */
const MAC_MODIFIER_CODES = new Set([...Object.values(MAC_KEYCODES), 57]);

/**
 * macOS sampler over injected key-state reads (exported for tests).
 * @param {{ isDown: (code: number) => boolean, flags: () => number | bigint, secondsSinceKeyDown: () => number }} io
 * @returns {() => import('./hold-to-draw.js').KeySample}
 */
export function createMacSampler({ isDown, flags, secondsSinceKeyDown }) {
  let prevSinceKeyDown = secondsSinceKeyDown();
  return () => {
    const keys = new Set();
    // Per-key state reports a modifier under its LEFT key code whichever
    // side was pressed (seen with Right Option), so the side comes from the
    // device-dependent bits of the modifier flags instead. Fn has no side
    // and reads correctly per key.
    if (isDown(MAC_KEYCODES.Fn)) keys.add('Fn');
    const f = Number(flags());
    for (const [name, bit] of MAC_SIDE_BITS) {
      if (f & bit) keys.add(name);
    }
    // Modifier presses are flagsChanged events, not keyDown, so the time
    // since the last keyDown only drops when a non-modifier key (or its
    // auto-repeat) went down since the previous sample.
    const since = secondsSinceKeyDown();
    let otherKey = since < prevSinceKeyDown;
    prevSinceKeyDown = since;
    // A key held since before the modifier went down sends no new keyDown
    // (and may not repeat): read the keys still down while a modifier is.
    if (keys.size > 0) {
      for (let code = 0; code < 128 && !otherKey; code++) {
        if (!MAC_MODIFIER_CODES.has(code) && isDown(code)) otherKey = true;
      }
    }
    return { keys, otherKey };
  };
}

/**
 * Windows sampler over an injected GetAsyncKeyState read (exported for tests).
 * @param {(vk: number) => boolean} isDown
 * @returns {() => import('./hold-to-draw.js').KeySample}
 */
export function createWinSampler(isDown) {
  const entries = Object.entries(WIN_VKS);
  // AltGr layouts send Left Ctrl and Right Alt in the same instant; a real
  // Left Ctrl + Right Alt combo presses them one after the other. Only the
  // simultaneous pair is AltGr, read as Right Alt alone.
  let altGr = false;
  let prev = new Set();
  return () => {
    const keys = new Set();
    for (const [name, vk] of entries) {
      if (isDown(vk)) keys.add(name);
    }
    const pair = keys.has('AltRight') && keys.has('ControlLeft');
    if (!pair) altGr = false;
    else if (!prev.has('AltRight') && !prev.has('ControlLeft')) altGr = true;
    prev = new Set(keys);
    if (pair && altGr) keys.delete('ControlLeft');
    // Scanning every key only matters while a modifier is down.
    let otherKey = false;
    if (keys.size > 0) {
      for (let vk = 0x08; vk <= 0xfe && !otherKey; vk++) {
        if (!WIN_IGNORED_VKS.has(vk) && isDown(vk)) otherKey = true;
      }
    }
    return { keys, otherKey };
  };
}
