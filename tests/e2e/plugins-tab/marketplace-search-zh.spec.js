/**
 * E2E: in a Chinese UI the marketplace search also matches the Chinese
 * description from the catalog's localized field.
 *
 * The catalog comes from a local fixture server (OPENPEN_CATALOG_URL); nothing
 * is installed and no real address is contacted.
 *
 * Run manually: npx playwright test tests/e2e/plugins-tab/marketplace-search-zh.spec.js
 */
import { test, expect } from '@playwright/test';
import http from 'node:http';
import { launchElectronApp } from '../launch.js';

test.describe.configure({ mode: 'serial' });

function entry(name, description, descriptionLocalized) {
  const repo = `openpen-${name}`;
  return {
    id: `@openpen/${name}`, scope: 'openpen', name, ownerId: 1, ownerLogin: 'openpen-platform',
    ownerType: 'Organization', description, minAppVersion: '0.0.1',
    repo: `https://github.com/openpen-platform/${repo}`, latestVersion: '1.0.0',
    releaseUrl: `https://github.com/openpen-platform/${repo}/releases/download/v1.0.0/${repo}-1.0.0.zip`,
    sha256: 'a'.repeat(64), state: 'active', registeredAt: '2026-01-01T00:00:00Z',
    ...(descriptionLocalized ? { descriptionLocalized } : {}),
  };
}

const CATALOG = {
  schemaVersion: 2,
  plugins: [
    entry('arrow', 'Draws straight arrows.', { 'zh-Hant': '畫直線箭頭。', 'zh-Hans': '画直线箭头。' }),
    entry('stamp', 'Places stamps.', { 'zh-Hant': '蓋印章。', 'zh-Hans': '盖印章。' }),
  ],
};

let server;
let base;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(CATALOG));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise((resolve) => server?.close(resolve));
});

async function openMarketplace(electronApp) {
  let settingsWin;
  const deadline = Date.now() + 20000;
  while (!settingsWin && Date.now() < deadline) {
    for (const w of electronApp.windows()) {
      try {
        if (w.url().includes('window=settings')) { settingsWin = w; break; }
        if (!w.url().includes('window=overlay')) await w.evaluate(() => window.openPenApi?.openSettingsWindow());
      } catch { /* window may not be ready yet */ }
    }
    if (!settingsWin) await new Promise((r) => setTimeout(r, 400));
  }
  if (!settingsWin) throw new Error('Settings window did not open within timeout');
  await settingsWin.click('[data-testid="tab-modules"]');
  await settingsWin.getByTestId('mt-sub-tab-marketplace').click();
  return settingsWin;
}

async function searchCases(language, hit, miss) {
  const app = await launchElectronApp({
    seedConfig: { language },
    env: { OPENPEN_CATALOG_URL: `${base}/plugins.json` },
  });
  try {
    const win = await openMarketplace(app);
    const cards = win.getByTestId('plugin-card');
    await expect(cards).toHaveCount(2);
    const input = win.getByTestId('settings-module-search-input');
    await input.fill(hit);
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toContainText('@openpen/arrow');
    await input.fill(miss);
    await expect(cards).toHaveCount(0);
    await input.fill('straight');
    await expect(cards).toHaveCount(1);
  } finally {
    await app.close();
  }
}

test('zh-Hant UI: Traditional description text finds the plugin; Simplified text does not', async () => {
  await searchCases('zh-Hant', '直線', '直线');
});

test('zh-Hans UI: Simplified description text finds the plugin; Traditional text does not', async () => {
  await searchCases('zh-Hans', '直线', '直線');
});
