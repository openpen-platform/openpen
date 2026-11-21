/**
 * E2E: marketplace cards and the detail dialog show plugin icons, covers and
 * the demo GIF, fetched and checked by the main process.
 *
 * The catalog and the images come from a local fixture server; main is told
 * to fetch raw.githubusercontent.com paths from it through
 * OPENPEN_LISTING_MEDIA_ORIGIN, so no real address is contacted. The images
 * are files already in this repo. Nothing is installed.
 *
 * Run manually: npx playwright test tests/e2e/plugins-tab/marketplace-listing.spec.js
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchElectronApp } from '../launch.js';

test.describe.configure({ mode: 'serial' });

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FILES = {
  'icon.png': path.join(ROOT, 'assets/icon.iconset/icon_256x256.png'),
  'cover.png': path.join(ROOT, 'assets/readme-feature.png'),
  'demo.gif': path.join(ROOT, '.github/readme-demo.gif'),
};

const HOSTILE_DESC = '<img src=x onerror="window.__pwned=1"> hostile listing fixture';
// A PNG header followed by padding: past the 5 MB screenshot cap.
const OVERSIZED_PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 3, 0xc0, 0, 0, 2, 0xa3]),
  Buffer.alloc(6 * 1024 * 1024),
]);
const SVG_AS_PNG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="window.__pwned=1"><rect width="9" height="9"/></svg>');
const requested = [];

function entry(name, files) {
  const repo = `openpen-${name}`;
  const raw = `https://raw.githubusercontent.com/openpen-platform/${repo}/v1.0.0`;
  return {
    id: `@openpen/${name}`, scope: 'openpen', name, ownerId: 1, ownerLogin: 'openpen-platform',
    ownerType: 'Organization', description: `${name} listing fixture`, minAppVersion: '0.0.1',
    repo: `https://github.com/openpen-platform/${repo}`, latestVersion: '1.0.0',
    releaseUrl: `https://github.com/openpen-platform/${repo}/releases/download/v1.0.0/${repo}-1.0.0.zip`,
    sha256: 'a'.repeat(64), state: 'active', registeredAt: '2026-01-01T00:00:00Z',
    icon: `${raw}/${files.icon}`,
    screenshots: [
      { src: `${raw}/${files.cover}`, alt: `${name} cover` },
      { src: `${raw}/${files.demo}`, alt: `${name} demo` },
    ],
  };
}

let server;
let electronApp;
let settingsWin;

test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === '/plugins.json') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        schemaVersion: 2,
        plugins: [
          entry('arrow', { icon: 'icon.png', cover: 'cover.png', demo: 'demo.gif' }),
          // Image files that are not there: the card must fall back to placeholders.
          entry('text', { icon: 'gone.png', cover: 'gone-cover.png', demo: 'gone.gif' }),
          // Markup in the text, an SVG named .png as the icon, an oversized cover.
          { ...entry('spotlight', { icon: 'svg.png', cover: 'big.png', demo: 'demo.gif' }), description: HOSTILE_DESC },
          // A screenshot outside the plugin's repo, and an icon from another repo.
          {
            ...entry('whiteboard', { icon: 'icon.png', cover: 'cover.png', demo: 'demo.gif' }),
            icon: 'https://raw.githubusercontent.com/openpen-platform/openpen-arrow/v1.0.0/icon.png',
            screenshots: [
              { src: 'https://raw.githubusercontent.com/openpen-platform/openpen-whiteboard/v1.0.0/../../openpen-arrow/v1.0.0/cover.png', alt: 'Escapes the repo.' },
              { src: 'https://evil.example/demo.gif', alt: 'Outside host.' },
            ],
          },
        ],
      }));
      return;
    }
    requested.push(req.url);
    if (req.url === '/raw/openpen-platform/openpen-spotlight/v1.0.0/svg.png') { res.end(SVG_AS_PNG); return; }
    if (req.url === '/raw/openpen-platform/openpen-spotlight/v1.0.0/big.png') { res.end(OVERSIZED_PNG); return; }
    const file = /^\/raw\/openpen-platform\/openpen-(?:arrow|spotlight)\/v1\.0\.0\/([a-z.]+)$/.exec(req.url ?? '')?.[1];
    if (file && FILES[file]) {
      res.end(fs.readFileSync(FILES[file]));
      return;
    }
    res.statusCode = 404;
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  electronApp = await launchElectronApp({
    env: {
      OPENPEN_CATALOG_URL: `${base}/plugins.json`,
      OPENPEN_LISTING_MEDIA_ORIGIN: `${base}/raw`,
    },
  });
});

test.afterAll(async () => {
  await electronApp?.close();
  await new Promise((resolve) => server?.close(resolve));
});

async function openMarketplace() {
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
}

/** Width the browser decoded for an <img>: 0 means it never loaded. */
const decodedWidth = (locator) => locator.evaluate((img) => img.complete ? img.naturalWidth : 0);

test('cards show the icon and cover; the detail dialog plays the demo GIF', async () => {
  await openMarketplace();
  const card = settingsWin.getByTestId('plugin-card').filter({ hasText: '@openpen/arrow' });
  await expect(card.getByTestId('plugin-listing-icon')).toBeVisible();
  await expect.poll(() => decodedWidth(card.getByTestId('plugin-listing-icon'))).toBe(256);
  await expect(card.getByTestId('plugin-listing-shot')).toHaveAttribute('alt', 'arrow cover');
  await expect.poll(() => decodedWidth(card.getByTestId('plugin-listing-shot'))).toBe(1280);
  expect(await card.getByTestId('plugin-listing-shot').getAttribute('src')).toMatch(/^blob:/);

  await card.getByText('arrow listing fixture').click();
  const hero = settingsWin.getByTestId('plugin-detail-dialog').getByTestId('plugin-detail-hero');
  await expect(hero).toHaveAttribute('alt', 'arrow demo');
  await expect.poll(() => decodedWidth(hero)).toBe(960);
  // The GIF is moving: two captures of the same element, apart in time, differ.
  const first = await hero.screenshot();
  await expect.poll(async () => !(await hero.screenshot()).equals(first), { timeout: 5000 }).toBe(true);
  await settingsWin.keyboard.press('Escape');
});

test('a plugin whose images cannot be fetched shows placeholders and the rest of its card', async () => {
  const card = settingsWin.getByTestId('plugin-card').filter({ hasText: '@openpen/text' });
  await expect(card.getByTestId('plugin-listing-icon-placeholder')).toHaveAttribute('data-status', 'failed');
  await expect(card.getByTestId('plugin-listing-shot-placeholder')).toHaveAttribute('data-status', 'failed');
  await expect(card).toContainText('text listing fixture');
  await expect(card.getByTestId('plugin-install-btn')).toBeEnabled();
  await expect(settingsWin.getByTestId('settings-plugin-browse-retry-btn')).toHaveCount(0);
});

test('hostile listing content is shown as text or refused, and the rest of each card works', async () => {
  const hostile = settingsWin.getByTestId('plugin-card').filter({ hasText: '@openpen/spotlight' });
  await expect(hostile.getByTestId('plugin-listing-icon-placeholder')).toHaveAttribute('data-status', 'failed');
  await expect(hostile.getByTestId('plugin-listing-shot-placeholder')).toHaveAttribute('data-status', 'failed');
  const desc = hostile.getByTestId('plugin-card-desc');
  await expect(desc).toHaveText(HOSTILE_DESC);
  expect(await desc.evaluate((el) => el.children.length)).toBe(0);
  await expect(hostile.getByTestId('plugin-install-btn')).toBeEnabled();

  const outside = settingsWin.getByTestId('plugin-card').filter({ hasText: '@openpen/whiteboard' });
  await expect(outside.getByTestId('plugin-listing-icon-placeholder')).toHaveAttribute('data-status', 'none');
  await expect(outside.getByTestId('plugin-listing-shot-placeholder')).toHaveAttribute('data-status', 'none');
  await expect(outside).toContainText('whiteboard listing fixture');

  expect(await settingsWin.evaluate(() => window.__pwned)).toBeUndefined();
  expect(requested.filter((u) => /whiteboard|evil|\.\./.test(u ?? ''))).toEqual([]);
});
