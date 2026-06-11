/**
 * E2E: Disabled built-in module shows metadata fallback in Settings → Modules tab.
 *
 * Verifies that after disabling a built-in module (stroke-width):
 *   - The row still shows the human-readable display name, not the raw module id.
 *   - The row description is not the raw "moduleNoDescription" i18n key string
 *     (i.e. some meaningful description is displayed).
 *
 * Because the module is disabled its `contributes.locales` entries are not
 * registered into vue-i18n, so the display name and description must resolve
 * through the `metadata` fallback layer on the module definition object.
 */
import { test, expect } from '@playwright/test';
import { launchElectronApp } from '../launch.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Allocate a persistent userDataDir shared across both launch phases.
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-disabled-meta-'));

fs.writeFileSync(
  path.join(userDataDir, 'config.json'),
  JSON.stringify({ language: 'en' }),
  'utf-8',
);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getMainWindow(electronApp) {
  const deadline = Date.now() + 20000;
  let mainWin = null;
  while (Date.now() < deadline) {
    const windows = electronApp.windows();
    for (const w of windows) {
      try {
        const url = w.url();
        if (!url.includes('window=overlay') && !url.includes('window=settings')) {
          mainWin = w;
          break;
        }
      } catch (_) { /* window may be closing */ }
    }
    if (mainWin) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!mainWin) throw new Error('Main window not found within timeout');
  await mainWin.waitForLoadState('domcontentloaded');
  await mainWin.waitForSelector('[data-testid="floatball-btn"], [data-testid="control-bar"]', { timeout: 20000 });
  return mainWin;
}

async function expandControlBar(mainWin) {
  const alreadyExpanded = await mainWin.evaluate(() =>
    document.querySelector('[data-testid="control-bar"]') !== null,
  );
  if (alreadyExpanded) return;
  await mainWin.waitForSelector('[data-testid="floatball-btn"]', { timeout: 10000 });
  await mainWin.evaluate(() => {
    document.querySelector('[data-testid="floatball-btn"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
  });
  await mainWin.waitForSelector('[data-testid="control-bar"]', { timeout: 5000 });
}

async function openSettingsToModulesTab(mainWin, electronApp) {
  await expandControlBar(mainWin);
  await mainWin.evaluate(() => window.openPenApi?.openSettingsWindow());
  const deadline = Date.now() + 10000;
  let settingsWin = null;
  while (Date.now() < deadline) {
    const windows = electronApp.windows();
    for (const w of windows) {
      try {
        if (w.url().includes('window=settings')) { settingsWin = w; break; }
      } catch (_) {}
    }
    if (settingsWin) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  if (!settingsWin) throw new Error('Settings window not found');
  await settingsWin.waitForLoadState('domcontentloaded');
  await settingsWin.waitForSelector('[data-testid="settings-window"]', { timeout: 10000 });
  await settingsWin.click('[data-testid="tab-modules"]');
  await settingsWin.waitForTimeout(200);
  await settingsWin.click('[data-testid="mt-sub-tab-builtin"]');
  await settingsWin.waitForSelector('[data-testid="modules-list"]', { timeout: 5000 });
  return settingsWin;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Modules tab — disabled module shows metadata fallback', () => {
  test('stroke-width row shows "Stroke Width" name and non-empty description after being disabled', async () => {
    // Step 1: Disable stroke-width via confirmation dialog.
    let app = await launchElectronApp({ userDataDir });
    let mainWin = await getMainWindow(app);
    let settingsWin = await openSettingsToModulesTab(mainWin, app);

    // Find the stroke-width row — before disabling it should show the i18n name.
    const strokeWidthRow = settingsWin.locator('[data-testid^="module-row-"]', { hasText: 'Stroke Width' }).first();
    await expect(strokeWidthRow).toBeVisible();

    // Disable stroke-width via the toggle → confirmation dialog.
    const toggle = strokeWidthRow.getByTestId('module-row-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await toggle.click();
    await settingsWin.waitForTimeout(300);

    // Confirm the disable dialog.
    await expect(settingsWin.getByTestId('modal-dialog-danger')).toBeVisible();
    await settingsWin.getByTestId('modal-dialog-danger').getByRole('button', { name: 'Disable' }).click();
    await settingsWin.waitForTimeout(300);

    await mainWin.evaluate(() => window.openPenApi?.closeSettingsWindow());
    await app.close();

    // Step 2: Relaunch — stroke-width is disabled, its locales are NOT registered.
    app = await launchElectronApp({ userDataDir });
    mainWin = await getMainWindow(app);
    settingsWin = await openSettingsToModulesTab(mainWin, app);

    // The row must still resolve the display name via metadata fallback, not show the raw id.
    const row = settingsWin.locator('[data-testid^="module-row-"]').filter({
      has: settingsWin.getByTestId('module-row-name').filter({ hasText: 'Stroke Width' }),
    }).first();
    await expect(row).toBeVisible();

    // The name must NOT be the raw module id.
    const nameEl = row.getByTestId('module-row-name');
    await expect(nameEl).not.toContainText('@openpen/stroke-width');
    await expect(nameEl).toContainText('Stroke Width');

    // The description must NOT be the raw i18n-missing sentinel.
    const descEl = row.getByTestId('module-row-desc');
    const descText = await descEl.textContent();
    expect(descText?.trim()).not.toBe('');
    expect(descText?.trim()).not.toBe('未描述');
    expect(descText?.trim()).not.toContain('moduleNoDescription');

    await app.close();
  });
});
