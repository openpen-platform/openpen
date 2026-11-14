/**
 * macos-window — native NSWindow tweaks that Electron does not expose (koffi FFI).
 *
 * Why: since macOS Sonoma, clicking the desktop wallpaper triggers "Click
 * wallpaper to reveal desktop" (`com.apple.WindowManager`
 * `EnableStandardClickToShowDesktop`, on by default). The window server slides
 * every ordinary window to the screen edge. OpenPen's two full-screen
 * transparent windows (control bar + overlay) end up at y≈1012 while Electron
 * still reports their old bounds, visible=true and opacity=1, so the ball and
 * the bar vanish and no Electron-side call (focus, setOpacity, setBounds,
 * hide/show, moveTop) brings them back.
 *
 * `NSWindowCollectionBehaviorStationary` ("the window is unaffected by Exposé
 * and stays visible and stationary, like the desktop window") exempts a window
 * from that slide; verified on macOS 15 (Apple Silicon) with Electron 42.
 *
 * Contract: darwin only. Every other platform returns false without loading
 * koffi. Any load / bind / call failure is logged once and degrades to a
 * no-op (the window keeps today's behaviour).
 */

import { createRequire } from 'node:module';
import log from 'electron-log/main.js';

// koffi ships as CommonJS; lazy-load synchronously like cursor-os.js.
const require = createRequire(import.meta.url);

/** NSWindowCollectionBehavior bit values (AppKit/NSWindow.h). */
export const NS_COLLECTION_BEHAVIOR = Object.freeze({
  CAN_JOIN_ALL_SPACES: 1 << 0,
  MOVE_TO_ACTIVE_SPACE: 1 << 1,
  MANAGED: 1 << 2,
  TRANSIENT: 1 << 3,
  STATIONARY: 1 << 4,
  FULL_SCREEN_PRIMARY: 1 << 7,
  FULL_SCREEN_AUXILIARY: 1 << 8,
});

// Managed / Transient / Stationary are mutually exclusive (Apple, "Setting
// Window Collection Behavior"), so setting Stationary clears the other two.
const EXPOSE_GROUP_MASK =
  NS_COLLECTION_BEHAVIOR.MANAGED | NS_COLLECTION_BEHAVIOR.TRANSIENT | NS_COLLECTION_BEHAVIOR.STATIONARY;

/**
 * @typedef {object} ObjcBindings
 * @property {(buf: Buffer) => unknown} viewFromHandle  decode the NSView* held by getNativeWindowHandle()
 * @property {(obj: unknown, selector: string) => unknown} sendPtr   objc_msgSend returning an object
 * @property {(obj: unknown, selector: string) => number} sendUInt   objc_msgSend returning NSUInteger
 * @property {(obj: unknown, selector: string, value: number) => void} sendSetUInt  objc_msgSend(obj, sel, NSUInteger)
 */

/** @type {boolean} */
let initialised = false;
/** @type {ObjcBindings | null} */
let bindings = null;
/** @type {Set<string>} kinds already warned about (init vs per-call failures are logged independently) */
const warned = new Set();

function warnOnce(kind, msg, err) {
  if (warned.has(kind)) return;
  warned.add(kind);
  log.warn(`[macos-window] ${msg}`, err?.message ?? '');
}

/**
 * Bind libobjc through koffi. Runs once per process; leaves `bindings` null on failure.
 * A failure is deterministic (koffi missing from the package, libobjc not loadable), so it
 * is deliberately NOT retried: the feature stays off and one warning is logged.
 */
function init() {
  if (initialised) return;
  initialised = true;
  if (process.platform !== 'darwin') return;

  try {
    const koffi = require('koffi');
    const objc = koffi.load('/usr/lib/libobjc.A.dylib');
    const selRegisterName = objc.func('void *sel_registerName(const char *name)');
    // objc_msgSend is not variadic in the ABI (arm64 and x86-64 alike), so each
    // use gets its own non-variadic prototype. Integer / pointer returns need no
    // objc_msgSend_stret / _fpret variant on either architecture.
    const msgPtr = objc.func('void *objc_msgSend(void *self, void *sel)');
    const msgUInt = objc.func('uint64 objc_msgSend(void *self, void *sel)');
    const msgSetUInt = objc.func('void objc_msgSend(void *self, void *sel, uint64 value)');
    /** @type {Map<string, unknown>} */
    const selCache = new Map();
    const sel = (name) => {
      let s = selCache.get(name);
      if (!s) { s = selRegisterName(name); selCache.set(name, s); }
      return s;
    };
    bindings = {
      viewFromHandle: (buf) => koffi.decode(buf, 'void *'),
      sendPtr: (obj, selector) => msgPtr(obj, sel(selector)),
      sendUInt: (obj, selector) => Number(msgUInt(obj, sel(selector))),
      sendSetUInt: (obj, selector, value) => { msgSetUInt(obj, sel(selector), value); },
    };
  } catch (err) {
    warnOnce('init', 'native bindings unavailable, collection-behavior tweaks are a no-op:', err);
    bindings = null;
  }
}

/**
 * Mark the window Stationary so the reveal-desktop gesture leaves it in place.
 * Call AFTER setVisibleOnAllWorkspaces (which rewrites the bit field); the
 * existing bits (CanJoinAllSpaces, FullScreenAuxiliary, ...) are kept. Every
 * window that calls setVisibleOnAllWorkspaces on macOS needs this call.
 *
 * @param {Electron.BrowserWindow} win
 * @returns {boolean} true when the Stationary bit reads back as set
 */
export function keepWindowStationary(win) {
  if (process.platform !== 'darwin') return false;
  if (!win || win.isDestroyed()) return false;
  init();
  if (!bindings) return false;
  try {
    const view = bindings.viewFromHandle(win.getNativeWindowHandle());
    const nsWindow = view ? bindings.sendPtr(view, 'window') : null;
    if (!nsWindow) return false;
    const before = bindings.sendUInt(nsWindow, 'collectionBehavior');
    const next = (before & ~EXPOSE_GROUP_MASK) | NS_COLLECTION_BEHAVIOR.STATIONARY;
    if (next !== before) bindings.sendSetUInt(nsWindow, 'setCollectionBehavior:', next);
    const after = bindings.sendUInt(nsWindow, 'collectionBehavior');
    const ok = (after & NS_COLLECTION_BEHAVIOR.STATIONARY) !== 0;
    log.info(`[macos-window] collectionBehavior 0x${before.toString(16)} -> 0x${after.toString(16)} (stationary=${ok})`);
    return ok;
  } catch (err) {
    warnOnce('call', 'keepWindowStationary failed, window keeps default behaviour:', err);
    return false;
  }
}

/**
 * Test seam: inject fake bindings (or null) and reset the warn latches.
 * @internal not part of the module contract; production code must not call it.
 */
export function __setBindingsForTest(fake) {
  initialised = true;
  bindings = fake;
  warned.clear();
}
