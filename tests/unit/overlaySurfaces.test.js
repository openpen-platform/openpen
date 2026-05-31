import { describe, it, expect, vi } from 'vitest';
import { StandardSurface } from '../../electron/platform/standard-surface.js';
import { WaylandSurface } from '../../electron/platform/wayland-surface.js';

const mockWin = (destroyed = false) => ({
  isDestroyed: vi.fn(() => destroyed),
  setIgnoreMouseEvents: vi.fn(),
});

describe('setClickThrough — the migrated passthrough primitive (was _setPassthrough)', () => {
  it('StandardSurface keeps {forward:true} so the renderer still gets forwarded mousemove', () => {
    const win = mockWin();
    new StandardSurface({}).setClickThrough(win);
    expect(win.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
    expect(win.setIgnoreMouseEvents).toHaveBeenCalledTimes(1);
  });

  it('WaylandSurface uses a bare empty input region (no {forward:true}, unimplemented on Linux)', () => {
    const win = mockWin();
    new WaylandSurface({}).setClickThrough(win);
    expect(win.setIgnoreMouseEvents).toHaveBeenCalledWith(true);
    expect(win.setIgnoreMouseEvents.mock.calls[0]).toEqual([true]); // exactly one arg
  });

  it('both surfaces no-op on a destroyed window', () => {
    for (const Surface of [StandardSurface, WaylandSurface]) {
      const win = mockWin(true);
      new Surface({}).setClickThrough(win);
      expect(win.setIgnoreMouseEvents).not.toHaveBeenCalled();
    }
  });
});

const mockMain = (destroyed = false) => ({
  isDestroyed: vi.fn(() => destroyed),
  moveTop: vi.fn(),
});

describe('applyDrawingMode — the migrated overlay-lifecycle fork', () => {
  it('StandardSurface captures input on enter and raises the control bar', () => {
    const activeOverlay = mockWin();
    const activeMain = mockMain();
    new StandardSurface({}).applyDrawingMode(true, { activeOverlay, activeMain });
    expect(activeOverlay.setIgnoreMouseEvents).toHaveBeenCalledWith(false);
    expect(activeMain.moveTop).toHaveBeenCalledTimes(1);
  });

  it('StandardSurface restores click-through ({forward:true}) on exit + still raises the bar', () => {
    const activeOverlay = mockWin();
    const activeMain = mockMain();
    new StandardSurface({}).applyDrawingMode(false, { activeOverlay, activeMain });
    expect(activeOverlay.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
    expect(activeMain.moveTop).toHaveBeenCalledTimes(1);
  });

  it('StandardSurface no-ops when there is no live overlay', () => {
    const activeMain = mockMain();
    new StandardSurface({}).applyDrawingMode(true, { activeOverlay: undefined, activeMain });
    new StandardSurface({}).applyDrawingMode(true, { activeOverlay: mockWin(true), activeMain });
    expect(activeMain.moveTop).not.toHaveBeenCalled();
  });

  it('WaylandSurface delegates to the injected coordinator callback and never touches the overlay', () => {
    const reconcileWayland = vi.fn();
    const activeOverlay = mockWin();
    new WaylandSurface({}).applyDrawingMode(true, { reconcileWayland, activeOverlay });
    expect(reconcileWayland).toHaveBeenCalledTimes(1);
    expect(activeOverlay.setIgnoreMouseEvents).not.toHaveBeenCalled();
  });
});
