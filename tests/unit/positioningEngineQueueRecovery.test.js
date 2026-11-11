/**
 * processIntent - a single failing intent must not poison the serial queue.
 *
 * Drives the real PositioningEngine with a mocked electron.screen whose
 * getAllDisplays can be made to throw once:
 *  - the failing call rejects with the original error and is logged;
 *  - every later intent (drag, display change) still succeeds;
 *  - the output of a healthy intent is identical to a run with no prior failure.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockLogError = vi.fn();
let mockDisplays = [];
let mockThrowOnce = null;

vi.mock('electron', () => ({
  screen: {
    getAllDisplays: () => {
      if (mockThrowOnce) {
        const err = mockThrowOnce;
        mockThrowOnce = null;
        throw err;
      }
      return mockDisplays;
    },
    getPrimaryDisplay: () => mockDisplays[0],
    getCursorScreenPoint: () => ({ x: 0, y: 0 }),
  },
}));

vi.mock('../../electron/logger.js', () => ({
  log: { error: (...args) => mockLogError(...args) },
}));

function display1() {
  return {
    id: 1,
    scaleFactor: 1,
    bounds:   { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  };
}

let processIntent;

beforeEach(async () => {
  mockDisplays = [display1()];
  mockThrowOnce = null;
  mockLogError.mockClear();
  vi.resetModules();
  ({ processIntent } = await import('../../electron/positioning-engine.js'));
});

const dragMove = { type: 'drag-move', ballScreenPos: { x: 960, y: 520 } };

describe('processIntent - error isolation', () => {
  it('rejects the failing intent with the original error and logs it', async () => {
    const boom = new Error('boom');
    mockThrowOnce = boom;

    await expect(processIntent(dragMove)).rejects.toBe(boom);
    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockLogError.mock.calls[0]).toContain(boom);
  });

  it('keeps processing later intents after one failure', async () => {
    mockThrowOnce = new Error('boom');
    await expect(processIntent(dragMove)).rejects.toThrow('boom');

    const move = await processIntent(dragMove);
    expect(move.state.ballScreenPos).toEqual({ x: 960, y: 520 });

    await expect(processIntent({ type: 'drag-end', ballScreenPos: { x: 960, y: 520 } })).resolves.toBeDefined();
    await expect(processIntent({ type: 'display-changed' })).resolves.toBeDefined();
  });

  it('isolates a failure when the next intent is already queued behind it', async () => {
    mockThrowOnce = new Error('first');
    const failing = processIntent(dragMove);
    const next = processIntent(dragMove);

    await expect(failing).rejects.toThrow('first');
    await expect(next).resolves.toBeDefined();
  });

  it('produces the same output as a run with no earlier failure', async () => {
    const clean = await processIntent(dragMove);

    vi.resetModules();
    ({ processIntent } = await import('../../electron/positioning-engine.js'));
    mockThrowOnce = new Error('boom');
    await expect(processIntent(dragMove)).rejects.toThrow('boom');
    const afterFailure = await processIntent(dragMove);

    expect(afterFailure).toEqual(clean);
  });
});
