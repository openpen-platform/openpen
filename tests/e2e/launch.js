import { _electron as electron } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

/**
 * Launch Electron with an isolated, English-seeded userData dir.
 *
 * Each spec calls this in its beforeAll so specs cannot leak state between
 * each other (e.g. `settings.spec.js` changing the persisted language). The
 * seeded `config.json` forces the UI to boot in English regardless of the
 * host OS locale, so English aria-label selectors are stable.
 *
 * Pass `seedConfig` to merge additional fields into the seeded config.json
 * (e.g. a stale `controlBarLayout` to test repair migrations). Pass
 * `seedConfig: false` to skip seeding entirely.
 *
 * Pass `userDataDir` to reuse an existing directory across launches (e.g.
 * to test persisted settings across restarts within a single spec).
 * When omitted, a fresh ephemeral dir is created per call.
 *
 * Returns the ElectronApplication; callers own closing it.
 *
 * @param {Parameters<typeof electron.launch>[0] & { seedConfig?: Record<string, unknown> | false; userDataDir?: string }} [overrides]
 * @returns {Promise<import('@playwright/test').ElectronApplication>}
 */
export async function launchElectronApp(overrides = {}) {
  const { seedConfig, userDataDir: providedUserDataDir, ...electronOverrides } = overrides;
  const userDataDir = providedUserDataDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-'));
  if (seedConfig !== false && !providedUserDataDir) {
    const merged = { language: 'en', ...(seedConfig ?? {}) };
    fs.writeFileSync(
      path.join(userDataDir, 'config.json'),
      JSON.stringify(merged),
      'utf-8',
    );
  }

  return electron.launch({
    args: [path.join(ROOT, 'electron/main.js')],
    ...electronOverrides,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      OPENPEN_USER_DATA_DIR: userDataDir,
      OPENPEN_AUTO_CONFIRM_QUIT: '1',
      // Point Electron at whatever URL globalSetup booted Vite at.
      // The 5173 fallback is for ad-hoc spec runs that bypass globalSetup
      // (e.g. an IDE harness that ignores playwright.config.js) — in normal
      // `npx playwright test` invocations OPENPEN_E2E_VITE_URL is always set.
      VITE_DEV_SERVER_URL: process.env.OPENPEN_E2E_VITE_URL ?? 'http://localhost:5173',
      ...(electronOverrides.env ?? {}),
    },
  });
}

/**
 * Launch Electron in production mode against `dist/index.html`.
 *
 * Mirrors `launchElectronApp` but sets `NODE_ENV=production` so
 * `electron/main.js` loads the built bundle (importmap + `openpen-runtime/*`)
 * instead of the Vite dev server. This is the only path that exercises the
 * rollup-driven SFC compile in `scripts/build-runtime.mjs`, so anything
 * relying on it (uikit `<style>` blocks, plugin CSS) only shows up here.
 *
 * Caller is responsible for ensuring `dist/` is fresh; the wrapper asserts
 * existence and fails loudly if it isn't.
 *
 * @param {Parameters<typeof launchElectronApp>[0]} [overrides]
 * @returns {Promise<import('@playwright/test').ElectronApplication>}
 */
export async function launchElectronAppProd(overrides = {}) {
  const distEntry = path.join(ROOT, 'dist', 'index.html');
  if (!fs.existsSync(distEntry)) {
    throw new Error(
      `dist/index.html missing — run \`npm run build\` before invoking launchElectronAppProd().`
    );
  }

  return launchElectronApp({
    ...overrides,
    env: {
      ...(overrides.env ?? {}),
      NODE_ENV: 'production',
    },
  });
}
