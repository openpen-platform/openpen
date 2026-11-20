/**
 * Pure helpers for the screenshot tool's `region` and `grid` options. Nothing
 * here touches Electron: the crop geometry is plain arithmetic and the grid is
 * drawn straight onto a 4-bytes-per-pixel bitmap, so both are unit-testable.
 */

/** Long side the zoomed view aims for, in output pixels. */
export const TARGET_LONG_SIDE = 1600;
/** A small region is enlarged at most this many times; a smaller crop is not blown up further. */
export const MAX_ZOOM = 8;

/**
 * Where to crop and how large to make the result so a region can be read.
 * The long side is scaled toward TARGET_LONG_SIDE, enlarging by at most
 * MAX_ZOOM; a region longer than the target is shrunk, and `scale` says so.
 *
 * @param {{ x: number, y: number, width: number, height: number }} region screenshot pixels
 * @param {{ width: number, height: number }} imageSize full screenshot size
 */
export function computeRegionView(region, imageSize) {
  const x = clamp(Math.floor(region.x), 0, imageSize.width - 1);
  const y = clamp(Math.floor(region.y), 0, imageSize.height - 1);
  const right = clamp(Math.ceil(region.x + region.width), x + 1, imageSize.width);
  const bottom = clamp(Math.ceil(region.y + region.height), y + 1, imageSize.height);
  const crop = { x, y, width: right - x, height: bottom - y };
  const scale = Math.min(MAX_ZOOM, TARGET_LONG_SIDE / Math.max(crop.width, crop.height));
  return {
    crop,
    outputWidth: Math.max(1, Math.round(crop.width * scale)),
    outputHeight: Math.max(1, Math.round(crop.height * scale)),
    scale,
  };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// Both colours have R === B, so the bytes are the same whether the bitmap is
// BGRA (Electron's `toBitmap`) or RGBA.
const LINE = [255, 0, 255];
const OUTLINE = [16, 16, 16];

// 5x7 digit font: main has no text drawing, and labels are only numbers.
const GLYPHS = {
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
};
const GLYPH_W = 5;
const GLYPH_H = 7;

/**
 * Draw grid lines every `grid` screenshot pixels, each labelled with its
 * screenshot coordinate (not the coordinate inside a cropped view), so the
 * numbers can be used as drawing coordinates as they are. Mutates and returns
 * `bitmap`.
 *
 * @param {Uint8Array} bitmap width * height * 4 bytes, BGRA or RGBA
 * @param {number} width
 * @param {number} height
 * @param {{ grid: number, originX?: number, originY?: number, scale?: number }} options
 *   originX / originY: where this view's top-left sits in the full screenshot;
 *   scale: output pixels per screenshot pixel.
 */
export function drawCoordinateGrid(bitmap, width, height, { grid, originX = 0, originY = 0, scale = 1 }) {
  if (!(grid > 0) || !(scale > 0)) return bitmap;

  const put = (x, y, color) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    bitmap[i] = color[0];
    bitmap[i + 1] = color[1];
    bitmap[i + 2] = color[2];
    bitmap[i + 3] = 255;
  };
  const rect = (x0, y0, w, h, color) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) put(x, y, color);
  };

  /** Output position of each grid line inside the view, with the screenshot coordinate it stands for. */
  const lines = (origin, extent) => {
    const out = [];
    for (let k = Math.ceil(origin / grid); ; k++) {
      const value = k * grid;
      const pos = Math.round((value - origin) * scale);
      if (pos >= extent) break;
      if (pos >= 0) out.push({ pos, value });
    }
    return out;
  };
  const verticals = lines(originX, width);
  const horizontals = lines(originY, height);

  // Outlines first so a magenta line is never overwritten by a neighbour's outline.
  for (const { pos } of verticals) {
    rect(pos - 1, 0, 1, height, OUTLINE);
    rect(pos + 1, 0, 1, height, OUTLINE);
  }
  for (const { pos } of horizontals) {
    rect(0, pos - 1, width, 1, OUTLINE);
    rect(0, pos + 1, width, 1, OUTLINE);
  }
  for (const { pos } of verticals) rect(pos, 0, 1, height, LINE);
  for (const { pos } of horizontals) rect(0, pos, width, 1, LINE);

  const fontScale = clamp(Math.round(Math.min(width, height) / 600), 1, 3);
  const labelHeight = GLYPH_H * fontScale;
  const drawLabel = (text, x0, y0) => {
    const cells = [];
    [...text].forEach((ch, n) => {
      const rows = GLYPHS[ch];
      if (!rows) return;
      for (let r = 0; r < GLYPH_H; r++) {
        for (let c = 0; c < GLYPH_W; c++) {
          if (rows[r][c] === '1') cells.push([x0 + (n * (GLYPH_W + 1) + c) * fontScale, y0 + r * fontScale]);
        }
      }
    });
    for (const [cx, cy] of cells) rect(cx - 1, cy - 1, fontScale + 2, fontScale + 2, OUTLINE);
    for (const [cx, cy] of cells) rect(cx, cy, fontScale, fontScale, LINE);
  };

  // Vertical-line labels run along the top edge, horizontal-line labels down the
  // left edge, pushed below the top row so the two never overlap at the corner.
  // A label that would land on the previous one is skipped (its line is still
  // drawn), so a fine grid keeps readable labels instead of a smear.
  const topRowBottom = 3 + labelHeight + 3;
  const labelWidth = (text) => (text.length * (GLYPH_W + 1) - 1) * fontScale;
  let nextFreeX = 0;
  for (const { pos, value } of verticals) {
    const text = String(value);
    const x = pos + 3;
    if (x < nextFreeX) continue;
    drawLabel(text, x, 3);
    nextFreeX = x + labelWidth(text) + 4;
  }
  let nextFreeY = topRowBottom;
  for (const { pos, value } of horizontals) {
    const y = Math.max(pos + 3, topRowBottom);
    if (y < nextFreeY) continue;
    drawLabel(String(value), 3, y);
    nextFreeY = y + labelHeight + 4;
  }

  return bitmap;
}
