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
 */
import { createServer } from 'vite';

export default async function globalSetup() {
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

  return async () => {
    await vite.close();
  };
}
