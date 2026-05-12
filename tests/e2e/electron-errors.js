/**
 * Electron error detection for Playwright E2E tests
 *
 * Captures:
 *   - Renderer uncaught exceptions (pageerror)
 *   - Main process stderr errors
 *
 * Usage: call attachElectronErrorDetection(getApp) at the top level of each spec.
 * getApp must return the ElectronApplication instance (may return null before beforeAll).
 *
 * @param {() => import('@playwright/test').ElectronApplication | null} getApp
 */
import { test } from '@playwright/test';

export function attachElectronErrorDetection(getApp) {
  /** Errors collected during the current test */
  const errors = [];

  /** Pages we've already attached listeners to (avoid duplicates) */
  const attached = new WeakSet();

  function attachToPage(page) {
    if (attached.has(page)) return;
    attached.add(page);
    page.on('pageerror', err => {
      errors.push(`[renderer pageerror] ${err.message}`);
    });
  }

  test.beforeAll(async () => {
    const app = getApp();
    if (!app) return;

    // Main process stderr — only lines that look like real errors
    const proc = app.process();
    if (proc?.stderr) {
      proc.stderr.on('data', chunk => {
        const text = chunk.toString();
        if (
          /\b(Error|Unhandled|Uncaught)\b/.test(text) &&
          !/DeprecationWarning|ExperimentalWarning|NODE_TLS_REJECT|GPU|Autofill/.test(text)
        ) {
          errors.push(`[main stderr] ${text.trim()}`);
        }
      });
    }

    // Attach to any BrowserWindow that opens (current or future)
    app.on('window', win => attachToPage(win));

    // Attach to windows already open at this point
    for (const win of app.windows()) {
      attachToPage(win);
    }
  });

  test.beforeEach(async () => {
    // Attach to first window lazily (may not be ready in beforeAll)
    const app = getApp();
    if (app) {
      try {
        const win = await app.firstWindow();
        attachToPage(win);
      } catch (_) { /* window not available yet */ }
    }
    // Clear errors accumulated before this test
    errors.length = 0;
  });

  test.afterEach(async ({}, testInfo) => {
    if (errors.length > 0) {
      const report = errors.splice(0).join('\n');
      throw new Error(`Electron error(s) in "${testInfo.title}":\n${report}`);
    }
  });
}
