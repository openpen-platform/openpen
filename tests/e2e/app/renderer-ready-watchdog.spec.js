/**
 * The renderer-ready watchdog (electron/renderer-ready-watchdog.js) must
 * actually fire `app.quit()` inside a real Electron process when no window
 * reports `WINDOW.CONTENT_READY` before the deadline. The unit suite verifies
 * the timer / IPC plumbing in isolation; this spec proves the wiring in
 * `electron/main.js` survives the integration into ipcMain + app + load-failure
 * paths.
 *
 * Scenario: point `VITE_DEV_SERVER_URL` at a refused-connection port so
 * `loadURL` fails and no renderer ever mounts. With a 2s deadline, the app
 * must self-quit before the test's safety timeout.
 */
import { test, expect } from '@playwright/test';
import { launchElectronApp } from '../launch.js';

test.setTimeout(15000);

test('app quits within deadline when the dev URL is unreachable', async () => {
  const electronApp = await launchElectronApp({
    env: {
      VITE_DEV_SERVER_URL: 'http://127.0.0.1:1',
      OPENPEN_RENDERER_READY_TIMEOUT_MS: '2000',
    },
  });

  const start = Date.now();
  await new Promise((resolve) => electronApp.once('close', resolve));
  const elapsed = Date.now() - start;

  // 2s deadline + boot overhead; anything under 10s proves the watchdog fired
  // rather than the test harness timing out.
  expect(elapsed).toBeLessThan(10000);
});
