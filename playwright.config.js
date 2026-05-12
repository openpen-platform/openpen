import { defineConfig } from '@playwright/test';

export default defineConfig({
  workers: 1,
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/e2e/report' }]],

  webServer: {
    command: 'npx vite',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
    stderr: 'pipe',
    timeout: 15000,
  },

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
