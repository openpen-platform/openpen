/**
 * Positioning engine behaviour when the OS reports no displays
 * (e.g. Wayland placeholder screen): intents must still resolve, and the
 * primary display's workArea is used instead.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const primary = {
  id: 7,
  scaleFactor: 1,
  bounds:   { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};

const { screenMock, logMock } = vi.hoisted(() => ({
  screenMock: {
    getAllDisplays: vi.fn(),
    getPrimaryDisplay: vi.fn(),
    getCursorScreenPoint: vi.fn(() => ({ x: 400, y: 300 })),
  },
  logMock: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

vi.mock('electron', () => ({ screen: screenMock }));
vi.mock('electron-log/main.js', () => ({ default: logMock }));

const barBounds = { leftFromBall: 20, rightFromBall: 580, topFromBall: 20, bottomFromBall: 60 };

describe('positioning engine without display info', () => {
  let processIntent;

  beforeEach(async () => {
    // Fresh engine module per test: it keeps state and the "no displays" flag at module level.
    vi.resetModules();
    ({ processIntent } = await import('../../electron/positioning-engine.js'));
    screenMock.getAllDisplays.mockReset();
    screenMock.getPrimaryDisplay.mockReset();
    screenMock.getPrimaryDisplay.mockReturnValue(primary);
    logMock.warn.mockReset();
  });

  it('bar-expand falls back to the primary display and logs once', async () => {
    screenMock.getAllDisplays.mockReturnValue([]);
    await processIntent({ type: 'init', persistedBallScreenPos: { x: 960, y: 500 } });

    const out = await processIntent({ type: 'bar-expand', barBounds });

    expect(out.state.activeDisplayId).toBe(primary.id);
    expect(out.windowCommands[0].windowScreenPos).toEqual({ x: 0, y: 0 });
    expect(out.state.ballScreenPos.x).toBeGreaterThanOrEqual(20);
    expect(logMock.warn).toHaveBeenCalledTimes(1);
  });

  it('drag-move, drag-end and bar-collapse resolve without display info', async () => {
    screenMock.getAllDisplays.mockReturnValue([]);
    await processIntent({ type: 'init', persistedBallScreenPos: { x: 960, y: 500 } });
    await processIntent({ type: 'drag-start' });
    const move = await processIntent({ type: 'drag-move', ballScreenPos: { x: 300, y: 300 } });
    expect(move.state.activeDisplayId).toBe(primary.id);
    const end = await processIntent({
      type: 'drag-end', ballScreenPos: { x: 5000, y: 300 }, hadMotion: true, enableDragAutoSnap: false, barBounds,
    });
    expect(end.state.ballScreenPos.x).toBeLessThanOrEqual(1920 - barBounds.rightFromBall);
    const collapse = await processIntent({ type: 'bar-collapse' });
    expect(collapse.state.barExpanded).toBe(false);
  });

  it('bar-expand uses the real display list unchanged when displays exist', async () => {
    const second = {
      id: 8, scaleFactor: 1,
      bounds:   { x: 1920, y: 0, width: 1920, height: 1080 },
      workArea: { x: 1920, y: 0, width: 1920, height: 1040 },
    };
    screenMock.getAllDisplays.mockReturnValue([primary, second]);
    await processIntent({ type: 'init', persistedBallScreenPos: { x: 2900, y: 500 } });

    const out = await processIntent({ type: 'bar-expand', barBounds });

    expect(out.state.activeDisplayId).toBe(8);
    expect(out.windowCommands[0].windowScreenPos).toEqual({ x: 1920, y: 0 });
    expect(logMock.warn).not.toHaveBeenCalled();
  });
});
