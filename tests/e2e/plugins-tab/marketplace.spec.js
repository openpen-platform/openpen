/**
 * E2E smoke tests: Plugin Marketplace GUI.
 *
 * These are lightweight smoke tests verifying the shell renders correctly.
 * They do NOT exercise real network calls to the catalog (no plugin installed).
 *
 * Test 1: Open Settings → Modules → Plugins → Browse tab loads shell.
 * Test 2: Click Install on a card placeholder → install progress dialog appears.
 * Test 3: "Add custom plugin" button opens modal → Local folder sub-tab visible.
 *
 * NOTE: These specs do NOT run automatically in the CI pre-commit suite.
 * Run manually: npx playwright test tests/e2e/plugins-tab/
 */
import { test, expect } from '@playwright/test';
import { launchElectronApp } from '../launch.js';

let electronApp;
let settingsWin;

test.beforeAll(async () => {
  electronApp = await launchElectronApp();
});

test.afterAll(async () => {
  await electronApp?.close();
});

async function openSettingsWindow() {
  const deadline = Date.now() + 20000;
  // Open settings via ball click → settings icon
  while (Date.now() < deadline) {
    const windows = electronApp.windows();
    for (const w of windows) {
      try {
        const url = w.url();
        if (!url.includes('window=overlay') && !url.includes('window=settings')) {
          // Main window — click the ball to expand, then open settings
          await w.evaluate(() => window.openPenApi?.openSettingsWindow());
          break;
        }
      } catch { /* window may not be ready yet */ }
    }
    // Wait for settings window
    await new Promise((r) => setTimeout(r, 400));
    const wins = electronApp.windows();
    for (const w of wins) {
      try {
        if (w.url().includes('window=settings')) {
          settingsWin = w;
          return;
        }
      } catch { /* skip */ }
    }
  }
  throw new Error('Settings window did not open within timeout');
}

async function navigateToPluginsTab() {
  // Click Modules top-level tab; Marketplace sub-tab is the default.
  await settingsWin.click('.stg-tab:has-text("Modules")');
  await settingsWin.waitForTimeout(300);
}

test('Browse sub-tab renders shell', async () => {
  await openSettingsWindow();
  await navigateToPluginsTab();
  await settingsWin.waitForTimeout(500);

  // Should show either loading, error, or a search bar (shell)
  const hasSearch = await settingsWin.locator('[aria-label="Search modules…"]').isVisible().catch(() => false);
  const hasLoading = await settingsWin.locator('text=Loading catalog').isVisible().catch(() => false);
  const hasError = await settingsWin.locator('text=Retry').isVisible().catch(() => false);

  expect(hasSearch || hasLoading || hasError).toBe(true);
});

test('Install progress dialog: appears when Install clicked on a card', async () => {
  // This test requires at least one card to be visible in Browse view.
  // If catalog fetch fails in test environment, skip gracefully.
  const installBtns = settingsWin.locator('.mp-install-btn:not([disabled])');
  const count = await installBtns.count().catch(() => 0);

  if (count === 0) {
    // No install buttons present (catalog unavailable in test env) — skip
    test.skip();
    return;
  }

  await installBtns.first().click();
  await settingsWin.waitForTimeout(300);

  // Progress dialog or install dialog should appear
  const dialogVisible = await settingsWin.locator('text=Installing').isVisible().catch(() => false);
  expect(dialogVisible).toBe(true);
});

test('"Add source" button opens modal with Local folder sub-tab', async () => {
  // The Marketplace sub-tab is already active from the previous test.
  const addBtn = settingsWin.locator('.mt-add-source-btn');
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  await settingsWin.waitForTimeout(200);

  // Modal title and Local folder sub-tab should be visible
  await expect(settingsWin.getByText('Add Custom Plugin')).toBeVisible();
  await expect(settingsWin.getByRole('button', { name: /Local folder/i })).toBeVisible();
});
