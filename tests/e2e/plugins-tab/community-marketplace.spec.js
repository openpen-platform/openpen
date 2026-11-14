/**
 * E2E: community plugins in the marketplace.
 *
 * Both catalogs are served from a local fixture server, so no real catalog
 * address is contacted. Nothing is installed: the spec stops at the install
 * confirmation. Electron runs against a throwaway HOME.
 *
 * Run manually: npx playwright test tests/e2e/plugins-tab/community-marketplace.spec.js
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { launchElectronApp } from '../launch.js';

// The cases share one app and one settings window, and depend on each other's order.
test.describe.configure({ mode: 'serial' });

const OFFICIAL_ID = '@openpen/arrow';
const COMMUNITY_ID = '@alice/ruler';

function officialEntry() {
  return {
    id: OFFICIAL_ID, scope: 'openpen', name: 'arrow', ownerId: 1, ownerLogin: 'openpen',
    ownerType: 'Organization', description: 'official arrow', minAppVersion: '0.0.1',
    repo: 'https://github.com/openpen-platform/arrow', latestVersion: '1.0.0',
    releaseUrl: 'https://example.invalid/arrow-1.0.0.zip', sha256: 'a'.repeat(64),
    state: 'active', registeredAt: '2026-01-01T00:00:00Z',
  };
}

function communityEntry() {
  return {
    id: COMMUNITY_ID, scope: 'alice', name: 'ruler', ownerId: 1000, ownerLogin: 'alice',
    ownerType: 'User', description: 'community ruler', minAppVersion: '0.0.1',
    repo: 'https://github.com/alice/ruler', latestVersion: '1.2.0',
    releaseUrl: 'https://example.invalid/ruler-1.2.0.zip', sha256: 'b'.repeat(64),
    state: 'active', tier: 'community', reviewed: false,
    indexedAt: '2026-11-12T00:00:00Z', releasedAt: '2026-11-01T00:00:00Z',
  };
}

let server;
let baseUrl;
let electronApp;
let settingsWin;
let sandboxHome;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/plugins.json') {
      res.end(JSON.stringify({ schemaVersion: 2, plugins: [officialEntry()] }));
    } else if (req.url === '/community/plugins.json') {
      res.end(JSON.stringify({ schemaVersion: 1, tier: 'community', plugins: [communityEntry()] }));
    } else {
      res.statusCode = 404;
      res.end('{}');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  sandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-home-'));
  electronApp = await launchElectronApp({
    env: {
      HOME: sandboxHome,
      USERPROFILE: sandboxHome,
      OPENPEN_CATALOG_URL: `${baseUrl}/plugins.json`,
      OPENPEN_COMMUNITY_CATALOG_URL: `${baseUrl}/community/plugins.json`,
    },
  });
});

test.afterAll(async () => {
  await electronApp?.close();
  await new Promise((resolve) => server?.close(resolve));
  if (sandboxHome) fs.rmSync(sandboxHome, { recursive: true, force: true });
});

async function openSettingsWindow() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    for (const w of electronApp.windows()) {
      try {
        if (w.url().includes('window=settings')) { settingsWin = w; return; }
        if (!w.url().includes('window=overlay')) await w.evaluate(() => window.openPenApi?.openSettingsWindow());
      } catch { /* window may not be ready yet */ }
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('Settings window did not open within timeout');
}

/** Saving settings closes the settings window, so reopen it afterwards. */
async function saveAndReopenSettings() {
  await Promise.all([
    settingsWin.waitForEvent('close', { timeout: 10000 }),
    settingsWin.getByTestId('save-btn').click(),
  ]);
  await openSettingsWindow();
}

async function openMarketplace() {
  await settingsWin.click('[data-testid="tab-modules"]');
  await settingsWin.getByTestId('mt-sub-tab-marketplace').click();
}

test('first open lists only official plugins', async () => {
  await openSettingsWindow();
  await openMarketplace();
  await expect(settingsWin.getByText('official arrow')).toBeVisible();
  await expect(settingsWin.getByText('community ruler')).toHaveCount(0);
  await expect(settingsWin.getByTestId('plugin-unreviewed-badge')).toHaveCount(0);
});

test('turning the setting on lists the community plugin without a label on the card', async () => {
  await settingsWin.getByTestId('tab-behavior').click();
  await settingsWin.getByTestId('settings-show-community-plugins').click();
  await saveAndReopenSettings();

  await openMarketplace();
  await expect(settingsWin.getByText('community ruler')).toBeVisible();
  await expect(settingsWin.getByTestId('plugin-unreviewed-badge')).toHaveCount(0);
});

test('installing a community plugin asks for confirmation, and cancelling installs nothing', async () => {
  await settingsWin.getByTestId('plugin-install-btn').nth(1).click();
  const dialog = settingsWin.getByTestId('plugin-action-confirm-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('not been reviewed');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(fs.existsSync(path.join(sandboxHome, '.openpen', 'plugins', '@alice'))).toBe(false);
});

test('turning the setting off hides the community plugin again', async () => {
  await settingsWin.getByTestId('tab-behavior').click();
  await settingsWin.getByTestId('settings-show-community-plugins').click();
  await saveAndReopenSettings();

  await openMarketplace();
  await expect(settingsWin.getByText('official arrow')).toBeVisible();
  await expect(settingsWin.getByText('community ruler')).toHaveCount(0);
});
