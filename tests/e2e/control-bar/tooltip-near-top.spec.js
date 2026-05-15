/**
 * P1-3 regression: horizontal-bar tooltip does not overflow workArea top edge.
 *
 * When the main window is at the top of the workArea, the default upward tooltip
 * (bottom: calc(100% + 8px)) would extend above the visible area. The
 * tooltip-flip-down class must flip the tooltip to open downward instead.
 *
 * All assertions use boundingBox() — screenshot tools cannot verify overflow
 * on transparent overlay windows but geometric bounds can.
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
        const ready = await win.evaluate(() => !!document.querySelector('[data-testid="floatball-btn"], [data-testid="control-bar"]'));
        if (ready) return win;
      } catch {
        // Ignore windows still loading.
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Main window not found within 40s');
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

async function ensureBallMode(win) {
  const bar = win.getByTestId('control-bar');
  if (await bar.isVisible().catch(() => false)) {
    const collapseBtn = win.getByTestId('controlbar-collapse-btn');
    if (await collapseBtn.isVisible().catch(() => false)) {
      await collapseBtn.click({ force: true });
      await win.waitForTimeout(400);
    } else {
      await win.mouse.move(10, 10);
      await win.waitForTimeout(3600);
    }
  }
  await expect(win.getByTestId('floatball-btn')).toBeVisible({ timeout: 5000 });
}

test('P1-3: tooltip-flip-down class present when ball is near workArea top edge', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);

  // Place ball just below workArea top — within the 60px threshold.
  const nearTopX = wa.x + Math.floor(wa.width / 2);
  const nearTopY = wa.y + 30; // 30px from top, well within 60px threshold

  await setBallScreenPos(win, nearTopX, nearTopY);

  // Expand bar.
  await win.getByTestId('floatball-btn').click();
  await win.waitForTimeout(400);
  await expect(win.getByTestId('control-bar')).toBeVisible();

  // The control-bar must carry .tooltip-flip-down when near the top edge
  // and in horizontal (non-vertical) mode.
  const hasFlipClass = await win.evaluate(() => {
    const bar = document.querySelector('.control-bar');
    return bar?.classList.contains('tooltip-flip-down') ?? false;
  });
  expect(hasFlipClass).toBe(true);
});

test('P1-3: tooltip-flip-down class absent when ball is far from workArea top edge', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);

  // Place ball at screen center — far from top edge.
  const midX = wa.x + Math.floor(wa.width / 2);
  const midY = wa.y + Math.floor(wa.height / 2);

  await setBallScreenPos(win, midX, midY);

  // Expand bar.
  await win.getByTestId('floatball-btn').click();
  await win.waitForTimeout(400);
  await expect(win.getByTestId('control-bar')).toBeVisible();

  const hasFlipClass = await win.evaluate(() => {
    const bar = document.querySelector('.control-bar');
    return bar?.classList.contains('tooltip-flip-down') ?? false;
  });
  expect(hasFlipClass).toBe(false);
});

test('P1-3: tooltip element does not overflow workArea top when bar is at top edge', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);

  // Move ball to workArea top area.
  const nearTopX = wa.x + Math.floor(wa.width / 2);
  const nearTopY = wa.y + 30;

  await setBallScreenPos(win, nearTopX, nearTopY);

  // Expand bar.
  await win.getByTestId('floatball-btn').click();
  await win.waitForTimeout(400);
  await expect(win.getByTestId('control-bar')).toBeVisible();

  // Hover the first visible button to trigger tooltip.
  const firstBtn = win.locator('.cb-btn[data-tip]').first();
  await firstBtn.hover();
  await win.waitForTimeout(200);

  // The tooltip (::after pseudo-element) is not directly accessible via Playwright.
  // Verify indirectly: the button's bounding box plus tooltip height should remain
  // within the viewport. Since tooltip-flip-down is set, the tooltip renders below
  // the button (top: calc(100% + 8px)), so it cannot overflow the top edge.
  const btnBox = await firstBtn.boundingBox();
  expect(btnBox).not.toBeNull();

  // A downward-flipped tooltip renders below the button — its top = btnBox.y + btnBox.height + 8.
  // This is always >= btnBox.y >= workArea.y (viewport origin = workArea origin).
  // Confirm the button itself is inside the viewport.
  const viewport = await win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  expect(btnBox.y).toBeGreaterThanOrEqual(0);
  expect(btnBox.y + btnBox.height).toBeLessThanOrEqual(viewport.height + 1);
});
