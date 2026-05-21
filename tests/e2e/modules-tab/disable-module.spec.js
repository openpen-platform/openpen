/**
 * E2E: Module enable/disable via the Modules tab.
 *
 * Verifies that:
 * - The Modules tab lists built-in modules (Built-in sub-tab is default).
 * - Toggling a built-in module OFF triggers a confirmation dialog.
 * - After confirming, the restart banner appears and the tool is absent after restart.
 * - Toggling back ON (no dialog for re-enable) restores the tool after restart.
 * - The Plugins sub-tab shows the empty state when no plugins are installed.
 */
import { test, expect } from '@playwright/test';
import { launchElectronApp } from '../launch.js';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

// Allocate a persistent userDataDir shared across the two launch phases.
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-modules-'));

// Pre-seed with English locale.
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
  await mainWin.waitForSelector('.float-ball, .control-bar', { timeout: 20000 });
  return mainWin;
}

async function expandControlBar(mainWin) {
  const alreadyExpanded = await mainWin.evaluate(() =>
    document.querySelector('.control-bar') !== null,
  );
  if (alreadyExpanded) return;
  await mainWin.waitForSelector('.float-ball', { timeout: 10000 });
  await mainWin.evaluate(() => {
    document.querySelector('.float-ball')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    );
  });
  await mainWin.waitForSelector('.control-bar', { timeout: 5000 });
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
  // Navigate to Modules tab → Built-in sub-tab.
  await settingsWin.click('.stg-tab:has-text("Modules")');
  await settingsWin.waitForTimeout(200);
  await settingsWin.click('.mt-sub-tab:has-text("Built-in")');
  await settingsWin.waitForSelector('.modules-list', { timeout: 5000 });
  return settingsWin;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Modules tab — disable/enable freehand', () => {
  test('toggle freehand OFF → confirmation dialog opens → confirm → restart banner appears, tool absent after restart', async () => {
    // Step 1: Disable the freehand module via confirmation dialog.
    let app = await launchElectronApp({ userDataDir });
    let mainWin = await getMainWindow(app);
    let settingsWin = await openSettingsToModulesTab(mainWin, app);

    // Confirm freehand row is present.
    await settingsWin.waitForSelector('.modules-row', { timeout: 5000 });
    const freehandRow = settingsWin.locator('.modules-row', { hasText: 'freehand' }).first();
    await expect(freehandRow).toBeVisible();

    // The toggle should currently be ON (checked).
    const toggle = freehandRow.locator('.app-toggle');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');

    // Click the toggle — expect confirmation dialog to open instead of immediate disable.
    await toggle.click();
    await settingsWin.waitForTimeout(300);

    // Dialog must appear.
    await expect(settingsWin.locator('.openpen-modal-danger')).toBeVisible();

    // Click the Disable confirm button.
    await settingsWin.locator('.openpen-modal-danger').getByRole('button', { name: 'Disable' }).click();
    await settingsWin.waitForTimeout(300);

    // Dialog should close.
    await expect(settingsWin.locator('.openpen-modal-danger')).not.toBeVisible();

    // Restart banner must appear.
    await expect(settingsWin.locator('.app-banner-warning')).toBeVisible();

    // Close settings and electron.
    await mainWin.evaluate(() => window.openPenApi?.closeSettingsWindow());
    await app.close();

    // Step 2: Relaunch with the same userData — freehand must NOT load.
    app = await launchElectronApp({ userDataDir });
    mainWin = await getMainWindow(app);
    await expandControlBar(mainWin);

    const freehandBtn = mainWin.locator('[aria-label="Freehand"]');
    await expect(freehandBtn).toHaveCount(0);

    await app.close();
  });

  test('toggle freehand back ON (no dialog) → tool reappears after restart', async () => {
    // Step 1: Re-enable freehand (disabled in the previous test).
    let app = await launchElectronApp({ userDataDir });
    let mainWin = await getMainWindow(app);
    let settingsWin = await openSettingsToModulesTab(mainWin, app);

    const freehandRow = settingsWin.locator('.modules-row', { hasText: 'freehand' }).first();
    const toggle = freehandRow.locator('.app-toggle');

    // Should currently be OFF.
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');

    // Enable it — no confirmation dialog expected for re-enable.
    await toggle.click();
    await settingsWin.waitForTimeout(300);

    // No dialog should appear.
    await expect(settingsWin.locator('.openpen-modal-danger')).not.toBeVisible();

    // Restart banner appears because state diverged from boot snapshot.
    await expect(settingsWin.locator('[data-testid="modules-restart-banner"]')).toBeVisible();

    await mainWin.evaluate(() => window.openPenApi?.closeSettingsWindow());
    await app.close();

    // Step 2: Relaunch — freehand tool should be present again.
    app = await launchElectronApp({ userDataDir });
    mainWin = await getMainWindow(app);
    await expandControlBar(mainWin);

    const freehandBtn = mainWin.locator('[aria-label="Freehand"]');
    await expect(freehandBtn).toHaveCount(1);

    await app.close();
  });

  test('Plugins sub-tab shows empty state when no plugins are installed', async () => {
    // Use an isolated HOME so module-manifest-loader scans an empty plugin
    // directory regardless of plugins installed in the maintainer's real
    // `~/.openpen/plugins/`.
    const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-plugins-empty-'));
    let app = await launchElectronApp({ userDataDir, env: { HOME: isolatedHome } });
    let mainWin = await getMainWindow(app);

    await expandControlBar(mainWin);
    await mainWin.evaluate(() => window.openPenApi?.openSettingsWindow());
    const deadline = Date.now() + 10000;
    let settingsWin = null;
    while (Date.now() < deadline) {
      const windows = app.windows();
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

    // Navigate to Modules top-level tab, then switch to the Installed sub-tab.
    await settingsWin.click('.stg-tab:has-text("Modules")');
    await settingsWin.waitForTimeout(200);
    await settingsWin.click('.mt-sub-tab:has-text("Installed")');
    await settingsWin.waitForTimeout(300);

    // Empty state should be visible.
    await expect(settingsWin.locator('.modules-empty')).toBeVisible();
    await expect(settingsWin.locator('.modules-empty')).toContainText('No plugins installed.');

    await app.close();
  });
});
