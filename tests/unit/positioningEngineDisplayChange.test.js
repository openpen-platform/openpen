/**
 * display-changed intent — animation-hint behavior.
 *
 * Drives the real PositioningEngine through processIntent({type:'display-changed'})
 * with a mocked electron.screen, exercising _handleDisplayChanged end-to-end:
 *  - ball re-clamped to a new position after a topology change => animation hint
 *    emitted (purpose 'display-change', easeOutCubic, 250ms).
 *  - ball already inside a valid workArea (clamp is a no-op) => no animation hint.
 *  - windowCommands contract (active visible, others hidden, overlays always present)
 *    unchanged by the animation-hint addition.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Mutable mocked display topology ────────────────────────────────────────────

let mockDisplays = [];
let mockPrimaryId = 1;
let mockCursor = { x: 0, y: 0 };

vi.mock('electron', () => ({
  screen: {
    getAllDisplays: () => mockDisplays,
    getPrimaryDisplay: () => mockDisplays.find((d) => d.id === mockPrimaryId) ?? mockDisplays[0],
    getCursorScreenPoint: () => mockCursor,
  },
}));

// ─── Display fixtures ───────────────────────────────────────────────────────────

function display1() {
  return {
    id: 1,
    scaleFactor: 1,
    bounds:   { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 0, width: 1920, height: 1040 },
  };
}

function display2() {
  return {
    id: 2,
    scaleFactor: 1,
    bounds:   { x: 1920, y: 0, width: 1920, height: 1080 },
    workArea: { x: 1920, y: 0, width: 1920, height: 1040 },
  };
}

const BALL_HALF = 26;

// ─── Imports under test (after vi.mock) ─────────────────────────────────────────

let processIntent;
let getState;

beforeEach(async () => {
  mockDisplays = [display1(), display2()];
  mockPrimaryId = 1;
  mockCursor = { x: 0, y: 0 };

  // Reset module-level engine state between tests.
  vi.resetModules();
  ({ processIntent, getState } = await import('../../electron/positioning-engine.js'));
});

/**
 * Seed the engine's internal ball position by issuing a drag-move intent, which
 * sets _state.ballScreenPos to the resolved (un-clamped) coordinate when the
 * point lies inside a display.
 */
async function seedBallAt(x, y) {
  await processIntent({ type: 'drag-move', ballScreenPos: { x, y } });
}

describe('display-changed — ball must move (active display removed)', () => {
  it('emits a display-change animation hint and re-clamps the ball', async () => {
    // Ball sits well inside display 2.
    const ballX = 1920 + 960; // 2880
    const ballY = 520;
    await seedBallAt(ballX, ballY);
    expect(getState().ballScreenPos).toEqual({ x: ballX, y: ballY });

    // Display 2 is unplugged — only display 1 remains.
    mockDisplays = [display1()];

    const output = await processIntent({ type: 'display-changed' });

    // (a) Ball re-clamped onto display 1's workArea (x must drop below D1 right edge).
    expect(output.state.activeDisplayId).toBe(1);
    expect(output.state.ballScreenPos.x).toBeLessThanOrEqual(1920 - BALL_HALF);
    expect(getState().ballScreenPos.x).toBe(output.state.ballScreenPos.x);
    // Position genuinely changed.
    expect(output.state.ballScreenPos.x).not.toBe(ballX);

    // (b) Animation hint present with exact contract.
    expect(output.animation).toBeDefined();
    expect(output.animation).toEqual({
      durationMs: 250,
      easing: 'easeOutCubic',
      purpose: 'display-change',
    });
  });

  it('emits the hint when only Y moves (vertical clamp)', async () => {
    // Ball inside display 1 but near bottom; shrink workArea so it must move up.
    await seedBallAt(960, 1000);

    const shrunk = display1();
    shrunk.workArea = { x: 0, y: 0, width: 1920, height: 800 };
    mockDisplays = [shrunk];

    const output = await processIntent({ type: 'display-changed' });

    expect(output.state.ballScreenPos.y).toBeLessThanOrEqual(800 - BALL_HALF);
    expect(output.state.ballScreenPos.y).not.toBe(1000);
    expect(output.animation?.purpose).toBe('display-change');
    expect(output.animation?.easing).toBe('easeOutCubic');
    expect(output.animation?.durationMs).toBe(250);
  });
});

describe('display-changed — ball does not move (clamp is a no-op)', () => {
  it('does NOT emit an animation hint when ball already lies inside a valid workArea', async () => {
    // Ball inside display 1, comfortably within workArea.
    await seedBallAt(960, 520);
    const before = { ...getState().ballScreenPos };

    // Topology event fires, but display 1 still contains the ball unchanged.
    mockDisplays = [display1(), display2()];

    const output = await processIntent({ type: 'display-changed' });

    // Ball position unchanged.
    expect(output.state.ballScreenPos).toEqual(before);
    // No no-op 250ms interpolation.
    expect(output.animation).toBeUndefined();
  });

  it('does NOT emit a hint for sub-threshold (<0.5px) drift', async () => {
    // Place the ball where clamp would leave it untouched.
    await seedBallAt(500, 500);
    mockDisplays = [display1()];

    const output = await processIntent({ type: 'display-changed' });

    expect(output.state.ballScreenPos).toEqual({ x: 500, y: 500 });
    expect(output.animation).toBeUndefined();
  });
});

describe('display-changed — windowCommands contract unchanged', () => {
  it('marks active display visible, others hidden, overlays always present', async () => {
    // Ball on display 1; both displays present so nothing moves.
    await seedBallAt(960, 520);
    mockDisplays = [display1(), display2()];

    const output = await processIntent({ type: 'display-changed' });

    const mainCmds = output.windowCommands.filter((c) => c.role === 'main');
    const overlayCmds = output.windowCommands.filter((c) => c.role === 'overlay');

    // One main + one overlay command per display.
    expect(mainCmds).toHaveLength(2);
    expect(overlayCmds).toHaveLength(2);

    // Active display (1) main visible, display 2 main hidden.
    expect(mainCmds.find((c) => c.displayId === 1).visible).toBe(true);
    expect(mainCmds.find((c) => c.displayId === 2).visible).toBe(false);

    // All overlays present regardless of active display.
    expect(overlayCmds.every((c) => c.visible === true)).toBe(true);

    // No animation hint for the no-op case (contract addition is purely additive).
    expect(output.animation).toBeUndefined();
  });

  it('still produces correct windowCommands when the ball moves (active display removed)', async () => {
    await seedBallAt(2880, 520); // on display 2
    mockDisplays = [display1()];

    const output = await processIntent({ type: 'display-changed' });

    const mainCmds = output.windowCommands.filter((c) => c.role === 'main');
    const overlayCmds = output.windowCommands.filter((c) => c.role === 'overlay');

    expect(mainCmds).toHaveLength(1);
    expect(overlayCmds).toHaveLength(1);
    expect(mainCmds[0].displayId).toBe(1);
    expect(mainCmds[0].visible).toBe(true);
    expect(overlayCmds[0].visible).toBe(true);

    // Movement => animation hint coexists with the windowCommands.
    expect(output.animation?.purpose).toBe('display-change');
  });
});

describe('display-changed — no displays available', () => {
  it('returns current state with no windowCommands and no animation', async () => {
    await seedBallAt(960, 520);
    mockDisplays = [];

    const output = await processIntent({ type: 'display-changed' });

    expect(output.windowCommands).toEqual([]);
    expect(output.animation).toBeUndefined();
  });
});
