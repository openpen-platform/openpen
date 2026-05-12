/**
 * Pure-math unit tests for positioning math functions.
 * These functions live in shared/positioning-math.js (pure ESM, zero deps).
 *
 * barBoundsFromEl is a DOM-measurement helper that stays in useDragSnap.ts;
 * it is tested separately below with a mocked element.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  findDisplay,
  calcSnap,
  easeOutBack,
  clampToWorkArea,
  BALL_HALF,
} from '../../shared/positioning-math.js';
import { barBoundsFromEl } from '../../src/composables/useDragSnap';

// ─── Test display fixtures ──────────────────────────────────────────────────
const SINGLE_DISPLAY = [
  {
    bounds:   { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 25, width: 1920, height: 1055 }, // 25px menu bar on macOS
  },
];

const DUAL_DISPLAY = [
  {
    bounds:   { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 25, width: 1920, height: 1055 },
  },
  {
    bounds:   { x: -2560, y: 0, width: 2560, height: 1440 }, // secondary display to the left (negative coords)
    workArea: { x: -2560, y: 25, width: 2560, height: 1415 },
  },
];

// ─── findDisplay ─────────────────────────────────────────────────────────────
describe('findDisplay', () => {
  it('ball inside single display -> returns that display', () => {
    const d = findDisplay(960, 540, SINGLE_DISPLAY);
    expect(d.bounds.x).toBe(0);
  });

  it('ball on secondary display (negative coords) -> returns secondary', () => {
    const d = findDisplay(-1280, 720, DUAL_DISPLAY);
    expect(d.bounds.x).toBe(-2560);
  });

  it('ball outside all displays -> returns nearest display', () => {
    // x=3000 is outside any bounds (primary 0..1920, secondary -2560..0).
    // Distance to primary center (960, 540): (3000-960)^2 ≈ 4.16M
    // Distance to secondary center (-1280, 720): (3000+1280)^2 ≈ 18.3M → primary is closer.
    const d = findDisplay(3000, 540, DUAL_DISPLAY);
    expect(d.bounds.x).toBe(0);
  });
});

// ─── calcSnap ─────────────────────────────────────────────────────────────────
describe('calcSnap', () => {
  const [D] = SINGLE_DISPLAY;
  const wa = D.workArea; // { x:0, y:25, width:1920, height:1055 }

  it('ball near left edge -> snaps to left, snapBallX = wa.x + BALL_HALF', () => {
    const r = calcSnap(50, 540, SINGLE_DISPLAY);
    expect(r.edge).toBe('left');
    expect(r.snapBallX).toBe(wa.x + BALL_HALF);
    expect(r.snapBallY).toBe(540); // no clamping
  });

  it('ball near right edge -> snaps to right, snapBallX = wa.x + wa.width - BALL_HALF', () => {
    const r = calcSnap(1870, 540, SINGLE_DISPLAY);
    expect(r.edge).toBe('right');
    expect(r.snapBallX).toBe(wa.x + wa.width - BALL_HALF);
  });

  it('ball near top edge -> snaps to top, snapBallY = wa.y + BALL_HALF', () => {
    const r = calcSnap(960, wa.y + 30, SINGLE_DISPLAY);
    expect(r.edge).toBe('top');
    expect(r.snapBallY).toBe(wa.y + BALL_HALF);
  });

  it('ball near bottom edge -> snaps to bottom, snapBallY = wa.y + wa.height - BALL_HALF', () => {
    const r = calcSnap(960, wa.y + wa.height - 30, SINGLE_DISPLAY);
    expect(r.edge).toBe('bottom');
    expect(r.snapBallY).toBe(wa.y + wa.height - BALL_HALF);
  });

  it('returns only { edge, snapBallX, snapBallY } — no window position fields', () => {
    const r = calcSnap(50, 540, SINGLE_DISPLAY);
    expect(r).not.toHaveProperty('windowX');
    expect(r).not.toHaveProperty('windowY');
    expect(r).toHaveProperty('snapBallX');
    expect(r).toHaveProperty('snapBallY');
  });

  it('snap to top when d_top < d_left', () => {
    const r = calcSnap(10, wa.y + 5, SINGLE_DISPLAY);
    // d_left=10, d_top=5 → snap to top
    expect(r.edge).toBe('top');
  });

  it('snap to left when d_left < d_top', () => {
    const r = calcSnap(10, 540, SINGLE_DISPLAY);
    expect(r.edge).toBe('left');
    expect(r.snapBallX).toBe(wa.x + BALL_HALF);
    expect(r.snapBallY).toBe(540);
  });

  it('snap to left — Y near bottom but still inside workArea is not clamped', () => {
    const ballY = wa.y + wa.height - 30;
    const r = calcSnap(10, ballY, SINGLE_DISPLAY);
    expect(r.edge).toBe('left');
    expect(r.snapBallX).toBe(wa.x + BALL_HALF);
    expect(r.snapBallY).toBe(ballY); // inside workArea, no clamp
  });

  it('secondary display (negative coords) snaps correctly', () => {
    const r = calcSnap(-50, 500, DUAL_DISPLAY);
    const wa2 = DUAL_DISPLAY[1].workArea; // x:-2560, y:25, w:2560, h:1415
    expect(r.edge).toBe('right'); // -50 is near the right edge of the secondary (x=0)
    expect(r.snapBallX).toBe(wa2.x + wa2.width - BALL_HALF);
  });

  it('snap result ball position is always within the workArea', () => {
    const testPoints = [
      [50, 540], [1870, 540], [960, 50], [960, 1050],
    ];
    for (const [bx, by] of testPoints) {
      const r = calcSnap(bx, by, SINGLE_DISPLAY);
      expect(r.snapBallX).toBeGreaterThanOrEqual(wa.x + BALL_HALF);
      expect(r.snapBallX).toBeLessThanOrEqual(wa.x + wa.width - BALL_HALF);
      expect(r.snapBallY).toBeGreaterThanOrEqual(wa.y + BALL_HALF);
      expect(r.snapBallY).toBeLessThanOrEqual(wa.y + wa.height - BALL_HALF);
    }
  });
});

// ─── easeOutBack ─────────────────────────────────────────────────────────────
describe('easeOutBack', () => {
  it('t=0 -> 0', () => {
    expect(easeOutBack(0)).toBeCloseTo(0);
  });

  it('t=1 -> 1', () => {
    expect(easeOutBack(1)).toBeCloseTo(1);
  });

  it('overshoots above 1 mid-curve', () => {
    const values = [0.5, 0.6, 0.7, 0.8].map(easeOutBack);
    expect(Math.max(...values)).toBeGreaterThan(1);
  });
});

// ─── clampToWorkArea ─────────────────────────────────────────────────────────
describe('clampToWorkArea', () => {
  const [D] = SINGLE_DISPLAY;
  const wa = D.workArea; // { x:0, y:25, width:1920, height:1055 }

  it('ball center inside workArea -> returns unchanged coords, wasClamped=false', () => {
    const r = clampToWorkArea(960, 540, SINGLE_DISPLAY);
    expect(r.ballX).toBe(960);
    expect(r.ballY).toBe(540);
    expect(r.wasClamped).toBe(false);
    expect(r.display).toBe(D);
  });

  it('ball center past left edge -> clamps X to wa.x + BALL_HALF', () => {
    const r = clampToWorkArea(-100, 540, SINGLE_DISPLAY);
    expect(r.ballX).toBe(wa.x + BALL_HALF);
    expect(r.ballY).toBe(540);
    expect(r.wasClamped).toBe(true);
  });

  it('ball center past right edge -> clamps X to wa.x + wa.width - BALL_HALF', () => {
    const r = clampToWorkArea(2000, 540, SINGLE_DISPLAY);
    expect(r.ballX).toBe(wa.x + wa.width - BALL_HALF);
    expect(r.ballY).toBe(540);
    expect(r.wasClamped).toBe(true);
  });

  it('ball center past top edge -> clamps Y to wa.y + BALL_HALF', () => {
    const r = clampToWorkArea(960, 0, SINGLE_DISPLAY);
    expect(r.ballX).toBe(960);
    expect(r.ballY).toBe(wa.y + BALL_HALF);
    expect(r.wasClamped).toBe(true);
  });

  it('ball center past bottom edge -> clamps Y to wa.y + wa.height - BALL_HALF', () => {
    const r = clampToWorkArea(960, 2000, SINGLE_DISPLAY);
    expect(r.ballX).toBe(960);
    expect(r.ballY).toBe(wa.y + wa.height - BALL_HALF);
    expect(r.wasClamped).toBe(true);
  });

  it('ball center at exact boundary (wa.x + BALL_HALF) -> not clamped', () => {
    const r = clampToWorkArea(wa.x + BALL_HALF, 540, SINGLE_DISPLAY);
    expect(r.ballX).toBe(wa.x + BALL_HALF);
    expect(r.wasClamped).toBe(false);
  });
});

// ─── clampToWorkArea (bar bounds path) ───────────────────────────────────────
//
// barBounds uses ball-relative offsets: leftFromBall/rightFromBall/topFromBall/bottomFromBall.
// The horizontal bar extends ~20 px left and ~580 px right of the ball center.

describe('clampToWorkArea — bar bounds path', () => {
  const [D] = SINGLE_DISPLAY;
  const wa = D.workArea; // { x:0, y:25, width:1920, height:1055 }

  // Horizontal bar: drag handle is ~20 px left of ball; bar extends ~580 px right.
  const MOCK_BAR_BOUNDS = {
    leftFromBall:   20,
    rightFromBall:  580,
    topFromBall:    20,
    bottomFromBall: 30,
  };

  it('ball inside valid clamp range -> no clamp with barBounds', () => {
    // minX = 0+20=20, maxX = 0+1920-580=1340; ball at 960 is inside.
    const r = clampToWorkArea(960, 540, SINGLE_DISPLAY, MOCK_BAR_BOUNDS);
    expect(r.wasClamped).toBe(false);
    expect(r.ballX).toBe(960);
    expect(r.ballY).toBe(540);
  });

  it('ball too far left -> X clamped to wa.x + leftFromBall', () => {
    // Ball at X=5, minX = 0+20=20 -> clamped to 20.
    const r = clampToWorkArea(5, 540, SINGLE_DISPLAY, MOCK_BAR_BOUNDS);
    expect(r.wasClamped).toBe(true);
    expect(r.ballX).toBe(wa.x + MOCK_BAR_BOUNDS.leftFromBall);
  });

  it('ball too far right -> X clamped to wa.x + wa.width - rightFromBall', () => {
    // Ball at X=1900, maxX = 0+1920-580=1340 -> clamped to 1340.
    const r = clampToWorkArea(1900, 540, SINGLE_DISPLAY, MOCK_BAR_BOUNDS);
    expect(r.wasClamped).toBe(true);
    expect(r.ballX).toBe(wa.x + wa.width - MOCK_BAR_BOUNDS.rightFromBall);
  });

  it('ball too high -> Y clamped to wa.y + topFromBall', () => {
    // Ball at Y=30, minY = 25+20=45 -> clamped to 45.
    const r = clampToWorkArea(960, 30, SINGLE_DISPLAY, MOCK_BAR_BOUNDS);
    expect(r.wasClamped).toBe(true);
    expect(r.ballY).toBe(wa.y + MOCK_BAR_BOUNDS.topFromBall);
  });

  it('ball too low -> Y clamped to wa.y + wa.height - bottomFromBall', () => {
    // Ball at Y=1080, maxY = 25+1055-30=1050 -> clamped to 1050.
    const r = clampToWorkArea(960, 1080, SINGLE_DISPLAY, MOCK_BAR_BOUNDS);
    expect(r.wasClamped).toBe(true);
    expect(r.ballY).toBe(wa.y + wa.height - MOCK_BAR_BOUNDS.bottomFromBall);
  });

  it('without barBounds falls back to BALL_HALF clamping', () => {
    const r = clampToWorkArea(2000, 540, SINGLE_DISPLAY);
    expect(r.ballX).toBe(wa.x + wa.width - BALL_HALF);
    expect(r.wasClamped).toBe(true);
  });
});

// ─── barBoundsFromEl ─────────────────────────────────────────────────────────
describe('barBoundsFromEl', () => {
  it('returns null when element has zero dimensions', () => {
    const el = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 0, height: 0 }),
    };
    const result = barBoundsFromEl(el, 960, 400);
    expect(result).toBeNull();
  });

  it('computes ball-relative offsets from rect and ball viewport position', () => {
    // Bar rect: left=940, top=380, width=600, height=50.
    // Ball viewport position: (960, 400).
    // leftFromBall  = 960 - 940       = 20
    // rightFromBall = (940+600) - 960 = 580
    // topFromBall   = 400 - 380       = 20
    // bottomFromBall= (380+50) - 400  = 30
    const el = {
      getBoundingClientRect: () => ({ left: 940, top: 380, width: 600, height: 50 }),
    };

    const result = barBoundsFromEl(el, 960, 400);

    expect(result).not.toBeNull();
    expect(result.leftFromBall).toBe(20);
    expect(result.rightFromBall).toBe(580);
    expect(result.topFromBall).toBe(20);
    expect(result.bottomFromBall).toBe(30);
  });
});
