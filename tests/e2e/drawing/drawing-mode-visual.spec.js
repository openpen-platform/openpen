/**
 * drawing-mode-visual.spec.js — P0 visual state indicator e2e tests.
 *
 * Scenarios:
 * 1. Entering drawing mode adds drawing-active class to float-ball
 * 2. Entering drawing mode adds drawing-active class to control-bar (expanded)
 * 3. Entering drawing mode makes .draw-mode-badge visible
 * 4. Exiting drawing mode removes drawing-active class and hides the badge
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
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const wins = electronApp.windows();
    for (const win of wins) {
      try {
        await win.waitForLoadState('domcontentloaded', { timeout: 3000 });
        const hasMainUi = await win.evaluate(
          () => !!document.querySelector('.float-ball, .control-bar-wrapper'),
        );
        if (hasMainUi) return win;
      } catch {
        // Window still loading or destroyed — keep polling.
      }
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error('Main window with .float-ball not found within 20s');
}

/** Expand the control bar so .control-bar element is in the DOM. */
async function expandBar(win) {
  const ball = win.locator('.float-ball');
  await expect(ball).toBeVisible({ timeout: 3000 });
  await ball.click();
  // Wait for bar transition (350ms expand).
  await win.waitForTimeout(450);
}

// ─────────────────────────────────────────────────────────────────────────────

test('drawing mode OFF: float-ball does not have drawing-active class', async () => {
  const win = await getMainWindow();

  // Ensure drawing mode is off and bar is collapsed so float-ball is visible.
  await win.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await win.waitForTimeout(200);

  // If bar is expanded, click outside to trigger collapse (mouseleave → collapse timer).
  // Use keyboard shortcut or direct IPC unavailable; simulate mousemove to trigger passthrough.
  // Instead, wait for the ball — collapse.spec.js shows it auto-collapses after 3s mouseleave.
  // Simpler: wait up to 4s for ball to appear (auto-collapse timeout is 3s).
  const ball = win.locator('.float-ball');
  await expect(ball).toBeVisible({ timeout: 5000 });
  const cls = await ball.getAttribute('class');
  expect(cls).not.toContain('drawing-active');
});

test('drawing mode ON: float-ball gets drawing-active class', async () => {
  const win = await getMainWindow();

  // Ensure collapsed so ball is visible.
  await win.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await win.waitForTimeout(150);

  await win.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await win.waitForTimeout(200);

  const ball = win.locator('.float-ball');
  await expect(ball).toBeVisible({ timeout: 3000 });
  const cls = await ball.getAttribute('class');
  expect(cls).toContain('drawing-active');

  // Cleanup.
  await win.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await win.waitForTimeout(150);
});

test('drawing mode ON with bar expanded: control-bar gets drawing-active class', async () => {
  const win = await getMainWindow();

  // Expand bar first.
  await expandBar(win);

  await win.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await win.waitForTimeout(200);

  const bar = win.locator('.control-bar');
  await expect(bar).toBeVisible({ timeout: 3000 });
  const cls = await bar.getAttribute('class');
  expect(cls).toContain('drawing-active');

  // Cleanup.
  await win.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await win.waitForTimeout(150);
});

test('drawing mode ON: .draw-mode-badge is visible inside control-bar', async () => {
  const win = await getMainWindow();

  // Bar should already be expanded from prior test; ensure it is.
  const bar = win.locator('.control-bar');
  const barVisible = await bar.isVisible().catch(() => false);
  if (!barVisible) await expandBar(win);

  await win.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await win.waitForTimeout(200);

  const badge = win.locator('.draw-mode-badge');
  await expect(badge).toBeVisible({ timeout: 3000 });

  // Cleanup.
  await win.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await win.waitForTimeout(150);
});

test('drawing mode OFF: drawing-active removed from bar, badge hidden', async () => {
  const win = await getMainWindow();

  // Bar should be expanded; ensure it is.
  const bar = win.locator('.control-bar');
  const barVisible = await bar.isVisible().catch(() => false);
  if (!barVisible) await expandBar(win);

  // Activate then deactivate.
  await win.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await win.waitForTimeout(200);
  await win.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await win.waitForTimeout(200);

  const cls = await bar.getAttribute('class');
  expect(cls).not.toContain('drawing-active');

  const badge = win.locator('.draw-mode-badge');
  await expect(badge).toBeHidden({ timeout: 2000 });
});
