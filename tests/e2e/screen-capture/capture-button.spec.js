/**
 * Screen capture entry points.
 *
 * Covers the control-bar split button (main click plus a menu with save and
 * copy) and the main-process validation of the capture request.
 *
 * Neither test triggers a real capture: the menu is only opened and closed,
 * and the request carries an invalid target, which the main process must
 * refuse before touching the screen.
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

async function expandBar(win) {
  const bar = win.getByTestId('control-bar');
  if (!(await bar.isVisible().catch(() => false))) {
    await win.getByTestId('floatball-btn').click();
    await win.waitForTimeout(400);
  }
  await expect(bar).toBeVisible({ timeout: 5000 });
}

test('control bar offers capture with save and copy in its menu', async () => {
  const win = await getMainWindow();
  await expandBar(win);

  await expect(win.getByTestId('controlbar-capture-btn')).toBeVisible({ timeout: 5000 });
  await win.getByTestId('controlbar-capture-caret').click();
  await expect(win.getByTestId('capture-menu-save')).toBeVisible({ timeout: 3000 });
  await expect(win.getByTestId('capture-menu-copy')).toBeVisible();

  await win.keyboard.press('Escape');
  await expect(win.getByTestId('capture-menu-save')).not.toBeVisible({ timeout: 3000 });
});

test('main process refuses a capture request with an unknown target', async () => {
  const win = await getMainWindow();
  const result = await win.evaluate(() => window.openPenApi.captureScreen('delete'));
  expect(result).toEqual({ ok: false, error: 'failed' });
});
