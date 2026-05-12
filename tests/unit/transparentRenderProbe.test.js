/**
 * Unit tests for electron/transparent-render-probe.js
 *
 * The probe integrates with webContents.capturePage() which requires a real
 * BrowserWindow.  These tests use dependency injection and process.platform
 * mocking to verify the decision logic in isolation.
 *
 * Cases covered:
 * 1. Non-Windows platforms: probe returns false without calling capturePage.
 * 2. Windows + null/destroyed window: probe returns false safely.
 * 3. Windows + capturePage returns image with alpha=0 at transparent pixel:
 *    probe returns false (rendering OK).
 * 4. Windows + capturePage returns image with alpha=255 black at transparent
 *    pixel but incorrect opaque pixel: probe returns false (capture suspect).
 * 5. Windows + capturePage returns image confirming both opaque red and black
 *    at transparent pixel: probe returns true (rendering broken).
 * 6. Windows + capturePage throws: probe returns false (safe default).
 * 7. analyseCapture helper — directly test the decision logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We import only the pure analysis helpers here; probeTransparentRendering is
// tested via a thin integration path that stubs out the Electron calls.
// analyseCapture and readPixel are tested directly.
import { analyseCapture, readPixel } from '../../electron/transparent-render-probe.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers to build synthetic pixel buffers (BGRA order, 4×2 pixels)
// ─────────────────────────────────────────────────────────────────────────────

const WIDTH = 4;
const HEIGHT = 2;

/**
 * Build a BGRA buffer where:
 *  - Row 0 = opaqueRow: { r, g, b, a } repeated across all columns.
 *  - Row 1 = transparentRow: { r, g, b, a } repeated across all columns.
 */
function makeBuffer({ opaqueRow, transparentRow }) {
  const buf = Buffer.alloc(WIDTH * HEIGHT * 4, 0);
  for (let col = 0; col < WIDTH; col++) {
    // Row 0 (opaque)
    const off0 = (0 * WIDTH + col) * 4;
    buf[off0 + 0] = opaqueRow.b;
    buf[off0 + 1] = opaqueRow.g;
    buf[off0 + 2] = opaqueRow.r;
    buf[off0 + 3] = opaqueRow.a;
    // Row 1 (transparent)
    const off1 = (1 * WIDTH + col) * 4;
    buf[off1 + 0] = transparentRow.b;
    buf[off1 + 1] = transparentRow.g;
    buf[off1 + 2] = transparentRow.r;
    buf[off1 + 3] = transparentRow.a;
  }
  return buf;
}

/** A pixel buffer that represents correct rendering: opaque red + fully transparent. */
function correctRenderingBuffer() {
  return makeBuffer({
    opaqueRow:      { r: 255, g: 0,   b: 0,   a: 255 },
    transparentRow: { r: 0,   g: 0,   b: 0,   a: 0   },
  });
}

/** A pixel buffer that represents the Windows GPU bug: opaque red + black-filled transparent. */
function brokenRenderingBuffer() {
  return makeBuffer({
    opaqueRow:      { r: 255, g: 0,   b: 0,   a: 255 },
    transparentRow: { r: 0,   g: 0,   b: 0,   a: 255 },
  });
}

/** A pixel buffer where even the opaque pixel is wrong (capture suspect). */
function suspectCaptureBuffer() {
  return makeBuffer({
    opaqueRow:      { r: 0, g: 0, b: 0, a: 0 },
    transparentRow: { r: 0, g: 0, b: 0, a: 255 },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// analyseCapture unit tests (pure logic, no mocking needed)
// ─────────────────────────────────────────────────────────────────────────────

describe('analyseCapture', () => {
  it('returns false when the transparent pixel has alpha=0 (correct rendering)', () => {
    const buf = correctRenderingBuffer();
    expect(analyseCapture(buf, WIDTH)).toBe(false);
  });

  it('returns true when the transparent pixel has alpha=255 with black RGB (bug present)', () => {
    const buf = brokenRenderingBuffer();
    expect(analyseCapture(buf, WIDTH)).toBe(true);
  });

  it('returns false when the opaque pixel does not render correctly (capture suspect)', () => {
    // Even if the transparent pixel is black/opaque, an incorrect opaque pixel
    // means we cannot trust the capture — safe default is false.
    const buf = suspectCaptureBuffer();
    expect(analyseCapture(buf, WIDTH)).toBe(false);
  });

  it('returns false when transparent pixel has high alpha but is not black (different colour)', () => {
    // Non-black fill at transparent pixel could be something else; do not false-positive.
    const buf = makeBuffer({
      opaqueRow:      { r: 255, g: 0, b: 0, a: 255 },
      transparentRow: { r: 200, g: 100, b: 50, a: 255 },
    });
    expect(analyseCapture(buf, WIDTH)).toBe(false);
  });

  it('returns false when transparent pixel has low alpha (within tolerance)', () => {
    const buf = makeBuffer({
      opaqueRow:      { r: 255, g: 0, b: 0, a: 255 },
      transparentRow: { r: 0,   g: 0, b: 0, a: 10  },
    });
    expect(analyseCapture(buf, WIDTH)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// readPixel unit test
// ─────────────────────────────────────────────────────────────────────────────

describe('readPixel', () => {
  it('decodes BGRA bytes correctly to { r, g, b, a }', () => {
    const buf = Buffer.from([
      0, 255, 128, 64, // BGRA at (0,0): b=0 g=255 r=128 a=64
      0, 0,   0,   0,
      0, 0,   0,   0,
      0, 0,   0,   0,
    ]);
    const px = readPixel(buf, 4, 0, 0);
    expect(px).toEqual({ r: 128, g: 255, b: 0, a: 64 });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// probeTransparentRendering integration tests (with dependency injection)
// ─────────────────────────────────────────────────────────────────────────────

// Dynamically import the probe function so we can replace process.platform.
// Vitest does not support re-importing after vi.stubGlobal; instead we use
// the _deps injection parameter to mock capturePage and test the full path.

import { probeTransparentRendering } from '../../electron/transparent-render-probe.js';

/**
 * Build a minimal fake BrowserWindow-like object.
 *
 * @param {{ captureResult?: Buffer | null; throws?: boolean; loading?: boolean }} opts
 * @returns {object}
 */
function fakeWindow({ captureResult = null, throws = false, loading = false } = {}) {
  return {
    isDestroyed: () => false,
    webContents: {
      isLoading: () => loading,
      once: (_event, cb) => { cb(); },
      executeJavaScript: vi.fn().mockResolvedValue(undefined),
    },
    // capturePage is injected via _deps, not called on webContents directly in this mock.
  };
}

/**
 * Build a fake NativeImage-like object wrapping a buffer.
 *
 * @param {Buffer | null} buf
 * @returns {{ getBitmap: () => Buffer } | null}
 */
function fakeImage(buf) {
  if (buf === null) return null;
  return { getBitmap: () => buf };
}

describe('probeTransparentRendering', () => {
  let originalPlatform;

  beforeEach(() => {
    originalPlatform = process.platform;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform, writable: true });
  });

  function setPlatform(name) {
    Object.defineProperty(process, 'platform', { value: name, writable: true });
  }

  it('returns false on macOS without calling capturePage', async () => {
    setPlatform('darwin');
    const capturePageMock = vi.fn();
    const win = fakeWindow();
    const result = await probeTransparentRendering(win, { capturePage: capturePageMock });
    expect(result).toBe(false);
    expect(capturePageMock).not.toHaveBeenCalled();
  });

  it('returns false on Linux without calling capturePage', async () => {
    setPlatform('linux');
    const capturePageMock = vi.fn();
    const win = fakeWindow();
    const result = await probeTransparentRendering(win, { capturePage: capturePageMock });
    expect(result).toBe(false);
    expect(capturePageMock).not.toHaveBeenCalled();
  });

  it('returns false on Windows when capturePage returns image with correct alpha', async () => {
    setPlatform('win32');
    const buf = correctRenderingBuffer();
    const capturePageMock = vi.fn().mockResolvedValue(fakeImage(buf));
    const win = fakeWindow();
    const result = await probeTransparentRendering(win, { capturePage: capturePageMock });
    expect(result).toBe(false);
    expect(capturePageMock).toHaveBeenCalledOnce();
  });

  it('returns true on Windows when transparent pixel has alpha=255 and black RGB', async () => {
    setPlatform('win32');
    const buf = brokenRenderingBuffer();
    const capturePageMock = vi.fn().mockResolvedValue(fakeImage(buf));
    const win = fakeWindow();
    const result = await probeTransparentRendering(win, { capturePage: capturePageMock });
    expect(result).toBe(true);
  });

  it('returns false on Windows when capturePage throws', async () => {
    setPlatform('win32');
    const capturePageMock = vi.fn().mockRejectedValue(new Error('GPU process crashed'));
    const win = fakeWindow();
    const result = await probeTransparentRendering(win, { capturePage: capturePageMock });
    expect(result).toBe(false);
  });

  it('returns false on Windows when capturePage returns null image', async () => {
    setPlatform('win32');
    const capturePageMock = vi.fn().mockResolvedValue(null);
    const win = fakeWindow();
    const result = await probeTransparentRendering(win, { capturePage: capturePageMock });
    expect(result).toBe(false);
  });

  it('returns false when window is null', async () => {
    setPlatform('win32');
    const result = await probeTransparentRendering(null);
    expect(result).toBe(false);
  });

  it('returns false when window is already destroyed', async () => {
    setPlatform('win32');
    const win = { isDestroyed: () => true, webContents: {} };
    const result = await probeTransparentRendering(win);
    expect(result).toBe(false);
  });
});
