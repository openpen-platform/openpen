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

// Budget = cold Electron boot on a busy CI runner + 2s deadline + up to the
// 5s quit safety timer. 15s was too tight for the first spec of a CI run.
test.setTimeout(30000);

test('app quits within deadline when the dev URL is unreachable', async () => {
  const electronApp = await launchElectronApp({
    env: {
      VITE_DEV_SERVER_URL: 'http://127.0.0.1:1',
      OPENPEN_RENDERER_READY_TIMEOUT_MS: '2000',
    },
  });

  const start = Date.now();
  // Watch the child process rather than the 'close' event: if the watchdog
  // quits the app before this line runs, 'close' has already fired and a late
  // listener would wait forever.
  const proc = electronApp.process();
  let output = '';
  proc.stdout?.on('data', (chunk) => { output += chunk; });
  proc.stderr?.on('data', (chunk) => { output += chunk; });
  const exitCode = proc.exitCode !== null || proc.signalCode !== null
    ? proc.exitCode
    : await new Promise((resolve) => proc.once('exit', (code) => resolve(code)));
  const elapsed = Date.now() - start;

  // A crash or any other exit must not pass: the quit has to be the clean one
  // the watchdog starts (the dev logger echoes its timeout report to stdio).
  expect(exitCode).toBe(0);
  expect(output).toContain('[RendererReadyWatchdog] no renderer reported ready');
  // 2s deadline + boot overhead; anything under 10s proves the watchdog fired
  // rather than the test harness timing out.
  expect(elapsed).toBeLessThan(10000);
});
