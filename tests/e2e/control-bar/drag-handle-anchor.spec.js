/**
 * Drag-handle anchor invariant test.
 *
 * For each of the five ball positions (free, snap-left, snap-right, snap-top,
 * snap-bottom), this spec verifies that after expanding the bar, the drag
 * handle's screen-space center is within 1 px of the ball's pre-expand center.
 *
 * All assertions use boundingBox() geometric measurements — class checks alone
 * cannot detect positioning regressions.
 */
import { test, expect } from '@playwright/test';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';

let electronApp;

attachElectronErrorDetection(() => electronApp);

test.beforeAll(async () => {
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
        const hasMainUi = await win.evaluate(
          () => !!document.querySelector('.float-ball, .control-bar')
        );
        if (hasMainUi) return win;
      } catch {
        // Ignore closed or still-loading windows.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Unable to locate main window with .float-ball/.control-bar within 40s');
}

/** Ensure the app is in ball mode, waiting for auto-collapse if needed. */
async function ensureBallMode(win) {
  const bar = win.locator('.control-bar');
  if (await bar.isVisible().catch(() => false)) {
    await win.mouse.move(200, 750);
    await win.waitForTimeout(3500);
  }
  await expect(win.locator('.float-ball')).toBeVisible({ timeout: 5000 });
}

/**
 * Place the ball at the given screen coordinates without triggering snap.
 */
async function setBallFree(win, screenX, screenY) {
  await win.evaluate(
    async ({ x, y }) => {
      await window.openPenApi?.sendPositioningIntent?.({ type: 'drag-start' });
      await window.openPenApi?.sendPositioningIntent?.({
        type: 'drag-move',
        ballScreenPos: { x, y },
      });
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
 * Snap the ball to the given edge by sending drag-end with enableDragAutoSnap=true
 * and a position that is clearly closest to that edge.
 */
async function snapBallToEdge(win, wa, edge) {
  const midX = wa.x + Math.floor(wa.width / 2);
  const midY = wa.y + Math.floor(wa.height / 2);

  // Position ball very close to the target edge so calcSnap picks that edge.
  const pos = {
    left:   { x: wa.x + 4,              y: midY },
    right:  { x: wa.x + wa.width - 4,   y: midY },
    top:    { x: midX,                   y: wa.y + 4 },
    bottom: { x: midX,                   y: wa.y + wa.height - 4 },
  }[edge];

  await win.evaluate(
    async ({ x, y }) => {
      await window.openPenApi?.sendPositioningIntent?.({ type: 'drag-start' });
      await window.openPenApi?.sendPositioningIntent?.({
        type: 'drag-move',
        ballScreenPos: { x, y },
      });
      await window.openPenApi?.sendPositioningIntent?.({
        type: 'drag-end',
        ballScreenPos: { x, y },
        hadMotion: true,
        enableDragAutoSnap: true,
        barBounds: null,
      });
    },
    { x: Math.round(pos.x), y: Math.round(pos.y) },
  );
  // Wait for snap animation to settle (250ms easeOutBack + slack).
  await win.waitForTimeout(400);
}

/**
 * Core assertion: expand the bar from ball state, then verify
 * |ballCenter - dragHandleCenter| ≤ 1 px on the relevant axis.
 *
 * axis: 'x' for horizontal layouts, 'y' for vertical (vbar) layouts.
 */
async function assertDragHandleAlignedToBall(win, axis) {
  const ball = win.locator('.float-ball');
  await expect(ball).toBeVisible({ timeout: 3000 });

  // Record ball center before expand.
  const ballBox = await ball.boundingBox();
  expect(ballBox).not.toBeNull();
  const ballCenterX = ballBox.x + ballBox.width / 2;
  const ballCenterY = ballBox.y + ballBox.height / 2;

  // Expand the bar.
  await ball.click();
  await win.waitForTimeout(400); // 350ms enter animation + slack

  const bar = win.locator('.control-bar');
  await expect(bar).toBeVisible({ timeout: 3000 });

  // Measure drag handle center.
  const dragHandle = win.locator('.cb-drag');
  await expect(dragHandle).toBeVisible({ timeout: 2000 });
  const handleBox = await dragHandle.boundingBox();
  expect(handleBox).not.toBeNull();
  const handleCenterX = handleBox.x + handleBox.width / 2;
  const handleCenterY = handleBox.y + handleBox.height / 2;

  if (axis === 'x') {
    // Horizontal bar: X axes must align within 1 px.
    const deltaX = Math.abs(ballCenterX - handleCenterX);
    expect(deltaX).toBeLessThanOrEqual(1);
  } else {
    // Vertical bar (vbar-left / vbar-right / vbar-free): Y axes must align within 1 px.
    const deltaY = Math.abs(ballCenterY - handleCenterY);
    expect(deltaY).toBeLessThanOrEqual(1);
  }

  // Return both measured centers for the tabulated report.
  return { ballCenterX, ballCenterY, handleCenterX, handleCenterY };
}

// ─────────────────────────────────────────────────────────────────────────────

test('drag-handle anchor: free position — horizontal bar X alignment ≤ 1 px', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  // Free position at screen center.
  await setBallFree(win, wa.x + Math.floor(wa.width / 2), wa.y + Math.floor(wa.height / 2));

  await assertDragHandleAlignedToBall(win, 'x');
});

test('drag-handle anchor: snap-left — vertical bar Y alignment ≤ 1 px', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'left');

  // Verify snap landed on left edge.
  const ballCls = await win.locator('.float-ball').getAttribute('class');
  expect(ballCls).toMatch(/edge-left/);

  await assertDragHandleAlignedToBall(win, 'y');
});

test('drag-handle anchor: snap-right — vertical bar Y alignment ≤ 1 px', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'right');

  const ballCls = await win.locator('.float-ball').getAttribute('class');
  expect(ballCls).toMatch(/edge-right/);

  await assertDragHandleAlignedToBall(win, 'y');
});

test('drag-handle anchor: snap-top — horizontal bar X alignment ≤ 1 px', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'top');

  const ballCls = await win.locator('.float-ball').getAttribute('class');
  expect(ballCls).toMatch(/edge-top/);

  await assertDragHandleAlignedToBall(win, 'x');
});

test('drag-handle anchor: snap-bottom — horizontal bar X alignment ≤ 1 px', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'bottom');

  const ballCls = await win.locator('.float-ball').getAttribute('class');
  expect(ballCls).toMatch(/edge-bottom/);

  await assertDragHandleAlignedToBall(win, 'x');
});
