/**
 * E2E smoke tests: Plugin Marketplace GUI.
 *
 * These are lightweight smoke tests verifying the shell renders correctly.
 * They do NOT exercise real network calls to the catalog (no plugin installed).
 *
 * Test 1: Open Settings → Modules → Plugins → Browse tab loads shell.
 * Test 2: Click Install on a card placeholder → install progress dialog appears.
 * Test 3: "Add custom plugin" button opens modal → Local folder sub-tab visible.
 * Also asserts Electron's HOME is the sandbox and the real plugins dir is untouched.
 *
 * Test 2 may perform a real catalog install when the catalog is reachable, so
 * Electron runs against a throwaway HOME: the plugin lands in
 * <sandbox>/.openpen/plugins and the sandbox is removed after the run.
 *
 * NOTE: These specs do NOT run automatically in the CI pre-commit suite.
 * Run manually: npx playwright test tests/e2e/plugins-tab/
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchElectronApp } from '../launch.js';

let electronApp;
let settingsWin;
let sandboxHome;
let installCompleted = false;

const realPluginsDir = path.join(os.homedir(), '.openpen', 'plugins');

/** Recursive relative-path listing; empty when the directory is absent. */
function listTree(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { recursive: true }).map(String).sort();
}

const realPluginsBefore = listTree(realPluginsDir);

test.beforeAll(async () => {
  sandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-home-'));
  electronApp = await launchElectronApp({
    env: { HOME: sandboxHome, USERPROFILE: sandboxHome },
  });
});

test.afterAll(async () => {
  await electronApp?.close();
  if (sandboxHome) fs.rmSync(sandboxHome, { recursive: true, force: true });
});

test('Electron resolves the plugins directory inside the sandbox HOME', async () => {
  // plugin-manager uses os.homedir() (HOME on POSIX, USERPROFILE on Windows);
  // the manifest loader reads HOME. Both must point at the sandbox.
  const env = await electronApp.evaluate(() => ({
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
  }));
  expect(env.HOME).toBe(sandboxHome);
  expect(env.USERPROFILE).toBe(sandboxHome);
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
  await settingsWin.click('[data-testid="tab-modules"]');
  await settingsWin.waitForTimeout(300);
}

test('Browse sub-tab renders shell', async () => {
  await openSettingsWindow();
  await navigateToPluginsTab();
  await settingsWin.waitForTimeout(500);

  // Should show either loading, error, or a search bar (shell)
  const hasSearch = await settingsWin.getByTestId('settings-module-search-input').isVisible().catch(() => false);
  const hasLoading = await settingsWin.getByTestId('settings-plugin-browse-loading').isVisible().catch(() => false);
  const hasError = await settingsWin.getByTestId('settings-plugin-browse-retry-btn').isVisible().catch(() => false);

  expect(hasSearch || hasLoading || hasError).toBe(true);
});

test('Install progress dialog: appears when Install clicked on a card', async () => {
  // This test requires at least one card to be visible in Browse view.
  // If catalog fetch fails in test environment, skip gracefully.
  const installBtns = settingsWin.locator('[data-testid="plugin-install-btn"]:not([disabled])');
  const count = await installBtns.count().catch(() => 0);

  if (count === 0) {
    // No install buttons present (catalog unavailable in test env) — skip
    test.skip();
    return;
  }

  await installBtns.first().click();
  await settingsWin.waitForTimeout(300);

  // Progress dialog or install dialog should appear
  const dialog = settingsWin.getByTestId('modal-plugin-install-progress-dialog');
  const dialogVisible = await dialog.isVisible().catch(() => false);
  expect(dialogVisible).toBe(true);

  // Let the install settle, then dismiss the dialog so its overlay does not
  // intercept clicks in the next test.
  const dismissBtn = dialog.getByRole('button', { name: /^(Later|Dismiss)$/ });
  await dismissBtn.waitFor({ timeout: 20000 });
  installCompleted = (await dismissBtn.textContent())?.trim() === 'Later';
  await dismissBtn.click();
  await expect(dialog).toBeHidden();
});

test('"Add source" button opens modal with Local folder sub-tab', async () => {
  // The Marketplace sub-tab is already active from the previous test.
  const addBtn = settingsWin.getByTestId('plugins-add-source-btn');
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  await settingsWin.waitForTimeout(200);

  // Modal title and Local folder sub-tab should be visible
  await expect(settingsWin.getByTestId('modal-plugin-add-custom-title')).toBeVisible();
  await expect(settingsWin.getByRole('button', { name: /Local folder/i })).toBeVisible();
});

test('Installed plugin stays in the sandbox; real ~/.openpen/plugins untouched', async () => {
  // Close first so an in-flight install has finished or been torn down.
  await electronApp.close();
  electronApp = undefined;
  expect(listTree(realPluginsDir)).toEqual(realPluginsBefore);
  if (installCompleted) {
    const sandboxPlugins = listTree(path.join(sandboxHome, '.openpen', 'plugins'));
    expect(sandboxPlugins.some((p) => p.endsWith('plugin.json'))).toBe(true);
  }
});
