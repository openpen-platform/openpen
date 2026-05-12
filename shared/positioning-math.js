/**
 * Pure positioning math — zero Electron / DOM / Vue imports.
 *
 * Shared between the main-process PositioningEngine and unit tests.
 * The renderer does NOT import from this module; it reads engine state
 * via usePositioning.
 */

// ─── Ball geometry constants ─────────────────────────────────────────────────

/** Ball radius (52px / 2). Used for edge clamping. */
export const BALL_HALF = 26;

// ─── Easing ──────────────────────────────────────────────────────────────────

/** Ease-out-back — approximates cubic-bezier(0.34, 1.56, 0.64, 1) with overshoot. */
export function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// ─── Display helpers ─────────────────────────────────────────────────────────

/**
 * Find the display whose bounds contain the given screen point.
 * Falls back to the nearest display center when no display contains the point.
 *
 * @param {number} cx
 * @param {number} cy
 * @param {Array<{bounds: {x:number;y:number;width:number;height:number}; workArea: {x:number;y:number;width:number;height:number}; id?: number; scaleFactor?: number}>} displays
 */
export function findDisplay(cx, cy, displays) {
  for (const d of displays) {
    const { x, y, width, height } = d.bounds;
    if (cx >= x && cx < x + width && cy >= y && cy < y + height) return d;
  }
  let best = displays[0];
  let bestDist = Infinity;
  for (const d of displays) {
    const { x, y, width, height } = d.bounds;
    const dx = cx - (x + width / 2);
    const dy = cy - (y + height / 2);
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) { bestDist = dist; best = d; }
  }
  return best;
}

// ─── Clamping ────────────────────────────────────────────────────────────────

/**
 * Clamp the ball screen position so the ball (and expanded bar) stays inside the workArea.
 *
 * When `barBounds` is supplied it must use ball-relative offsets (all positive):
 *   leftFromBall   — distance from bar's left edge to ball center
 *   rightFromBall  — distance from bar's right edge to ball center
 *   topFromBall    — distance from bar's top edge to ball center
 *   bottomFromBall — distance from bar's bottom edge to ball center
 *
 * These values capture the bar's asymmetric layout (drag-handle anchor places
 * the bar ~20 px left and ~580 px right of the ball in horizontal mode) without
 * requiring any orientation-specific branching.
 *
 * Without `barBounds`, clamps so the ball center is at least BALL_HALF inside
 * the workArea (collapsed-ball state).
 *
 * @param {number} ballX Ball center X in screen coords.
 * @param {number} ballY Ball center Y in screen coords.
 * @param {Array<{bounds:{x:number;y:number;width:number;height:number}; workArea:{x:number;y:number;width:number;height:number}; id?:number}>} displays
 * @param {{ leftFromBall:number; rightFromBall:number; topFromBall:number; bottomFromBall:number } | null | undefined} [barBounds]
 * @returns {{ ballX: number; ballY: number; wasClamped: boolean; display: object }}
 */
export function clampToWorkArea(ballX, ballY, displays, barBounds) {
  const display = findDisplay(ballX, ballY, displays);
  const wa = display.workArea;

  let clampedX, clampedY;

  if (barBounds) {
    const { leftFromBall, rightFromBall, topFromBall, bottomFromBall } = barBounds;
    const minX = wa.x + leftFromBall;
    const maxX = wa.x + wa.width - rightFromBall;
    const minY = wa.y + topFromBall;
    const maxY = wa.y + wa.height - bottomFromBall;
    // If bar is wider/taller than workArea, prefer the left/top boundary (cosmetic;
    // bar will overflow somewhere regardless, so we minimise clutter).
    clampedX = Math.max(minX, Math.min(Math.max(minX, maxX), ballX));
    clampedY = Math.max(minY, Math.min(Math.max(minY, maxY), ballY));
  } else {
    // Ball-only clamp (collapsed state).
    clampedX = Math.max(wa.x + BALL_HALF, Math.min(wa.x + wa.width  - BALL_HALF, ballX));
    clampedY = Math.max(wa.y + BALL_HALF, Math.min(wa.y + wa.height - BALL_HALF, ballY));
  }

  return {
    ballX: clampedX,
    ballY: clampedY,
    wasClamped: clampedX !== ballX || clampedY !== ballY,
    display,
  };
}

// ─── Snap target ─────────────────────────────────────────────────────────────

/**
 * Compute the nearest workArea edge and the resulting ball screen position.
 *
 * @param {number} ballCenterX Ball center X in screen coords.
 * @param {number} ballCenterY Ball center Y in screen coords.
 * @param {Array<{bounds:{x:number;y:number;width:number;height:number}; workArea:{x:number;y:number;width:number;height:number}; id?:number}>} displays
 * @returns {{ edge: 'left'|'right'|'top'|'bottom'; snapBallX: number; snapBallY: number }}
 */
export function calcSnap(ballCenterX, ballCenterY, displays) {
  const display = findDisplay(ballCenterX, ballCenterY, displays);
  const wa = display.workArea;

  const dLeft   = ballCenterX - wa.x;
  const dRight  = (wa.x + wa.width)  - ballCenterX;
  const dTop    = ballCenterY - wa.y;
  const dBottom = (wa.y + wa.height) - ballCenterY;
  const minDist = Math.min(dLeft, dRight, dTop, dBottom);

  const clampBallX = () => Math.max(wa.x + BALL_HALF, Math.min(wa.x + wa.width  - BALL_HALF, ballCenterX));
  const clampBallY = () => Math.max(wa.y + BALL_HALF, Math.min(wa.y + wa.height - BALL_HALF, ballCenterY));

  let edge;
  let snapBallX, snapBallY;

  if (minDist === dLeft) {
    edge = 'left';   snapBallX = wa.x + BALL_HALF;                snapBallY = clampBallY();
  } else if (minDist === dRight) {
    edge = 'right';  snapBallX = wa.x + wa.width - BALL_HALF;     snapBallY = clampBallY();
  } else if (minDist === dTop) {
    edge = 'top';    snapBallX = clampBallX();                    snapBallY = wa.y + BALL_HALF;
  } else {
    edge = 'bottom'; snapBallX = clampBallX();                    snapBallY = wa.y + wa.height - BALL_HALF;
  }

  return { edge, snapBallX, snapBallY };
}

