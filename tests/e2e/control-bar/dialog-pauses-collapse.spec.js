/**
 * E2E tests: auto-collapse is paused while a dialog is open.
 *
 * Reproduces the UX bug where the control bar could collapse to the floating
 * ball while the user was thinking about a dialog prompt, forcing them to
 * re-expand after dismissing.
 *
 * The "clear canvas" confirm dialog is used as the trigger because it is
 * always present and requires no extra setup.
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
          () => !!document.querySelector('[data-testid="floatball-btn"], [data-testid="control-bar"]')
        );
        if (hasMainUi) return win;
      } catch {
        // Ignore windows that are closed or still loading.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Unable to locate main window with .float-ball/.control-bar within 40s');
}

async function expandBar(win) {
  const bar = win.getByTestId('control-bar');
  if (!(await bar.isVisible().catch(() => false))) {
    await win.getByTestId('floatball-btn').click();
    await win.waitForTimeout(400);
  }
  await expect(bar).toBeVisible({ timeout: 5000 });
}

test('bar stays expanded while a dialog is open, even after pointer leaves', async () => {
  const win = await getMainWindow();

  // Ensure confirm-before-clear is ON so clicking clear opens the dialog.
  await win.evaluate(() =>
    window.openPenApi?.updateSettings({ confirmBeforeClearCanvas: true })
  );
  await win.waitForTimeout(100);

  await expandBar(win);

  // Open the clear-canvas confirm dialog.
  await win.getByTestId('controlbar-clear-btn').click();

  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 3000 });

  // Move the pointer completely away from the bar to trigger mouseleave.
  await win.mouse.move(0, 0);

  // Wait well past the 3s auto-collapse window.
  await win.waitForTimeout(3500);

  // Bar must still be visible — the dialog should have blocked auto-collapse.
  await expect(win.getByTestId('control-bar')).toBeVisible();
  await expect(win.getByTestId('floatball-btn')).not.toBeVisible();

  // Dismiss the dialog; bar should remain expanded (cursor hasn't returned).
  await win.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible({ timeout: 2000 });
});

test('bar auto-collapses after dialog is dismissed and pointer is off bar', async () => {
  const win = await getMainWindow();

  // Ensure confirm-before-clear is ON.
  await win.evaluate(() =>
    window.openPenApi?.updateSettings({ confirmBeforeClearCanvas: true })
  );
  await win.waitForTimeout(100);

  await expandBar(win);

  // Move pointer away to start collapse timer, but open dialog first.
  await win.getByTestId('controlbar-clear-btn').click();
  const dialog = win.getByRole('dialog');
  await expect(dialog).toBeVisible({ timeout: 3000 });

  await win.mouse.move(0, 0);

  // Dismiss the dialog — collapse timer should resume from this point.
  await win.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible({ timeout: 2000 });

  // Wait past the 3s auto-collapse window.
  await win.waitForTimeout(3500);

  // Bar should now have collapsed.
  await expect(win.getByTestId('floatball-btn')).toBeVisible({ timeout: 2000 });
  await expect(win.getByTestId('control-bar')).not.toBeVisible();
});
