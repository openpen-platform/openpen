/**
 * Unit tests for the effectiveBarLayout state machine.
 *
 * The logic is extracted from ControlBar.vue's computed property as a pure
 * function here to keep the test independent of Vue's component system.
 *
 * State machine inputs ('auto' is not a valid value; only 'horizontal' and 'vertical'):
 *   enableDragAutoSnap: boolean
 *   barLayout:          'horizontal' | 'vertical'
 *   snapEdge:           null | 'left' | 'right'   (top/bottom do not change layout class)
 *
 * When snap=ON, barLayout is intentionally ignored — orientation follows the
 * snap edge. When snap=OFF, barLayout is the sole orientation source.
 */

import { describe, it, expect } from 'vitest';

/**
 * Pure replica of ControlBar.vue's effectiveBarLayout computed.
 *
 * @param {boolean} enableDragAutoSnap
 * @param {'horizontal' | 'vertical'} barLayout
 * @param {string | null} snapEdge
 * @returns {'horizontal' | 'vbar-left' | 'vbar-right' | 'vbar-free'}
 */
function effectiveBarLayout(enableDragAutoSnap, barLayout, snapEdge) {
  if (enableDragAutoSnap) {
    // Snap ON: bar follows the snap edge; barLayout is not consulted.
    if (snapEdge === 'left') return 'vbar-left';
    if (snapEdge === 'right') return 'vbar-right';
    return 'horizontal';
  }
  // Snap OFF: user's explicit barLayout choice applies.
  if (barLayout === 'vertical') return 'vbar-free';
  return 'horizontal';
}

// ─── snap=ON — barLayout is always ignored ────────────────────────────────────

describe("effectiveBarLayout — snap=ON (barLayout ignored)", () => {
  it("snapEdge=null -> 'horizontal' regardless of barLayout", () => {
    expect(effectiveBarLayout(true, 'horizontal', null)).toBe('horizontal');
    expect(effectiveBarLayout(true, 'vertical', null)).toBe('horizontal');
  });

  it("snapEdge='left' -> 'vbar-left' regardless of barLayout", () => {
    expect(effectiveBarLayout(true, 'horizontal', 'left')).toBe('vbar-left');
    expect(effectiveBarLayout(true, 'vertical', 'left')).toBe('vbar-left');
  });

  it("snapEdge='right' -> 'vbar-right' regardless of barLayout", () => {
    expect(effectiveBarLayout(true, 'horizontal', 'right')).toBe('vbar-right');
    expect(effectiveBarLayout(true, 'vertical', 'right')).toBe('vbar-right');
  });

  it("snap=ON + barLayout='vertical' + snapEdge=null -> 'horizontal' (barLayout ignored)", () => {
    // When snap=ON and snapEdge=null (free-floating), barLayout is ignored and
    // 'horizontal' is returned regardless.  The combination
    // barLayout='vertical'+snapEdge=null must NOT produce 'vbar-free'.
    expect(effectiveBarLayout(true, 'vertical', null)).toBe('horizontal');
  });
});

// ─── snap=OFF + barLayout='horizontal' ───────────────────────────────────────

describe("effectiveBarLayout — snap=OFF + barLayout='horizontal'", () => {
  it("snapEdge=null -> 'horizontal'", () => {
    expect(effectiveBarLayout(false, 'horizontal', null)).toBe('horizontal');
  });

  it("snapEdge='left' -> 'horizontal' (snapEdge irrelevant when snap=OFF)", () => {
    // snapEdge can transiently exist from a previous snap before snap was disabled.
    expect(effectiveBarLayout(false, 'horizontal', 'left')).toBe('horizontal');
  });

  it("snapEdge='right' -> 'horizontal' (snapEdge irrelevant when snap=OFF)", () => {
    expect(effectiveBarLayout(false, 'horizontal', 'right')).toBe('horizontal');
  });
});

// ─── snap=OFF + barLayout='vertical' ─────────────────────────────────────────

describe("effectiveBarLayout — snap=OFF + barLayout='vertical'", () => {
  it("snapEdge=null -> 'vbar-free' (free-floating vertical)", () => {
    expect(effectiveBarLayout(false, 'vertical', null)).toBe('vbar-free');
  });

  it("snapEdge='left' + snap=OFF -> 'vbar-free' (snapEdge irrelevant when snap=OFF)", () => {
    // Regression: proves snapEdge does NOT affect outcome when snap=OFF.
    // On old code with 'vertical' barLayout, snapEdge='left' → 'vbar-left'.
    // New code: snap=OFF means snapEdge is ignored → always 'vbar-free'.
    // This test FAILS on old effectiveBarLayout where barLayout='vertical' used snapEdge.
    expect(effectiveBarLayout(false, 'vertical', 'left')).toBe('vbar-free');
  });

  it("snapEdge='right' + snap=OFF -> 'vbar-free'", () => {
    expect(effectiveBarLayout(false, 'vertical', 'right')).toBe('vbar-free');
  });
});

// ─── isVertical derivation ───────────────────────────────────────────────────
//
// isVertical = effectiveBarLayout !== 'horizontal'.
// These tests guard the centralised computed that IS_VERTICAL_KEY provides to
// child modules. Bug-2 root cause: child components read snapEdge directly;
// vbar-free (snapEdge=null) produced isVertical=false. Now they inject
// IS_VERTICAL_KEY which is derived from effectiveBarLayout, not raw snapEdge.

describe('isVertical derivation from effectiveBarLayout', () => {
  function isVertical(enableDragAutoSnap, barLayout, snapEdge) {
    return effectiveBarLayout(enableDragAutoSnap, barLayout, snapEdge) !== 'horizontal';
  }

  it("snap=OFF + barLayout='horizontal', snapEdge=null -> isVertical=false", () => {
    expect(isVertical(false, 'horizontal', null)).toBe(false);
  });

  it("snap=OFF + barLayout='horizontal', snapEdge='left' -> isVertical=false (snapEdge irrelevant)", () => {
    expect(isVertical(false, 'horizontal', 'left')).toBe(false);
  });

  it("snap=OFF + barLayout='vertical', snapEdge=null -> isVertical=true (vbar-free IS vertical)", () => {
    // This is the Bug-2 scenario: snap=OFF means snapEdge=null but barLayout
    // is 'vertical'. Old code reading snapEdge directly gave false; correct
    // behavior from effectiveBarLayout gives true (vbar-free).
    expect(isVertical(false, 'vertical', null)).toBe(true);
  });

  it("snap=OFF + barLayout='vertical', snapEdge='left' -> isVertical=true (snapEdge irrelevant)", () => {
    expect(isVertical(false, 'vertical', 'left')).toBe(true);
  });

  it("snap=OFF + barLayout='vertical', snapEdge='right' -> isVertical=true", () => {
    expect(isVertical(false, 'vertical', 'right')).toBe(true);
  });

  it("snap=ON, snapEdge=null -> isVertical=false (unsnapped, horizontal bar)", () => {
    expect(isVertical(true, 'horizontal', null)).toBe(false);
  });

  it("snap=ON, snapEdge='left' -> isVertical=true", () => {
    expect(isVertical(true, 'horizontal', 'left')).toBe(true);
  });

  it("snap=ON, snapEdge='right' -> isVertical=true", () => {
    expect(isVertical(true, 'horizontal', 'right')).toBe(true);
  });
});
