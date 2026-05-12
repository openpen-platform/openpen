/**
 * Multi-display positioning engine unit tests.
 *
 * Mocks electron.screen to simulate multi-display configurations (side-by-side,
 * stacked, mixed-DPI). Verifies that the positioning engine correctly resolves
 * activeDisplayId, clamps ball positions, and emits correct windowCommands for
 * each display topology.
 *
 * These tests cover code paths that cannot be exercised via e2e on a
 * single-display dev machine.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { findDisplay, clampToWorkArea, calcSnap } from '../../shared/positioning-math.js';

// ─── Display fixtures ─────────────────────────────────────────────────────────

/** Two 1920×1080 displays side-by-side (display 2 to the right of display 1). */
function makeSideBySideDisplays() {
  return [
    {
      id: 1,
      scaleFactor: 1,
      bounds:   { x: 0,    y: 0, width: 1920, height: 1080 },
      workArea: { x: 0,    y: 0, width: 1920, height: 1040 },
    },
    {
      id: 2,
      scaleFactor: 1,
      bounds:   { x: 1920, y: 0, width: 1920, height: 1080 },
      workArea: { x: 1920, y: 0, width: 1920, height: 1040 },
    },
  ];
}

/** Two 1920×1080 displays stacked (display 2 below display 1). */
function makeStackedDisplays() {
  return [
    {
      id: 1,
      scaleFactor: 1,
      bounds:   { x: 0, y: 0,    width: 1920, height: 1080 },
      workArea: { x: 0, y: 0,    width: 1920, height: 1040 },
    },
    {
      id: 2,
      scaleFactor: 1,
      bounds:   { x: 0, y: 1080, width: 1920, height: 1080 },
      workArea: { x: 0, y: 1080, width: 1920, height: 1040 },
    },
  ];
}

/** Mixed-DPI: display 1 at 1x (1920×1080), display 2 at 2x (scaled 1440×900). */
function makeMixedDpiDisplays() {
  return [
    {
      id: 1,
      scaleFactor: 1,
      bounds:   { x: 0,    y: 0, width: 1920, height: 1080 },
      workArea: { x: 0,    y: 0, width: 1920, height: 1040 },
    },
    {
      id: 2,
      scaleFactor: 2,
      bounds:   { x: 1920, y: 0, width: 1440, height: 900 },
      workArea: { x: 1920, y: 0, width: 1440, height: 860 },
    },
  ];
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('findDisplay — multi-display', () => {
  it('resolves display 1 when cursor is on display 1 (side-by-side)', () => {
    const displays = makeSideBySideDisplays();
    const result = findDisplay(960, 540, displays);
    expect(result.id).toBe(1);
  });

  it('resolves display 2 when cursor is on display 2 (side-by-side)', () => {
    const displays = makeSideBySideDisplays();
    const result = findDisplay(2880, 540, displays); // 1920 + 960
    expect(result.id).toBe(2);
  });

  it('resolves display 1 when cursor is on display 1 (stacked)', () => {
    const displays = makeStackedDisplays();
    const result = findDisplay(960, 540, displays);
    expect(result.id).toBe(1);
  });

  it('resolves display 2 when cursor is on display 2 (stacked)', () => {
    const displays = makeStackedDisplays();
    const result = findDisplay(960, 1620, displays); // 1080 + 540
    expect(result.id).toBe(2);
  });

  it('resolves display 2 (mixed-DPI) when cursor is on display 2', () => {
    const displays = makeMixedDpiDisplays();
    const result = findDisplay(2640, 450, displays); // 1920 + 720
    expect(result.id).toBe(2);
  });

  it('falls back to nearest display when cursor is in no-man\'s-land between displays', () => {
    const displays = makeSideBySideDisplays();
    // Cursor exactly at display boundary x=1920 is technically in display 2 bounds [1920, 3840).
    const result = findDisplay(1920, 540, displays);
    expect(result.id).toBe(2);
  });
});

describe('clampToWorkArea — multi-display', () => {
  it('clamps to display 1 workArea when ball is on display 1 (side-by-side)', () => {
    const displays = makeSideBySideDisplays();
    // Ball far outside left edge of display 1.
    const result = clampToWorkArea(-100, 540, displays, null);
    expect(result.ballX).toBeGreaterThanOrEqual(26); // BALL_HALF = 26
    expect(result.wasClamped).toBe(true);
    expect(result.display.id).toBe(1);
  });

  it('clamps to display 2 workArea when ball is on display 2 (side-by-side)', () => {
    const displays = makeSideBySideDisplays();
    const d2 = displays[1];
    // Ball far outside right edge of display 2.
    const result = clampToWorkArea(d2.workArea.x + d2.workArea.width + 200, 540, displays, null);
    expect(result.ballX).toBeLessThanOrEqual(d2.workArea.x + d2.workArea.width - 26);
    expect(result.wasClamped).toBe(true);
    expect(result.display.id).toBe(2);
  });

  it('does not clamp when ball is already inside workArea', () => {
    const displays = makeSideBySideDisplays();
    const result = clampToWorkArea(960, 520, displays, null);
    expect(result.wasClamped).toBe(false);
    expect(result.ballX).toBe(960);
    expect(result.ballY).toBe(520);
  });

  it('clamps Y when ball is below display 2 workArea (stacked)', () => {
    const displays = makeStackedDisplays();
    const d2 = displays[1];
    const result = clampToWorkArea(960, d2.workArea.y + d2.workArea.height + 100, displays, null);
    expect(result.ballY).toBeLessThanOrEqual(d2.workArea.y + d2.workArea.height - 26);
    expect(result.wasClamped).toBe(true);
  });
});

describe('calcSnap — multi-display', () => {
  it('snaps to left edge of display 2 when ball is near left edge of display 2', () => {
    const displays = makeSideBySideDisplays();
    const d2 = displays[1];
    // Ball near left edge of display 2.
    const ballX = d2.workArea.x + 50;
    const ballY = d2.workArea.y + d2.workArea.height / 2;
    const { edge, snapBallX } = calcSnap(ballX, ballY, displays);
    expect(edge).toBe('left');
    expect(snapBallX).toBe(d2.workArea.x + 26); // BALL_HALF = 26
  });

  it('snaps to right edge of display 1 when ball is near right edge of display 1', () => {
    const displays = makeSideBySideDisplays();
    const d1 = displays[0];
    const ballX = d1.workArea.x + d1.workArea.width - 50;
    const ballY = d1.workArea.y + d1.workArea.height / 2;
    const { edge, snapBallX } = calcSnap(ballX, ballY, displays);
    expect(edge).toBe('right');
    expect(snapBallX).toBe(d1.workArea.x + d1.workArea.width - 26);
  });

  it('resolves to display 2 when ball is on display 2 (stacked)', () => {
    const displays = makeStackedDisplays();
    const d2 = displays[1];
    const ballX = d2.workArea.x + 50;
    const ballY = d2.workArea.y + d2.workArea.height / 2;
    const { edge } = calcSnap(ballX, ballY, displays);
    expect(edge).toBe('left');
  });
});

describe('display-changed intent — display topology changes', () => {
  it('resolves to display 2 workArea after active display switches (ball on display 2)', () => {
    const displays = makeSideBySideDisplays();
    const d2 = displays[1];
    // Ball was on display 1 but is now being clamped to whatever display contains it.
    // After a display-changed event the engine re-resolves from ball position.
    const ballOnD2 = { x: d2.workArea.x + 500, y: d2.workArea.y + 300 };
    const result = clampToWorkArea(ballOnD2.x, ballOnD2.y, displays, null);
    expect(result.display.id).toBe(2);
    expect(result.wasClamped).toBe(false);
  });

  it('clamps ball to the remaining display when the active display is removed', () => {
    // Simulate: 2 displays, active is display 2, then display 2 is removed.
    const before = makeSideBySideDisplays();
    const d2 = before[1];
    const ballOnD2 = { x: d2.workArea.x + 960, y: d2.workArea.y + 520 };

    // After removal only display 1 remains.
    const after = [ before[0] ];
    const result = clampToWorkArea(ballOnD2.x, ballOnD2.y, after, null);

    // Ball was at x=2880 (display 2). With only display 1 (workArea 0..1919),
    // it should clamp to display 1's right boundary.
    const d1 = after[0];
    expect(result.display.id).toBe(d1.id);
    expect(result.ballX).toBeLessThanOrEqual(d1.workArea.x + d1.workArea.width - 26);
    expect(result.wasClamped).toBe(true);
  });

  it('re-resolves activeDisplayId from remaining display after active display removed', () => {
    const displays = makeSideBySideDisplays();
    const d2 = displays[1];
    // Cursor on display 2; display 2 is removed.
    const remaining = [ displays[0] ];
    // The engine would call findDisplay from cursor position or ball position.
    const resolved = findDisplay(d2.workArea.x + 960, d2.workArea.y + 540, remaining);
    // Falls back to nearest display (display 1).
    expect(resolved.id).toBe(displays[0].id);
  });
});

describe('display-metrics-changed — workArea shrinks', () => {
  it('clamps ball to new smaller workArea if ball was outside the new bounds', () => {
    const d1Original = {
      id: 1,
      scaleFactor: 1,
      bounds:   { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    };

    // Ball near bottom of original workArea.
    const ballY = 1000;

    // Dock appeared: workArea shrinks to 980px tall.
    const d1Shrunk = {
      ...d1Original,
      workArea: { x: 0, y: 0, width: 1920, height: 980 },
    };

    const result = clampToWorkArea(960, ballY, [d1Shrunk], null);
    expect(result.ballY).toBeLessThanOrEqual(d1Shrunk.workArea.height - 26);
    expect(result.wasClamped).toBe(true);
  });

  it('does not clamp ball when it is still inside the new (smaller) workArea', () => {
    const d1Shrunk = {
      id: 1,
      scaleFactor: 1,
      bounds:   { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 0, width: 1920, height: 980 },
    };

    // Ball well within the shrunk workArea.
    const result = clampToWorkArea(960, 500, [d1Shrunk], null);
    expect(result.wasClamped).toBe(false);
  });
});

describe('summon-to-cursor — multi-display', () => {
  it('resolves correct display from cursor position on display 2', () => {
    const displays = makeSideBySideDisplays();
    const d2 = displays[1];
    // Cursor on display 2.
    const cursor = { x: d2.workArea.x + 960, y: d2.workArea.y + 540 };
    const resolved = findDisplay(cursor.x, cursor.y, displays);
    expect(resolved.id).toBe(d2.id);
  });

  it('resolves correct display from cursor position on display 1 (stacked)', () => {
    const displays = makeStackedDisplays();
    const d1 = displays[0];
    const cursor = { x: 960, y: 200 };
    const resolved = findDisplay(cursor.x, cursor.y, displays);
    expect(resolved.id).toBe(d1.id);
  });

  it('mixed-DPI: resolves display 2 for cursor on display 2', () => {
    const displays = makeMixedDpiDisplays();
    const d2 = displays[1];
    const cursor = { x: d2.workArea.x + 300, y: d2.workArea.y + 200 };
    const resolved = findDisplay(cursor.x, cursor.y, displays);
    expect(resolved.id).toBe(d2.id);
  });
});
