import { defineConfig } from '@playwright/test';

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
      name: 'electron',
      testMatch: '**/*.spec.js',
    },
  ],
});
