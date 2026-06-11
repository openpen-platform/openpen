/**
 * cursor-os — native OS cursor hide/show via FFI (koffi).
 *
 * Electron exposes no API to hide the OS cursor on demand; Chromium only issues
 * SetCursor()/NSCursor changes during WM_SETCURSOR / NSCursor events triggered by
 * real pointer movement, so a CSS `cursor: none` rule is not honoured until the
 * pointer moves. The canonical fix is the platform's native cursor API, reached
 * from the main process via FFI:
 *   - macOS: CGDisplayHideCursor / CGDisplayShowCursor (process-wide)
 *   - Windows: ShowCursor(BOOL) (per-process display counter)
 * Linux and every other platform are no-ops (koffi is never loaded there).
 *
 * koffi is lazy-loaded on first use so non-target platforms never pull in the FFI
 * native module. Every native call is wrapped so a load failure or signature
 * mismatch degrades to a no-op instead of crashing the host.
 */

import { createRequire } from 'node:module';
import log from 'electron-log/main.js';

// koffi ships as CommonJS; pull it in via createRequire so the lazy load stays
// synchronous (hide/show must run inline on the drawing-mode transition).
const require = createRequire(import.meta.url);

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

/** @type {boolean} True once an init attempt ran (success or graceful failure). */
let initialised = false;
/** @type {boolean} True when the platform bindings are usable. */
let bindingsReady = false;

/** @type {((display: number) => number) | null} */
let cgDisplayHideCursor = null;
/** @type {((display: number) => number) | null} */
let cgDisplayShowCursor = null;
/** @type {((bShow: number) => number) | null} */
let winShowCursor = null;

/**
 * Tracks whether WE currently hold the cursor hidden, so repeated hide/show calls
 * are idempotent and never unbalance the underlying counter.
 *
 * Windows `ShowCursor` keeps a per-thread display counter: FALSE decrements (the
 * cursor is hidden only while the counter is < 0), TRUE increments. Calling
 * hide twice without an intervening show would drive the counter to -2 and a
 * single show would fail to restore it. This flag gates the native call to
 * exactly one decrement per logical hide and one increment per logical show, so
 * the counter swings strictly between 0 and -1 regardless of caller cadence.
 * On macOS the underlying API is balanced the same way (hide/show must pair), so
 * the same gate keeps both platforms symmetric.
 * @type {boolean}
 */
let osCursorHidden = false;

/**
 * Lazy-load koffi and bind the platform cursor functions. Safe to call multiple
 * times; the bind work runs once. Failures are logged and leave the module in a
 * graceful no-op state (bindingsReady stays false).
 */
export function initCursorOs() {
  if (initialised) return;
  initialised = true;

  if (!IS_MAC && !IS_WIN) return;

  try {
    const koffi = require('koffi');

    if (IS_MAC) {
      const cg = koffi.load(
        '/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices',
      );
      cgDisplayHideCursor = cg.func('int32 CGDisplayHideCursor(uint32 display)');
      cgDisplayShowCursor = cg.func('int32 CGDisplayShowCursor(uint32 display)');
    } else if (IS_WIN) {
      const user32 = koffi.load('user32.dll');
      // Win32 BOOL is a 4-byte int, not a 1-byte C bool; binding it as `int`
      // matches the ABI so the argument is passed at the correct width.
      winShowCursor = user32.func('int32 __stdcall ShowCursor(int bShow)');
    }

    bindingsReady = true;
  } catch (err) {
    log.warn('[cursor-os] native cursor bindings unavailable, cursor hide/show is a no-op:', err?.message);
    bindingsReady = false;
  }
}

/** Hide the OS cursor process-wide. Idempotent: a second call while already hidden does nothing. */
export function hideOsCursor() {
  if (!initialised) initCursorOs();
  if (!bindingsReady || osCursorHidden) return;

  try {
    if (IS_MAC && cgDisplayHideCursor) {
      cgDisplayHideCursor(0);
    } else if (IS_WIN && winShowCursor) {
      winShowCursor(0);
    } else {
      return;
    }
    osCursorHidden = true;
  } catch (err) {
    log.warn('[cursor-os] hideOsCursor failed:', err?.message);
  }
}

/** Restore the OS cursor. Idempotent: a call while already visible does nothing. */
export function showOsCursor() {
  if (!initialised) initCursorOs();
  if (!bindingsReady || !osCursorHidden) return;

  try {
    if (IS_MAC && cgDisplayShowCursor) {
      cgDisplayShowCursor(0);
    } else if (IS_WIN && winShowCursor) {
      winShowCursor(1);
    } else {
      return;
    }
    osCursorHidden = false;
  } catch (err) {
    log.warn('[cursor-os] showOsCursor failed:', err?.message);
  }
}
