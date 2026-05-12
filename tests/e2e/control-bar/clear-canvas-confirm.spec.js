/**
 * E2E tests for the "confirm before clearing canvas" feature.
 *
 * Covers:
 * - Default ON: clicking clear-canvas shows confirm dialog; Cancel closes without clearing.
 * - Default ON: clicking clear-canvas shows confirm dialog; Confirm triggers clear.
 * - Setting OFF: clicking clear-canvas immediately fires clear without showing dialog.
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
        // Ignore windows that are closed or still loading.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Unable to locate main window with .float-ball/.control-bar within 40s');
}

/** Click the ball to expand the control bar. */
async function expandBar(win) {
  const bar = win.locator('.control-bar');
  if (!(await bar.isVisible().catch(() => false))) {
    await win.locator('.float-ball').click();
    await win.waitForTimeout(400);
  }
  await expect(bar).toBeVisible({ timeout: 5000 });
}

/** Dismiss any open confirm dialog via Escape key, then restore default setting. */
async function dismissDialogIfOpen(win) {
  // DialogHost renders via AppDialog → .openpen-modal-content
  const dialog = win.locator('.openpen-modal-content');
  if (await dialog.isVisible().catch(() => false)) {
    await win.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 2000 });
  }
}

test.beforeEach(async () => {
  const win = await getMainWindow();
  await dismissDialogIfOpen(win);
  // Ensure the setting is ON (default) before each test.
  await win.evaluate(() =>
    window.openPenApi?.updateSettings({ confirmBeforeClearCanvas: true })
  );
  await win.waitForTimeout(100);
});

test('confirm dialog appears when confirmBeforeClearCanvas is ON (default)', async () => {
  const win = await getMainWindow();
  await expandBar(win);

  const clearBtn = win.locator('.cb-clear-btn');
  await expect(clearBtn).toBeVisible({ timeout: 5000 });
  await clearBtn.click();

  // DialogHost renders via AppDialog → .openpen-modal-content
  const dialog = win.locator('.openpen-modal-content');
  await expect(dialog).toBeVisible({ timeout: 3000 });

  // Dismiss to leave clean state for subsequent tests.
  await win.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible({ timeout: 2000 });
});

test('Cancel button closes confirm dialog without clearing canvas', async () => {
  const win = await getMainWindow();
  await expandBar(win);

  await win.locator('.cb-clear-btn').click();

  const dialog = win.locator('.openpen-modal-content');
  await expect(dialog).toBeVisible({ timeout: 3000 });

  // DialogHost footer renders the cancel button with the translated label.
  await win.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 3000 });
});

test('Confirm button closes dialog and clears canvas', async () => {
  const win = await getMainWindow();
  await expandBar(win);

  await win.locator('.cb-clear-btn').click();

  const dialog = win.locator('.openpen-modal-content');
  await expect(dialog).toBeVisible({ timeout: 3000 });

  // DialogHost footer renders the ok button with the translated label ('Clear').
  await win.getByRole('button', { name: 'Clear' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 3000 });
});

test('no confirm dialog when confirmBeforeClearCanvas is OFF', async () => {
  const win = await getMainWindow();

  // Disable the confirmation setting.
  await win.evaluate(() =>
    window.openPenApi?.updateSettings({ confirmBeforeClearCanvas: false })
  );
  await win.waitForTimeout(200);

  await expandBar(win);

  await win.locator('.cb-clear-btn').click();
  await win.waitForTimeout(400);

  // Dialog must NOT appear when the setting is OFF.
  const dialog = win.locator('.openpen-modal-content');
  await expect(dialog).not.toBeVisible();
});
