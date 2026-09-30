import { _electron as electron } from '@playwright/test';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

/**
 * Fail fast when the Electron binary has not been downloaded.
 *
 * The `electron` package fetches its binary lazily: when
 * `node_modules/electron/dist` is missing, requiring the package runs
 * `install.js` through `spawnSync`. Playwright requires it inside
 * `electron.launch()`, so the download blocks the worker's event loop — no
 * progress output, and the test timeout cannot fire. On a slow or stalled
 * network the run hangs indefinitely. Checking up front turns that into an
 * immediate error with the fix spelled out.
 *
 * Mirrors the lookup in `node_modules/electron/index.js` (`path.txt` plus the
 * `ELECTRON_OVERRIDE_DIST_PATH` escape hatch) without triggering the download.
 */
export function assertElectronBinary() {
  const electronDir = path.dirname(createRequire(import.meta.url).resolve('electron/package.json'));
  const pathFile = path.join(electronDir, 'path.txt');
  const executablePath = fs.existsSync(pathFile) ? fs.readFileSync(pathFile, 'utf-8') : null;

  let binary = null;
  if (process.env.ELECTRON_OVERRIDE_DIST_PATH) {
    binary = path.join(process.env.ELECTRON_OVERRIDE_DIST_PATH, executablePath || 'electron');
  } else if (executablePath) {
    binary = path.join(electronDir, 'dist', executablePath);
  }
  if (binary && fs.existsSync(binary)) return;

  throw new Error(
    [
      `[e2e] Electron binary not found${binary ? ` at ${binary}` : ` (${pathFile} missing)`}.`,
      'The electron package downloads its binary on first use, which would block this run without output.',
      'Download it once, then re-run the tests:',
      '  npx install-electron',
    ].join('\n'),
  );
}

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
  assertElectronBinary();
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
      // prod-smoke is a standard-model gate (float-ball + persistent overlay).
      // On Linux, force the standard path so it runs for REAL on a Wayland host
      // too (via XWayland) instead of skipping to a false-green release gate. The
      // child reads XDG_SESSION_TYPE → standard window model + ozone=x11. No-op
      // on macOS/Windows (not Linux). Done here, not in the npm script, so the
      // script stays a plain `playwright test` that runs under Windows cmd.exe.
      ...(process.platform === 'linux'
        ? { XDG_SESSION_TYPE: 'x11', ELECTRON_OZONE_PLATFORM_HINT: 'x11' }
        : {}),
    },
  });
}
