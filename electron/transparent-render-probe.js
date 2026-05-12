/**
 * transparent-render-probe.js — Windows transparent-rendering failure detector.
 *
 * Some Windows GPU/driver combinations (Electron issue #40515) render
 * transparent + frameless + alwaysOnTop BrowserWindows with a solid black
 * background instead of actual transparency.  This module detects that
 * failure at boot by:
 *
 *   1. Waiting for the given mainWindow's renderer to finish loading.
 *   2. Injecting a tiny test element via executeJavaScript: a 1×1 pixel div
 *      painted RGB(255, 0, 0) at the top-left corner, and a 1×1 pixel div
 *      painted transparent adjacent to it.
 *   3. Capturing the window via webContents.capturePage() with a small rect.
 *   4. Reading RGBA values from the NativeImage buffer at the two known pixel
 *      positions.
 *   5. Deciding: if the transparent pixel has alpha > 0 AND its RGB is near
 *      black (the typical failure colour), the rendering is broken.
 *
 * The probe is a one-shot fire-and-forget: it runs after first paint and
 * resolves without blocking app startup.
 *
 * Only runs on Windows (process.platform === 'win32').  On all other
 * platforms the function immediately returns false (not broken).
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Pixel coordinates used for the capture region and pixel reads.
const PROBE_X = 0;
const PROBE_Y = 0;
const PROBE_WIDTH = 4;
const PROBE_HEIGHT = 2;

// Offset within the capture: row 0 = opaque red, row 1 = transparent.
const OPAQUE_PIXEL_ROW = 0;
const TRANSPARENT_PIXEL_ROW = 1;

// Alpha threshold: transparent pixel must be ≤ this to pass.
const MAX_TRANSPARENT_ALPHA = 16;

// RGB threshold: a "black" background reads as (0,0,0) or very dark.
const BLACK_CHANNEL_THRESHOLD = 30;

/**
 * JavaScript injected into the renderer to insert the test pattern.
 * The element is removed after the capture so it never appears to users.
 */
const INJECT_SCRIPT = `
(function () {
  var probe = document.createElement('div');
  probe.id = '__openpen_render_probe__';
  probe.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'width:4px',
    'height:2px',
    'z-index:2147483647',
    'pointer-events:none',
    'overflow:hidden',
  ].join(';');

  // Top row (y=0): solid opaque red — confirms the GPU renders colour at all.
  var red = document.createElement('div');
  red.style.cssText = 'position:absolute;top:0;left:0;width:4px;height:1px;background:rgb(255,0,0);opacity:1;';
  probe.appendChild(red);

  // Bottom row (y=1): fully transparent — reveals the bug when alpha != 0.
  var transparent = document.createElement('div');
  transparent.style.cssText = 'position:absolute;top:1px;left:0;width:4px;height:1px;background:transparent;';
  probe.appendChild(transparent);

  document.documentElement.appendChild(probe);
})();
`;

/**
 * Cleanup script: removes the probe element after capture.
 */
const CLEANUP_SCRIPT = `
(function () {
  var el = document.getElementById('__openpen_render_probe__');
  if (el) el.parentNode.removeChild(el);
})();
`;

/**
 * Read RGBA at (col, row) from a raw BGRA buffer (Electron NativeImage default).
 *
 * @param {Buffer} buf - Raw pixel buffer (BGRA order).
 * @param {number} width - Image width in pixels.
 * @param {number} col - X coordinate.
 * @param {number} row - Y coordinate.
 * @returns {{ r: number; g: number; b: number; a: number }}
 */
function readPixel(buf, width, col, row) {
  const offset = (row * width + col) * 4;
  // Electron capturePage returns BGRA.
  const b = buf[offset];
  const g = buf[offset + 1];
  const r = buf[offset + 2];
  const a = buf[offset + 3];
  return { r, g, b, a };
}

/**
 * Decide whether the captured pixels indicate the transparent-rendering bug.
 *
 * @param {Buffer} buf - Raw BGRA pixel buffer from capturePage.
 * @param {number} width - Width of the captured region in pixels.
 * @returns {boolean} true if the rendering is broken.
 */
function analyseCapture(buf, width) {
  const opaque = readPixel(buf, width, 0, OPAQUE_PIXEL_ROW);
  const transparent = readPixel(buf, width, 0, TRANSPARENT_PIXEL_ROW);

  // The opaque pixel must render with alpha=255 and recognisably red.
  // If it doesn't, the capture itself is suspect — don't false-positive.
  const opaqueRendersCorrectly = opaque.a > 200 && opaque.r > 200 && opaque.g < 80;
  if (!opaqueRendersCorrectly) return false;

  // The transparent pixel should have alpha=0.  If it has non-trivial alpha
  // AND its colour is dark (black background bleed), that's the failure.
  const transparentBroken =
    transparent.a > MAX_TRANSPARENT_ALPHA &&
    transparent.r < BLACK_CHANNEL_THRESHOLD &&
    transparent.g < BLACK_CHANNEL_THRESHOLD &&
    transparent.b < BLACK_CHANNEL_THRESHOLD;

  return transparentBroken;
}

/**
 * Wait for the window's renderer to finish loading.
 *
 * @param {Electron.BrowserWindow} win
 * @returns {Promise<void>}
 */
function waitForLoad(win) {
  return new Promise((resolve) => {
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', resolve);
    } else {
      resolve();
    }
  });
}

/**
 * Run the transparent-rendering probe on the given BrowserWindow.
 *
 * @param {Electron.BrowserWindow} mainWindow
 * @param {{ capturePage?: (rect: object) => Promise<Electron.NativeImage> }} [_deps]
 *   Optional dependency injection (for unit testing).
 * @returns {Promise<boolean>} Resolves true if transparent rendering is broken.
 */
export async function probeTransparentRendering(mainWindow, _deps) {
  // Only relevant on Windows.
  if (process.platform !== 'win32') return false;

  if (!mainWindow || mainWindow.isDestroyed()) return false;

  try {
    await waitForLoad(mainWindow);

    // Inject test pattern.
    await mainWindow.webContents.executeJavaScript(INJECT_SCRIPT);

    // Small delay to let the paint flush.
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Capture the probe region.
    const rect = { x: PROBE_X, y: PROBE_Y, width: PROBE_WIDTH, height: PROBE_HEIGHT };
    const capturePageFn = _deps?.capturePage ??
      ((r) => mainWindow.webContents.capturePage(r));
    const image = await capturePageFn(rect);

    // Clean up the probe element.
    await mainWindow.webContents.executeJavaScript(CLEANUP_SCRIPT).catch(() => {});

    if (!image) return false;

    const buf = image.getBitmap();
    if (!buf || buf.length < PROBE_WIDTH * PROBE_HEIGHT * 4) return false;

    return analyseCapture(buf, PROBE_WIDTH);
  } catch {
    // Any error means we cannot determine the state; default to not broken.
    return false;
  }
}

// Export helpers for unit testing.
export { analyseCapture, readPixel };
