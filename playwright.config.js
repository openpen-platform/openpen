import { defineConfig } from '@playwright/test';
import { IS_WAYLAND_SESSION } from './tests/e2e/session.js';
import { CI_STABLE, PROD_SMOKE, STANDARD_ONLY, WAYLAND_ONLY } from './tests/e2e/spec-sets.js';

// Session-specific spec lists and the per-PR gate list live in tests/e2e/spec-sets.js.
// OPENPEN_E2E_SUBSET=ci-stable (set by `npm run test:e2e:ci`) narrows `functional`
// to CI_STABLE. It filters the same project instead of adding a second one, so a
// plain `npx playwright test <path>` never runs a stable spec twice.
const FUNCTIONAL_MATCH =
  process.env.OPENPEN_E2E_SUBSET === 'ci-stable'
    ? CI_STABLE.map((spec) => `**/${spec}`)
    : '**/*.spec.{js,ts}';

export default defineConfig({
  workers: 1,
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/e2e/report' }]],

  // globalSetup boots Vite programmatically so the port is whatever's free,
  // mirroring scripts/dev.mjs in production. The resolved URL is exposed via
  // OPENPEN_E2E_VITE_URL and consumed by tests/e2e/launch.js. Replaces the
  // prior `webServer: { command: 'npx vite', url: 'http://localhost:5173' }`
  // setup, which broke when 5173 was already taken by another local project.
  globalSetup: './tests/e2e/global-setup.js',

  use: {
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      // The functional suite. testIgnore drops the specs that can't pass on the
      // current session (forced via XDG_SESSION_TYPE by the test:e2e:* scripts).
      name: 'functional',
      testMatch: FUNCTIONAL_MATCH,
      testIgnore: [PROD_SMOKE, ...(IS_WAYLAND_SESSION ? STANDARD_ONLY : WAYLAND_ONLY)],
    },
    {
      // Prod-build smoke gate (its own `test:prod-smoke` script + dist:* pipeline).
      // Needs `npm run build` first; self-skips on Wayland (standard-model).
      name: 'prod-smoke',
      testMatch: PROD_SMOKE,
    },
  ],
});
