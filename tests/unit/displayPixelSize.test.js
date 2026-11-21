import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ screen: { on: vi.fn(), dipToScreenPoint: (p) => p } }));
vi.mock('../../electron/logger.js', () => ({ log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const { resolvePixelSize } = await import('../../electron/display-pixel-size.js');

const at125 = { bounds: { x: 0, y: 0, width: 820, height: 615 }, size: { width: 820, height: 615 }, scaleFactor: 1.25 };
const at150 = { bounds: { x: 0, y: 0, width: 683, height: 512 }, size: { width: 683, height: 512 }, scaleFactor: 1.5 };
const at100 = { bounds: { x: 0, y: 0, width: 1024, height: 768 }, size: { width: 1024, height: 768 }, scaleFactor: 1 };
const monitors = [{ x: 0, y: 0, width: 1024, height: 768 }];
const identity = (p) => p;

describe('resolvePixelSize', () => {
  it('ignores a similar-sized monitor that sits elsewhere', () => {
    expect(resolvePixelSize(at100, [{ x: 1920, y: 0, width: 1025, height: 768 }], identity)).toEqual({ pixelWidth: 1024, pixelHeight: 768 });
  });

  it('reports the physical size at 125% and 150% instead of the rounded-up DIP product', () => {
    expect(resolvePixelSize(at125, monitors, identity)).toEqual({ pixelWidth: 1024, pixelHeight: 768 });
    expect(resolvePixelSize(at150, monitors, identity)).toEqual({ pixelWidth: 1024, pixelHeight: 768 });
  });

  it('falls back to the scaled estimate when the OS monitor list is unavailable', () => {
    expect(resolvePixelSize(at125, [], identity)).toEqual({ pixelWidth: 1025, pixelHeight: 769 });
  });

  it('leaves 100% unchanged and ignores a monitor that disagrees by more than a pixel', () => {
    expect(resolvePixelSize(at100, monitors, identity)).toEqual({ pixelWidth: 1024, pixelHeight: 768 });
    expect(resolvePixelSize(at100, [{ x: 0, y: 0, width: 1920, height: 1080 }], identity)).toEqual({ pixelWidth: 1024, pixelHeight: 768 });
  });

  it('matches the monitor by origin on a multi-display layout', () => {
    const second = { ...at125, bounds: { x: 820, y: 0, width: 820, height: 615 } };
    const both = [{ x: 0, y: 0, width: 1025, height: 769 }, { x: 1025, y: 0, width: 1024, height: 768 }];
    expect(resolvePixelSize(second, both, (p) => ({ x: Math.round(p.x * 1.25), y: p.y }))).toEqual({ pixelWidth: 1024, pixelHeight: 768 });
  });
});
