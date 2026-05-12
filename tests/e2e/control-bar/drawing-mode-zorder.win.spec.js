/**
 * Windows z-order guard for drawing mode.
 *
 * On Windows, DWM does not reliably honour moveTop() when two windows share
 * the same alwaysOnTop level and the overlay gains OS focus. This spec verifies
 * that entering drawing mode does not prevent the control bar from receiving
 * tool-change interactions — the observable proxy for "control bar is on top".
 *
 * Skipped on non-Windows platforms (the fix is win32-only; macOS z-order is
 * enforced by the relativeLevel config and does not need this path).
 */
import { test, expect } from '@playwright/test';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';

let electronApp;

attachElectronErrorDetection(() => electronApp);

test.beforeAll(async () => {
  test.skip(process.platform !== 'win32', 'Windows-only z-order check');
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
        // Ignore closed or still-loading windows; keep polling.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Unable to locate main window with .float-ball/.control-bar within 40s');
}

test('control bar tool buttons respond while drawing mode is active', async () => {
  test.skip(process.platform !== 'win32', 'Windows-only z-order check');

  const win = await getMainWindow();

  // Expand the bar.
  await win.locator('.float-ball').click();
  await win.waitForTimeout(400);
  await expect(win.locator('.control-bar')).toBeVisible({ timeout: 5000 });

  // Record the active tool before entering drawing mode.
  const toolBefore = await win.evaluate(() => {
    const active = document.querySelector('[data-tool][aria-pressed="true"], [data-tool].active');
    return active?.dataset?.tool ?? null;
  });

  // Enter drawing mode via IPC (same path the shortcut takes).
  await win.evaluate(() => window.openPenApi?.setDrawingMode?.(true));
  await win.waitForTimeout(200);

  // Click a tool button in the control bar. If the overlay is covering the bar
  // the click lands on the canvas instead and the tool does not change.
  const toolButtons = win.locator('[data-tool]');
  const count = await toolButtons.count();
  expect(count, 'tool buttons must be present in the DOM').toBeGreaterThan(0);

  // Click the first tool button that is NOT the currently active one.
  let clicked = false;
  for (let i = 0; i < count; i++) {
    const btn = toolButtons.nth(i);
    const toolId = await btn.getAttribute('data-tool');
    if (toolId && toolId !== toolBefore) {
      await btn.click({ force: false });
      clicked = true;

      // Verify the tool actually changed via IPC — proves the click reached
      // the control bar and was not consumed by the overlay canvas.
      await win.waitForFunction(
        (expectedTool) => {
          const active = document.querySelector('[data-tool][aria-pressed="true"], [data-tool].active');
          return active?.dataset?.tool === expectedTool;
        },
        toolId,
        { timeout: 3000 }
      );
      break;
    }
  }

  expect(clicked, 'could not find a non-active tool button to click').toBe(true);

  // Exit drawing mode and restore state.
  await win.evaluate(() => window.openPenApi?.setDrawingMode?.(false));
});
