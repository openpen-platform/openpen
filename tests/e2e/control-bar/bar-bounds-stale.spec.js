/**
 * P1-1 regression: bar-bounds stale cache after plugin-driven resize (warm-cache path).
 *
 * This spec covers the warm-cache resize path: expand → plugin resizes bar →
 * collapse → expand. Verifies the flush:'sync' isExpanded watcher captures the
 * updated bounds before the bar unmounts, so the next expand uses fresh measurements.
 *
 * This is a distinct path from the cold-start regression. For the cold-start
 * scenario (first expand after app boot, cache never populated), see
 * p1-1-cold-start.spec.js.
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
 * Simulates a plugin-driven bar resize by injecting extra width into the bar
 * element's CSS, triggering a ResizeObserver notification. The bar must be
 * expanded (mounted) for the observer to see the change.
 */
async function simulatePluginBarResize(win, extraWidthPx) {
  await win.evaluate((extra) => {
    const bar = document.querySelector('[data-testid="control-bar"]');
    if (bar) {
      bar.style.paddingRight = `${extra}px`;
    }
  }, extraWidthPx);
  // Give the ResizeObserver one frame to queue — but do NOT await it
  // to reproduce the timing race (collapse before observer fires).
}

test('P1-1: bar stays inside workArea after plugin resize + immediate expand', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const midX = wa.x + Math.floor(wa.width / 2);
  const midY = wa.y + Math.floor(wa.height / 2);

  // Position ball in screen center.
  await setBallScreenPos(win, midX, midY);

  // Expand bar so the bar element is mounted and ResizeObserver is wired.
  await win.getByTestId('floatball-btn').click();
  await win.waitForTimeout(400);
  await expect(win.getByTestId('control-bar')).toBeVisible();

  // Simulate a plugin resize while bar is expanded.
  await simulatePluginBarResize(win, 80);

  // Collapse before ResizeObserver callback fires — this is the race condition.
  const collapseBtn = win.getByTestId('controlbar-collapse-btn');
  if (await collapseBtn.isVisible().catch(() => false)) {
    await collapseBtn.click({ force: true });
  } else {
    await win.mouse.move(10, 10);
    await win.waitForTimeout(3600);
  }
  await expect(win.getByTestId('floatball-btn')).toBeVisible({ timeout: 5000 });

  // Immediately expand again — this is when the stale cache would cause bad clamping.
  await win.getByTestId('floatball-btn').click();
  await win.waitForTimeout(400);
  await expect(win.getByTestId('control-bar')).toBeVisible();

  // Geometric assertion: bar must be fully within the viewport (= workArea).
  const bar = win.getByTestId('control-bar');
  const barBox = await bar.boundingBox();
  const viewport = await win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));

  expect(barBox).not.toBeNull();
  expect(barBox.x).toBeGreaterThanOrEqual(-1);
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(viewport.width + 1);
});

test('P1-1: bar stays inside workArea after resize — near right edge', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  // Position ball near right edge so a stale (wider) bar estimate would over-clamp.
  const nearRightX = wa.x + wa.width - 200;
  const midY = wa.y + Math.floor(wa.height / 2);

  await setBallScreenPos(win, nearRightX, midY);

  // Expand, resize, collapse.
  await win.getByTestId('floatball-btn').click();
  await win.waitForTimeout(400);
  await expect(win.getByTestId('control-bar')).toBeVisible();

  await simulatePluginBarResize(win, 80);

  await win.mouse.move(10, 10);
  await win.waitForTimeout(3600);
  await expect(win.getByTestId('floatball-btn')).toBeVisible({ timeout: 5000 });

  // Re-expand: engine must pre-clamp with correct (fresh) bounds.
  await win.getByTestId('floatball-btn').click();
  await win.waitForTimeout(400);
  await expect(win.getByTestId('control-bar')).toBeVisible();

  const bar = win.getByTestId('control-bar');
  const barBox = await bar.boundingBox();
  const viewport = await win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));

  expect(barBox).not.toBeNull();
  expect(barBox.x).toBeGreaterThanOrEqual(-1);
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(viewport.width + 1);
});
