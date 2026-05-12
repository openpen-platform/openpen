/**
 * color-utils unit tests
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  hexToRgb, rgbToHex, hsvToRgb, rgbToHsv,
  hexToHsv, hsvToHex, isValidHex, resolveColorStyle,
} from '../../src/services/color-utils';

// ── hex / rgb ──────────────────────────────────────────────

describe('hexToRgb', () => {
  it('red #ff0000 -> [255, 0, 0]', () => {
    expect(hexToRgb('#ff0000')).toEqual([255, 0, 0]);
  });

  it('white #ffffff -> [255, 255, 255]', () => {
    expect(hexToRgb('#ffffff')).toEqual([255, 255, 255]);
  });

  it('black #000000 -> [0, 0, 0]', () => {
    expect(hexToRgb('#000000')).toEqual([0, 0, 0]);
  });

  it('accent #818cf8 -> correct RGB', () => {
    const [r, g, b] = hexToRgb('#818cf8');
    expect(r).toBe(0x81);
    expect(g).toBe(0x8c);
    expect(b).toBe(0xf8);
  });
});

describe('rgbToHex', () => {
  it('[255, 0, 0] -> #ff0000', () => {
    expect(rgbToHex(255, 0, 0)).toBe('#ff0000');
  });

  it('[0, 0, 0] -> #000000', () => {
    expect(rgbToHex(0, 0, 0)).toBe('#000000');
  });

  it('clamps out-of-range values', () => {
    expect(rgbToHex(300, -5, 255)).toBe('#ff00ff');
  });

  it('rgbToHex(hexToRgb(x)) round-trips', () => {
    const hex = '#3b82f6';
    const [r, g, b] = hexToRgb(hex);
    expect(rgbToHex(r, g, b)).toBe(hex);
  });
});

// ── HSV / RGB ──────────────────────────────────────────────

describe('hsvToRgb', () => {
  it('pure red (0, 100, 100) -> (255, 0, 0)', () => {
    expect(hsvToRgb(0, 100, 100)).toEqual([255, 0, 0]);
  });

  it('pure green (120, 100, 100) -> (0, 255, 0)', () => {
    expect(hsvToRgb(120, 100, 100)).toEqual([0, 255, 0]);
  });

  it('pure blue (240, 100, 100) -> (0, 0, 255)', () => {
    expect(hsvToRgb(240, 100, 100)).toEqual([0, 0, 255]);
  });

  it('white (any H, 0, 100) -> (255, 255, 255)', () => {
    expect(hsvToRgb(180, 0, 100)).toEqual([255, 255, 255]);
  });

  it('black (any H, any S, 0) -> (0, 0, 0)', () => {
    expect(hsvToRgb(60, 50, 0)).toEqual([0, 0, 0]);
  });
});

describe('rgbToHsv', () => {
  it('pure red -> (0, 100, 100)', () => {
    const [h, s, v] = rgbToHsv(255, 0, 0);
    expect(h).toBeCloseTo(0, 0);
    expect(s).toBeCloseTo(100, 0);
    expect(v).toBeCloseTo(100, 0);
  });

  it('pure blue -> (240, 100, 100)', () => {
    const [h, s, v] = rgbToHsv(0, 0, 255);
    expect(h).toBeCloseTo(240, 0);
    expect(s).toBeCloseTo(100, 0);
    expect(v).toBeCloseTo(100, 0);
  });

  it('white -> (0, 0, 100)', () => {
    const [h, s, v] = rgbToHsv(255, 255, 255);
    expect(s).toBeCloseTo(0, 0);
    expect(v).toBeCloseTo(100, 0);
  });

  it('black -> (0, 0, 0)', () => {
    const [h, s, v] = rgbToHsv(0, 0, 0);
    expect(s).toBeCloseTo(0, 0);
    expect(v).toBeCloseTo(0, 0);
  });
});

// ── hex / HSV round-trip ───────────────────────────────────

describe('hexToHsv / hsvToHex round-trip', () => {
  const HEXES = ['#ff0000', '#00ff00', '#0000ff', '#ffffff', '#000000', '#818cf8'];

  for (const hex of HEXES) {
    it(`round-trip: ${hex}`, () => {
      const [h, s, v] = hexToHsv(hex);
      const result = hsvToHex(h, s, v);
      expect(result).toBe(hex);
    });
  }
});

// ── isValidHex ─────────────────────────────────────────────

describe('isValidHex', () => {
  it('#ff0000 -> true', () => expect(isValidHex('#ff0000')).toBe(true));
  it('#818CF8 -> true (uppercase)', () => expect(isValidHex('#818CF8')).toBe(true));
  it('ff0000 (no #) -> false', () => expect(isValidHex('ff0000')).toBe(false));
  it('#fff -> false (3-digit form not accepted)', () => expect(isValidHex('#fff')).toBe(false));
  it('#gggggg -> false (invalid characters)', () => expect(isValidHex('#gggggg')).toBe(false));
  it('empty string -> false', () => expect(isValidHex('')).toBe(false));
});

// ── resolveColorStyle ──────────────────────────────────────

describe('resolveColorStyle', () => {
  /** @type {CanvasRenderingContext2D} */
  let ctx;
  let mockGrad;

  beforeEach(() => {
    mockGrad = { addColorStop: vi.fn() };
    ctx = /** @type {any} */ ({
      createLinearGradient: vi.fn(() => mockGrad),
    });
  });

  it('solid color string -> returned as-is', () => {
    const result = resolveColorStyle(ctx, '#ff0000', { x: 0, y: 0 }, { x: 100, y: 0 });
    expect(result).toBe('#ff0000');
    expect(ctx.createLinearGradient).not.toHaveBeenCalled();
  });

  it('gradient object -> builds CanvasGradient', () => {
    const color = { type: 'linear', from: '#ff0000', to: '#0000ff' };
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 100, y: 0 };
    const result = resolveColorStyle(ctx, color, p0, p1);

    expect(ctx.createLinearGradient).toHaveBeenCalledWith(0, 0, 100, 0);
    expect(mockGrad.addColorStop).toHaveBeenCalledWith(0, '#ff0000');
    expect(mockGrad.addColorStop).toHaveBeenCalledWith(1, '#0000ff');
    expect(result).toBe(mockGrad);
  });

  it('p0 === p1 falls back to "from" color (avoids zero-length gradient)', () => {
    const color = { type: 'linear', from: '#ff0000', to: '#0000ff' };
    const p = { x: 50, y: 50 };
    const result = resolveColorStyle(ctx, color, p, p);
    expect(result).toBe('#ff0000');
    expect(ctx.createLinearGradient).not.toHaveBeenCalled();
  });

  it('null color -> returns null', () => {
    const result = resolveColorStyle(ctx, /** @type {any} */ (null), { x: 0, y: 0 }, { x: 1, y: 0 });
    expect(result).toBeNull();
  });
});
