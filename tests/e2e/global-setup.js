/**
 * Programmatic Vite boot for the e2e suite — the test-infra counterpart of
 * scripts/dev.mjs.
 *
 * Previously playwright.config.js's `webServer` ran `npx vite` and assumed
 * port 5173 was free, with `reuseExistingServer: true` reusing whatever else
 * happened to be on 5173 locally. If another project (or even an unrelated
 * Vite-based site) was already on that port, e2e specs would launch Electron
 * pointed at the foreign content and fail with confusing selector timeouts.
 *
 * createServer().listen() lets Vite pick whatever port is actually free,
 * exposes the resolved URL via `OPENPEN_E2E_VITE_URL`, and tests/e2e/launch.js
 * routes Electron there. The teardown returned from this function closes
 * Vite when Playwright finishes the run.
 *
 * It also points HOME (POSIX) and USERPROFILE (Windows) at a throwaway
 * directory for the whole run. The manifest loader reads HOME and
 * plugin-manager reads os.homedir(), so without this every launched app would
 * load the plugins installed in the developer's real ~/.openpen/plugins, and
 * specs that count control-bar buttons would fail on any machine with a
 * plugin installed. Workers inherit the overridden env, so specs that seed
 * fixture plugins under os.homedir() write into the sandbox too. The resolved
 * path is exposed as OPENPEN_E2E_HOME and the directory is removed on teardown.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'vite';
import { assertElectronBinary } from './launch.js';

export default async function globalSetup() {
  // Before booting Vite, so a missing binary fails the whole run in seconds.
  assertElectronBinary();

  const vite = await createServer({
    // Silence the dev server's startup banner so playwright's reporter stays clean.
    logLevel: 'warn',
  });
  await vite.listen();

  const url = vite.resolvedUrls?.local?.[0];
  if (!url) {
    await vite.close();
    throw new Error('[e2e:globalSetup] Vite started but resolvedUrls.local is empty');
  }

  const normalized = url.replace(/\/$/, '');
  process.env.OPENPEN_E2E_VITE_URL = normalized;
  console.log(`[e2e:globalSetup] Vite listening at ${normalized}`);

  const sandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-home-'));
  process.env.HOME = sandboxHome;
  process.env.USERPROFILE = sandboxHome;
  process.env.OPENPEN_E2E_HOME = sandboxHome;
  console.log(`[e2e:globalSetup] Sandbox HOME at ${sandboxHome}`);

  return async () => {
    await vite.close();
    fs.rmSync(sandboxHome, { recursive: true, force: true });
  };
}
