/**
 * Physical pixel size of a display.
 *
 * `display.size` is in DIPs and Chromium rounds it up on Windows when the
 * scale factor does not divide the resolution (1024x768 at 125% reports
 * 820x615), so `size * scaleFactor` overshoots by a pixel (1025x769). Both
 * `screen.dipToScreenRect` and `desktopCapturer` start from the same rounded
 * DIP numbers, so the real size is only available from the OS: on Windows we
 * read the monitor rectangles from user32 through koffi (like
 * hold-key-native.js). On every other platform, and if koffi cannot load or
 * bind, the size falls back to `size * scaleFactor`.
 */

import { createRequire } from 'node:module';
import { screen } from 'electron';
import { log } from './logger.js';

const require = createRequire(import.meta.url);

/** DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2: monitor rects in physical pixels at any scale. */
const PER_MONITOR_AWARE_V2 = -4;

/** @type {null | (() => { x: number, y: number, width: number, height: number }[])} */
let enumerate = null;
let loadFailed = false;
let callWarned = false;

function createWinEnumerator() {
  const koffi = require('koffi');
  const user32 = koffi.load('user32.dll');
  const Rect = koffi.struct('OpenPenMonitorRect', { left: 'int32', top: 'int32', right: 'int32', bottom: 'int32' });
  // Win32 BOOL is a 32-bit int.
  const EnumProc = koffi.proto('int __stdcall OpenPenMonitorEnumProc(void *hMonitor, void *hdc, OpenPenMonitorRect *rect, intptr_t data)');
  const enumDisplayMonitors = user32.func('int __stdcall EnumDisplayMonitors(void *hdc, void *clip, OpenPenMonitorEnumProc *proc, intptr_t data)');
  const setThreadDpiContext = user32.func('intptr_t __stdcall SetThreadDpiAwarenessContext(intptr_t context)');
  return () => {
    const found = [];
    const callback = koffi.register((hMonitor, hdc, rect) => {
      const r = koffi.decode(rect, Rect);
      found.push({ x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top });
      return 1;
    }, koffi.pointer(EnumProc));
    // Scoped to this thread and restored, so Electron's own awareness is untouched.
    // 0 means the switch failed; Electron is per-monitor aware itself, so go on.
    let previous = 0;
    try {
      previous = setThreadDpiContext(PER_MONITOR_AWARE_V2);
      return enumDisplayMonitors(null, null, callback, 0) ? found : [];
    } finally {
      try {
        if (previous) setThreadDpiContext(previous);
      } finally {
        koffi.unregister(callback);
      }
    }
  };
}

/**
 * Physical monitor rectangles, or [] where they cannot be read. A load or
 * bind failure is logged once and disables the lookup (like hold-key-native);
 * a failed single call is logged once and retried on the next request.
 */
export function readNativeMonitors() {
  if (process.platform !== 'win32' || loadFailed) return [];
  if (!enumerate) {
    try {
      enumerate = createWinEnumerator();
    } catch (err) {
      loadFailed = true;
      log.warn('[display] native monitor sizes unavailable, using the scaled estimate:', err?.message);
      return [];
    }
  }
  try {
    return enumerate();
  } catch (err) {
    if (!callWarned) log.warn('[display] reading native monitor sizes failed:', err?.message);
    callWarned = true;
    return [];
  }
}

/** Rounding slack between the converted DIP origin and the monitor origin. */
const ORIGIN_TOLERANCE_PX = 2;

/**
 * Physical size of `display`. `monitors` are the OS monitor rectangles in
 * physical pixels; the one that sits at the display's origin and agrees with
 * the estimate to within a pixel wins, otherwise the estimate is returned.
 */
export function resolvePixelSize(display, monitors, dipToScreenPoint) {
  const estimate = {
    pixelWidth: Math.round(display.size.width * display.scaleFactor),
    pixelHeight: Math.round(display.size.height * display.scaleFactor),
  };
  if (!monitors.length || !dipToScreenPoint || !display.bounds) return estimate;
  const origin = dipToScreenPoint({ x: display.bounds.x, y: display.bounds.y });
  let best = null;
  let bestDistance = Infinity;
  for (const m of monitors) {
    if (Math.abs(m.width - estimate.pixelWidth) > 1 || Math.abs(m.height - estimate.pixelHeight) > 1) continue;
    const distance = Math.abs(m.x - origin.x) + Math.abs(m.y - origin.y);
    if (distance > ORIGIN_TOLERANCE_PX) continue;
    if (distance < bestDistance) { best = m; bestDistance = distance; }
  }
  return best ? { pixelWidth: best.width, pixelHeight: best.height } : estimate;
}

export function displayPixelSize(display) {
  const win = process.platform === 'win32';
  return resolvePixelSize(display, win ? readNativeMonitors() : [], win ? (p) => screen.dipToScreenPoint(p) : null);
}
