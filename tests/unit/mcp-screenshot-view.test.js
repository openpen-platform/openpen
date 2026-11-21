/**
 * Unit tests for the screenshot view pure helpers (electron/mcp/screenshot-view.js).
 *
 * Expected exported API of electron/mcp/screenshot-view.js (per build-plan.md):
 *
 * 1. computeRegionView(region, imageSize)
 *    - region: { x: number, y: number, width: number, height: number } (screenshot pixels)
 *    - imageSize: { width: number, height: number } (full screenshot dimensions in pixels)
 *    - returns: {
 *        crop: { x: number, y: number, width: number, height: number },
 *        outputWidth: number,
 *        outputHeight: number,
 *        scale: number,
 *      }
 *    - Scales toward a 1600 px target long side, capped at 8x upscale; regions larger
 *      than 1600 px on their long side are downscaled and report scale < 1 truthfully.
 *
 * 2. drawCoordinateGrid(bitmap, width, height, options)
 *    - bitmap: Uint8Array | Buffer (4 bytes per pixel, width * height * 4; BGRA or RGBA)
 *    - width, height: output bitmap dimensions in pixels
 *    - options: { grid: number, originX?: number, originY?: number, scale?: number }
 *      - grid: spacing between grid lines in full-screenshot pixels (> 0)
 *      - originX, originY: top-left of this view in full-screenshot pixels (default 0)
 *      - scale: output pixels per full-screenshot pixel (default 1)
 *    - Draws grid lines at full-screenshot multiples of `grid` and numeric labels showing
 *      full-screenshot coordinates (not crop-local coordinates), using colors with R === B
 *      (e.g. magenta 255,0,255 with dark outline) so BGRA and RGBA bitmaps produce
 *      identical bytes. Mutates and returns `bitmap`.
 */
import { describe, it, expect } from 'vitest'
import {
  computeRegionView,
  drawCoordinateGrid,
} from '../../electron/mcp/screenshot-view.js'

function makeSolidBitmap(width, height, r = 128, g = 128, b = 128, a = 255) {
  const buf = new Uint8Array(width * height * 4)
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = r
    buf[i + 1] = g
    buf[i + 2] = b
    buf[i + 3] = a
  }
  return buf
}

function pixelAt(buf, width, x, y) {
  const idx = (y * width + x) * 4
  return [buf[idx], buf[idx + 1], buf[idx + 2], buf[idx + 3]]
}

describe('AC-6 screenshot-view pure helpers', () => {
  it('AC-6: computeRegionView scales small regions toward 1600px long side capped at 8x, and downscales regions larger than 1600px', () => {
    // 400x200 -> long side 400 -> 1600 / 400 = 4x -> 1600x800
    const zoomed = computeRegionView(
      { x: 100, y: 200, width: 400, height: 200 },
      { width: 1920, height: 1080 },
    )
    expect(zoomed.crop).toEqual({ x: 100, y: 200, width: 400, height: 200 })
    expect(zoomed.scale).toBeCloseTo(4, 6)
    expect(zoomed.outputWidth).toBe(1600)
    expect(zoomed.outputHeight).toBe(800)

    // 100x80 -> 1600 / 100 = 16 -> capped at 8x -> 800x640
    const capped = computeRegionView(
      { x: 50, y: 60, width: 100, height: 80 },
      { width: 1920, height: 1080 },
    )
    expect(capped.crop).toEqual({ x: 50, y: 60, width: 100, height: 80 })
    expect(capped.scale).toBeCloseTo(8, 6)
    expect(capped.outputWidth).toBe(800)
    expect(capped.outputHeight).toBe(640)

    // 2000x1000 -> long side > 1600 -> downscaled to 0.8x -> 1600x800
    const downscaled = computeRegionView(
      { x: 0, y: 0, width: 2000, height: 1000 },
      { width: 3840, height: 2160 },
    )
    expect(downscaled.scale).toBeCloseTo(0.8, 6)
    expect(downscaled.outputWidth).toBe(1600)
    expect(downscaled.outputHeight).toBe(800)
  })

  it('AC-6: drawCoordinateGrid draws grid lines at scaled screenshot coordinates with R===B pixels and full-screenshot coordinate labels', () => {
    const width = 400
    const height = 400
    const bg = [128, 128, 128, 255]

    // View starts at (0, 0) with scale 2 and grid spacing 100 screenshot px -> grid lines at output x=200 and y=200.
    const bufOriginZero = makeSolidBitmap(width, height, ...bg)
    const outZero = drawCoordinateGrid(bufOriginZero, width, height, {
      grid: 100,
      originX: 0,
      originY: 0,
      scale: 2,
    }) ?? bufOriginZero

    // Grid lines exist at output x=200 and y=200 (sampled away from edges/labels).
    expect(pixelAt(outZero, width, 200, 120)).not.toEqual(bg)
    expect(pixelAt(outZero, width, 120, 200)).not.toEqual(bg)
    // Interior point far from any grid line or label stays unchanged.
    expect(pixelAt(outZero, width, 100, 100)).toEqual(bg)

    // Every modified pixel uses R === B (BGRA and RGBA byte-identical) and opaque alpha.
    let modifiedOffLineCount = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const px = pixelAt(outZero, width, x, y)
        if (px[0] !== bg[0] || px[1] !== bg[1] || px[2] !== bg[2] || px[3] !== bg[3]) {
          expect(px[0], `pixel (${x},${y}) R===B for BGRA/RGBA parity`).toBe(px[2])
          expect(px[3], `pixel (${x},${y}) opaque alpha`).toBe(255)
          // Pixels more than 2px away from grid lines (x/y = 0 or 200) belong to coordinate labels.
          const onVerticalLine = x <= 2 || Math.abs(x - 200) <= 2
          const onHorizontalLine = y <= 2 || Math.abs(y - 200) <= 2
          if (!onVerticalLine && !onHorizontalLine) modifiedOffLineCount++
        }
      }
    }
    expect(modifiedOffLineCount, 'numeric coordinate labels rendered off the grid lines').toBeGreaterThan(0)

    // Shifted origin by an exact multiple of grid (200, 300): grid line positions are identical
    // (still at output x=200, y=200), so the only difference is the rendered label numbers (200/300 vs 0/100).
    const bufShifted = makeSolidBitmap(width, height, ...bg)
    const outShifted = drawCoordinateGrid(bufShifted, width, height, {
      grid: 100,
      originX: 200,
      originY: 300,
      scale: 2,
    }) ?? bufShifted

    // Grid line pixels away from labels match.
    expect(pixelAt(outShifted, width, 200, 120)).toEqual(pixelAt(outZero, width, 200, 120))
    expect(pixelAt(outShifted, width, 120, 200)).toEqual(pixelAt(outZero, width, 120, 200))

    // Label pixels must differ because labels display full-screenshot coordinates, not crop-local ones.
    let differingPixels = 0
    for (let i = 0; i < outZero.length; i += 4) {
      if (
        outZero[i] !== outShifted[i] ||
        outZero[i + 1] !== outShifted[i + 1] ||
        outZero[i + 2] !== outShifted[i + 2]
      ) {
        differingPixels++
      }
    }
    expect(differingPixels, 'labels reflect originX/originY full-screenshot coordinates').toBeGreaterThan(0)
  })
})
