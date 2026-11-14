/**
 * Screen-size feasibility checks for geometry specs.
 *
 * Some invariants (drag handle centered on the ball, a popup that stays inside
 * the viewport) can only hold when the display is large enough for the control
 * bar or popup to be placed without clamping. On a small display the app
 * correctly clamps the bar or popup into the work area, and the invariant is
 * geometrically impossible rather than broken. These helpers detect that case
 * from measured sizes so a spec can skip with an explicit reason instead of
 * failing, while still running everywhere the invariant is satisfiable.
 */

/**
 * Whether the bar could be placed with its drag handle centered on the ball
 * without leaving the viewport. All boxes are in viewport coordinates and the
 * bar is measured after it was (possibly) clamped; the handle offset inside the
 * bar is constant, so the unclamped origin is derived from the ball center.
 *
 * @param {{ ballCenter: {x:number,y:number}, barBox: {x:number,y:number,width:number,height:number},
 *           handleBox: {x:number,y:number,width:number,height:number}, viewport: {width:number,height:number},
 *           tolerance?: number }} args
 * @returns {{ feasible: boolean, reason: string }}
 */
export function barAlignmentFeasibility({ ballCenter, barBox, handleBox, viewport, tolerance = 10 }) {
  const handleOffsetX = handleBox.x + handleBox.width / 2 - barBox.x;
  const handleOffsetY = handleBox.y + handleBox.height / 2 - barBox.y;
  const left = ballCenter.x - handleOffsetX;
  const top = ballCenter.y - handleOffsetY;
  const overflowX = Math.max(-left, left + barBox.width - viewport.width);
  const overflowY = Math.max(-top, top + barBox.height - viewport.height);
  if (overflowX > tolerance || overflowY > tolerance) {
    return {
      feasible: false,
      reason:
        `Display too small: a ${Math.round(barBox.width)}x${Math.round(barBox.height)} bar centered on the ball ` +
        `would overflow the ${viewport.width}x${viewport.height} work area by ` +
        `${Math.round(Math.max(overflowX, 0))}px (x) / ${Math.round(Math.max(overflowY, 0))}px (y), ` +
        'so the app clamps it and the alignment cannot hold.',
    };
  }
  return { feasible: true, reason: '' };
}

/**
 * Whether a popup of the given size fits on at least one side of its anchor
 * along the given axis ('y' for horizontal bars, 'x' for vertical bars).
 *
 * @param {{ popupBox: {width:number,height:number}, anchorBox: {x:number,y:number,width:number,height:number},
 *           viewport: {width:number,height:number}, axis: 'x'|'y', gap?: number }} args
 * @returns {{ feasible: boolean, reason: string }}
 */
export function popupSideFeasibility({ popupBox, anchorBox, viewport, axis, gap = 8 }) {
  const size = axis === 'y' ? popupBox.height : popupBox.width;
  const before = axis === 'y' ? anchorBox.y - gap : anchorBox.x - gap;
  const after = axis === 'y'
    ? viewport.height - (anchorBox.y + anchorBox.height) - gap
    : viewport.width - (anchorBox.x + anchorBox.width) - gap;
  if (size > Math.max(before, after)) {
    return {
      feasible: false,
      reason:
        `Display too small: the popup needs ${Math.round(size)}px along ${axis} but only ` +
        `${Math.round(Math.max(before, 0))}px / ${Math.round(Math.max(after, 0))}px are free on either side ` +
        `of its anchor in a ${viewport.width}x${viewport.height} work area.`,
    };
  }
  return { feasible: true, reason: '' };
}

/**
 * Skip the running test when the open color popup cannot fit on either side of
 * the color button. Call after the popup is visible.
 *
 * @param {import('@playwright/test').Page} win
 * @param {typeof import('@playwright/test').test} test
 */
export async function skipIfPopupCannotFit(win, test) {
  const popup = win.locator('[class~="openpen-popover-content"][data-state="open"]').first();
  const [popupBox, anchorBox, viewport, vertical] = await Promise.all([
    popup.boundingBox(),
    win.getByTestId('controlbar-color-btn').boundingBox(),
    win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
    win.evaluate(() => {
      const bar = document.querySelector('[data-testid="control-bar"]');
      return !!bar && /vbar-(left|right|free)/.test(bar.className);
    }),
  ]);
  if (!popupBox || !anchorBox) return;
  const { feasible, reason } = popupSideFeasibility({
    popupBox,
    anchorBox,
    viewport,
    axis: vertical ? 'x' : 'y',
  });
  test.skip(!feasible, reason);
}
