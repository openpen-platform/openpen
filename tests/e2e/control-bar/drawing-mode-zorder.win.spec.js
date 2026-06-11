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
          () => !!document.querySelector('[data-testid="floatball-btn"], [data-testid="control-bar"]')
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

// Built-in tool buttons in expand order. Each renders via AppButton, which
// marks the active tool with the `.active` class on its `.app-btn` element and
// forwards these stable data-testids. Keep in sync with the module ToolButton
// components (controlbar-<tool>-btn) if a built-in tool is added or renamed.
const TOOL_TESTIDS = [
  'controlbar-freehand-btn',
  'controlbar-line-btn',
  'controlbar-shape-btn',
  'controlbar-eraser-btn',
];

async function isToolActive(win, testid) {
  const btn = win.getByTestId(testid);
  if (!(await btn.isVisible().catch(() => false))) return false;
  const cls = (await btn.getAttribute('class')) ?? '';
  return /\bactive\b/.test(cls);
}

test('control bar tool buttons respond while drawing mode is active', async () => {
  test.skip(process.platform !== 'win32', 'Windows-only z-order check');

  const win = await getMainWindow();

  // Expand the bar.
  await win.getByTestId('floatball-btn').click();
  await win.waitForTimeout(400);
  await expect(win.getByTestId('control-bar')).toBeVisible({ timeout: 5000 });

  // Resolve the tool buttons currently mounted in the bar.
  const presentTools = [];
  for (const testid of TOOL_TESTIDS) {
    if (await win.getByTestId(testid).isVisible().catch(() => false)) {
      presentTools.push(testid);
    }
  }
  expect(presentTools.length, 'tool buttons must be present in the DOM').toBeGreaterThan(0);

  // Record which tool is active before entering drawing mode.
  let activeBefore = null;
  for (const testid of presentTools) {
    if (await isToolActive(win, testid)) {
      activeBefore = testid;
      break;
    }
  }

  // Enter drawing mode via IPC (same path the shortcut takes).
  await win.evaluate(() => window.openPenApi?.setDrawingMode?.(true));
  await win.waitForTimeout(200);

  // Click a tool button that is NOT the currently active one. If the overlay is
  // covering the bar the click lands on the canvas instead and the tool button
  // never gains the `.active` class.
  const target = presentTools.find((testid) => testid !== activeBefore);
  expect(target, 'could not find a non-active tool button to click').toBeTruthy();

  await win.getByTestId(target).click({ force: false });

  // Verify the clicked tool actually became active — proves the click reached
  // the control bar and was not consumed by the overlay canvas.
  await expect(win.getByTestId(target)).toHaveClass(/\bactive\b/, { timeout: 3000 });

  // Exit drawing mode and restore state.
  await win.evaluate(() => window.openPenApi?.setDrawingMode?.(false));
});
