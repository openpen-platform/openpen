/**
 * toast-above-control-bar.spec.js: the drawing-mode toast is drawn by the
 * control-bar window, above the bar, so the bar can no longer cover it.
 *
 * Scenarios:
 * 1. Ball high on screen (bar spans the toast's height): the toast is visible,
 *    overlaps the bar's box, stacks above it, and the bar stays clickable.
 *    The overlay window shows no second copy of it.
 * 2. While a capture grabs the screen, the toast's window is hidden (the toast
 *    never lands in the captured image).
 * 3. A capture started from the bar is still announced once, by the overlay,
 *    and the bar window does not echo it.
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
    for (const win of electronApp.windows()) {
      try {
        await win.waitForLoadState('domcontentloaded', { timeout: 3000 });
        const ready = await win.evaluate(
          () => !!document.querySelector('[data-testid="floatball-btn"], [data-testid="control-bar"]'),
        );
        if (ready) return win;
      } catch {
        // Window closed or still loading.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Main window not found within 40s');
}

async function getOverlayWindow() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const overlay = electronApp.windows().find((w) => w.url().includes('window=overlay'));
    if (overlay) return overlay;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Overlay window not found within 20s');
}

async function toBallMode(win) {
  await win.evaluate(() => window.openPenApi?.setDrawingMode(false));
  const bar = win.getByTestId('control-bar');
  if (await bar.isVisible().catch(() => false)) {
    const collapse = win.getByTestId('controlbar-collapse-btn');
    if (await collapse.isVisible().catch(() => false)) {
      await collapse.click({ force: true });
      await win.waitForTimeout(400);
    } else {
      await win.mouse.move(10, 10);
      await win.waitForTimeout(3600);
    }
  }
  if (!(await win.getByTestId('floatball-btn').isVisible().catch(() => false))) {
    await win.keyboard.press('Escape').catch(() => {});
    await win.waitForTimeout(500);
  }
  await expect(win.getByTestId('floatball-btn')).toBeVisible({ timeout: 8000 });
}

/** Place the ball at (x, y) in work-area coordinates, then expand the bar. */
async function expandBarAt(win, x, y) {
  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await win.evaluate(
    async ({ sx, sy }) => {
      await window.openPenApi?.sendPositioningIntent?.({ type: 'drag-start' });
      await window.openPenApi?.sendPositioningIntent?.({ type: 'drag-move', ballScreenPos: { x: sx, y: sy } });
      await window.openPenApi?.sendPositioningIntent?.({
        type: 'drag-end',
        ballScreenPos: { x: sx, y: sy },
        hadMotion: true,
        enableDragAutoSnap: false,
        barBounds: null,
      });
    },
    { sx: wa.x + x, sy: wa.y + y },
  );
  await win.waitForTimeout(400);
  await win.getByTestId('floatball-btn').click();
  await expect(win.getByTestId('control-bar')).toBeVisible({ timeout: 5000 });
  await win.waitForTimeout(600);
}

const overlaps = (a, b) =>
  Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) &&
  Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y);

/** Ball ~12% down from the top edge: the bar's row sits where the toast shows (8%). */
async function expandBarOverToastRow(win) {
  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await expandBarAt(win, Math.floor(wa.width / 2), Math.round(wa.height * 0.125));
}

test('drawing-mode toast stacks above the control bar and the bar stays clickable', async () => {
  const win = await getMainWindow();
  const overlay = await getOverlayWindow();
  await toBallMode(win);
  await expandBarOverToastRow(win);

  await win.evaluate(() => window.openPenApi?.setDrawingMode(true));
  const toast = win.getByTestId('notification-toast').first();
  await expect(toast).toBeVisible({ timeout: 3000 });
  await expect(toast).toContainText('Drawing Mode ON');

  const toastBox = await toast.boundingBox();
  const barBox = await win.getByTestId('control-bar').boundingBox();
  expect(toastBox).not.toBeNull();
  expect(barBox).not.toBeNull();
  // The layout that hides a toast drawn by the overlay: the two boxes overlap.
  expect(overlaps(toastBox, barBox)).toBe(true);

  // Stacking: the toast layer's z-index is above everything the bar renders.
  const stacking = await win.evaluate(() => {
    const layer = document.querySelector('[data-testid="notification-layer"]');
    const bar = document.querySelector('[data-testid="control-bar"]');
    const zOf = (el) => {
      let max = 0;
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        const z = Number.parseInt(getComputedStyle(n).zIndex, 10);
        if (Number.isFinite(z)) max = Math.max(max, z);
      }
      return max;
    };
    const barTopmost = Math.max(
      zOf(bar),
      ...[...bar.querySelectorAll('*')].map((el) => Number.parseInt(getComputedStyle(el).zIndex, 10) || 0),
    );
    return { layerZ: zOf(layer), barTopmost, layerPointerEvents: getComputedStyle(layer).pointerEvents };
  });
  expect(stacking.layerZ).toBeGreaterThan(stacking.barTopmost);
  expect(stacking.layerPointerEvents).toBe('none');

  // The bar is still operable under the toast.
  const lineBtn = win.getByTestId('controlbar-line-btn');
  await lineBtn.click();
  expect(await lineBtn.getAttribute('class')).toMatch(/\bactive\b/);

  // No second copy in the overlay window (it would sit under the bar). Counted
  // right now, while the bar window's toast is still up: a retrying
  // toHaveCount(0) would pass once the toast expires.
  expect(await overlay.getByTestId('notification-toast').count()).toBe(0);

  // Still auto-dismisses.
  await expect(toast).toHaveCount(0, { timeout: 4000 });

  await win.evaluate(() => window.openPenApi?.setDrawingMode(false));
});

test('the toast window is hidden while a capture grabs the screen', async () => {
  const win = await getMainWindow();
  await toBallMode(win);
  await expandBarOverToastRow(win);

  // Sample the window's visibility on every frame, together with the toast count.
  await win.evaluate(() => {
    window.__toastSamples = [];
    const tick = () => {
      window.__toastSamples.push({
        hidden: getComputedStyle(document.documentElement).visibility === 'hidden',
        toasts: document.querySelectorAll('[data-testid="notification-toast"]').length,
      });
      window.__toastSampler = requestAnimationFrame(tick);
    };
    tick();
  });

  await win.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await expect(win.getByTestId('notification-toast').first()).toBeVisible({ timeout: 3000 });
  const result = await win.evaluate(() => window.openPenApi?.captureScreen('copy'));
  test.skip(!result?.ok && result?.error === 'unsupported', 'screen capture unsupported here');
  expect(result?.ok).toBe(true);

  const samples = await win.evaluate(() => {
    cancelAnimationFrame(window.__toastSampler);
    return window.__toastSamples;
  });
  // A frame with the toast present and the window hidden = the grab skipped it.
  expect(samples.some((s) => s.toasts > 0 && s.hidden)).toBe(true);
  // The window is visible again afterwards.
  const visibleAfter = await win.evaluate(() => getComputedStyle(document.documentElement).visibility);
  expect(visibleAfter).not.toBe('hidden');

  await win.evaluate(() => window.openPenApi?.setDrawingMode(false));
});

test('a capture from the control bar is announced once, by the overlay', async () => {
  const win = await getMainWindow();
  const overlay = await getOverlayWindow();
  await toBallMode(win);
  await win.getByTestId('floatball-btn').click();
  await expect(win.getByTestId('control-bar')).toBeVisible({ timeout: 5000 });
  await win.waitForTimeout(600);

  await win.getByTestId('controlbar-capture-caret').click();
  await win.getByTestId('capture-menu-copy').click();

  // The overlay shows the outcome; the bar window shows no echo of it.
  await expect(overlay.getByTestId('notification-toast').first()).toBeVisible({ timeout: 8000 });
  expect(await overlay.getByTestId('notification-toast').count()).toBe(1);
  expect(await win.getByTestId('notification-toast').count()).toBe(0);
});
