/**
 * P1-1 regression: cold-start bar overflow (mount-first then-intent path).
 *
 * Covers the scenario reported on 2026-05-07: after a fresh app launch (cache
 * never populated), dragging the ball to a corner and expanding produced a bar
 * that jumped to the screen center. Root cause: the pre-mount estimate
 * (rightFromBall=1000) over-clamped the ball far from the intended position.
 *
 * The fix routes bar-expand intent through the onMeasure callback in
 * useBarBoundsCache, which fires after the bar element mounts with real bounds.
 * This spec exercises the cold-start path by using a fresh isolated userData
 * dir (launchElectronApp creates one per call), ensuring the cache starts empty.
 *
 * All assertions use boundingBox() — screenshot tools cannot verify overflow
 * on transparent overlay windows but geometric bounds can.
 *
 * See bar-bounds-stale.spec.js for the warm-cache resize path.
 */
import { test, expect } from '@playwright/test';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';

let electronApp;

attachElectronErrorDetection(() => electronApp);

test.beforeAll(async () => {
  // Fresh isolated userData dir → cache is guaranteed empty (cold start).
  electronApp = await launchElectronApp();
});

test.afterAll(async () => {
  await electronApp?.close();
});

async function getMainWindow() {
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    const wins = electronApp.windows();
    for (const win of wins) {
      try {
        await win.waitForLoadState('domcontentloaded', { timeout: 3000 });
        const ready = await win.evaluate(() => !!document.querySelector('.float-ball, .control-bar'));
        if (ready) return win;
      } catch {
        // Ignore windows still loading.
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Main window not found within 40s');
}

async function ensureBallMode(win) {
  const bar = win.locator('.control-bar');
  if (await bar.isVisible().catch(() => false)) {
    const collapseBtn = win.locator('.cb-collapse-btn');
    if (await collapseBtn.isVisible().catch(() => false)) {
      await collapseBtn.click({ force: true });
      await win.waitForTimeout(400);
    } else {
      await win.mouse.move(10, 10);
      await win.waitForTimeout(3600);
    }
  }
  await expect(win.locator('.float-ball')).toBeVisible({ timeout: 5000 });
}

async function setBallScreenPos(win, screenX, screenY) {
  await win.evaluate(
    async ({ x, y }) => {
      await window.openPenApi?.sendPositioningIntent?.({ type: 'drag-start' });
      await window.openPenApi?.sendPositioningIntent?.({ type: 'drag-move', ballScreenPos: { x, y } });
      await window.openPenApi?.sendPositioningIntent?.({
        type: 'drag-end',
        ballScreenPos: { x, y },
        hadMotion: true,
        enableDragAutoSnap: false,
        barBounds: null,
      });
    },
    { x: Math.round(screenX), y: Math.round(screenY) },
  );
  await win.waitForTimeout(150);
}

/**
 * After expand, wait for the onMeasure callback to fire (nextTick after mount)
 * and for the engine clamp broadcast to reach the renderer (one more tick).
 * 400ms is sufficient for the bar enter animation + IPC round-trip.
 */
async function expandAndSettle(win) {
  await win.locator('.float-ball').click();
  await win.waitForTimeout(400);
  await expect(win.locator('.control-bar')).toBeVisible({ timeout: 3000 });
}

test('P1-1 cold-start: horizontal bar stays near ball after first-ever expand at right edge', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  // Place ball near the right edge — the estimate (rightFromBall=1000) would
  // have over-clamped the ball to the workArea center.
  const nearRightX = wa.x + wa.width - 150;
  const midY = wa.y + Math.floor(wa.height / 2);

  await setBallScreenPos(win, nearRightX, midY);
  await expandAndSettle(win);

  const bar = win.locator('.control-bar');
  const barBox = await bar.boundingBox();
  const viewport = await win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));

  expect(barBox).not.toBeNull();

  // Bar must be fully inside the workArea viewport.
  expect(barBox.x).toBeGreaterThanOrEqual(-1);
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(viewport.width + 1);

  // Ball center must be near the intended right-edge position, not the workArea center.
  // float-ball is removed from DOM when bar is expanded; use engine state to read ballScreenPos.
  // With the estimate bug, the ball would be clamped to roughly viewport.width/2.
  // With the mount-first fix, the ball center should be > 60% of viewport width.
  const posState = await win.evaluate(() => window.openPenApi?.getPositioningState?.());
  expect(posState).not.toBeNull();
  const ballViewportX = posState.ballScreenPos.x - wa.x;
  expect(ballViewportX).toBeGreaterThan(viewport.width * 0.6);
});

test('P1-1 cold-start: horizontal bar stays near ball after first-ever expand at bottom edge', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  // Place ball near the bottom edge.
  const midX = wa.x + Math.floor(wa.width / 2);
  const nearBottomY = wa.y + wa.height - 150;

  await setBallScreenPos(win, midX, nearBottomY);
  await expandAndSettle(win);

  const bar = win.locator('.control-bar');
  const barBox = await bar.boundingBox();
  const viewport = await win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));

  expect(barBox).not.toBeNull();

  // Bar must not extend beyond the workArea viewport.
  expect(barBox.y).toBeGreaterThanOrEqual(-1);
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(viewport.height + 1);

  // Ball center must be near the intended bottom position, not the workArea center.
  // float-ball is removed from DOM when bar is expanded; use engine state to read ballScreenPos.
  const posState = await win.evaluate(() => window.openPenApi?.getPositioningState?.());
  expect(posState).not.toBeNull();
  const ballViewportY = posState.ballScreenPos.y - wa.y;
  expect(ballViewportY).toBeGreaterThan(viewport.height * 0.6);
});
