/**
 * E2E spec: Escape closes only the topmost plugin dialog.
 *
 * Flow under test (Settings -> Modules -> Marketplace):
 *   1. Only the detail dialog is open -> one Escape closes it.
 *   2. The "Add source" dialog is opened above the detail dialog -> the first
 *      Escape closes only the "Add source" dialog, the second closes the
 *      detail dialog.
 *
 * The detail dialog traps focus, so the "Add source" button behind it cannot be
 * reached by mouse or keyboard. The spec dispatches the click directly to stack
 * a second dialog on top of the first.
 *
 * The specs need at least one catalog card. When the catalog is unreachable
 * from the test machine the tests are skipped and say so.
 *
 * Run: npx playwright test tests/e2e/plugins-tab/dialog-escape-layering.spec.js
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchElectronApp } from '../launch.js';

let electronApp;
let settingsWin;
let sandboxHome;
let catalogAvailable = false;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  sandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-home-'));
  electronApp = await launchElectronApp({
    env: { HOME: sandboxHome, USERPROFILE: sandboxHome },
  });

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && !settingsWin) {
    for (const w of electronApp.windows()) {
      try {
        const url = w.url();
        if (url.includes('window=settings')) {
          settingsWin = w;
          break;
        }
        if (!url.includes('window=overlay')) {
          await w.evaluate(() => window.openPenApi?.openSettingsWindow());
        }
      } catch { /* window may not be ready yet */ }
    }
    if (!settingsWin) await new Promise((r) => setTimeout(r, 400));
  }
  if (!settingsWin) throw new Error('Settings window did not open within timeout');

  await settingsWin.click('[data-testid="tab-modules"]');
  const card = settingsWin.getByTestId('plugin-card').first();
  catalogAvailable = await card.waitFor({ timeout: 15000 }).then(() => true, () => false);
});

test.afterAll(async () => {
  await electronApp?.close();
  if (sandboxHome) fs.rmSync(sandboxHome, { recursive: true, force: true });
});

test.beforeEach(() => {
  test.skip(!catalogAvailable, 'Marketplace catalog is not reachable from this machine');
});

test.afterEach(async () => {
  // Leave no dialog open for the next test; extra Escapes are harmless.
  await settingsWin.keyboard.press('Escape');
  await settingsWin.keyboard.press('Escape');
});

async function openDetailDialog() {
  // Click near the top-left of the card so the footer Install button is not hit.
  await settingsWin.getByTestId('plugin-card').first().click({ position: { x: 20, y: 20 } });
  const detail = settingsWin.getByTestId('plugin-detail-dialog');
  await expect(detail).toBeVisible();
  return detail;
}

test('Escape closes the detail dialog when it is the only layer', async () => {
  const detail = await openDetailDialog();

  await settingsWin.keyboard.press('Escape');

  await expect(detail).toBeHidden();
});

test('Escape closes only the dialog stacked above the detail dialog', async () => {
  const detail = await openDetailDialog();

  // Neither the mouse nor the keyboard can reach the button behind the focus
  // trap, so dispatch the click to stack a second dialog.
  await settingsWin.getByTestId('plugins-add-source-btn').dispatchEvent('click');
  const addSourceTitle = settingsWin.getByTestId('modal-plugin-add-custom-title');
  await expect(addSourceTitle).toBeVisible();
  await expect(detail).toBeVisible();

  await settingsWin.keyboard.press('Escape');
  await expect(addSourceTitle).toBeHidden();
  await expect(detail).toBeVisible();

  await settingsWin.keyboard.press('Escape');
  await expect(detail).toBeHidden();
});
