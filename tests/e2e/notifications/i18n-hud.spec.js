/**
 * i18n-hud.spec.js — verifies that drawing-mode HUD messages change with the locale.
 *
 * Acceptance: NotifyPayload is plain string; message text is resolved by
 * i18n.global.t() and must match the language configured at startup.
 */
import { test, expect } from '@playwright/test';
import { launchElectronApp } from '../launch.js';
import { failed, getControlBarWindow, printHudDiagnostics } from './hud-helpers.js';

// The app and window of the running test, for the failure diagnostics.
let current = null;

test.afterEach(async ({}, testInfo) => {
  try {
    if (failed(testInfo)) await printHudDiagnostics(testInfo, current?.app, current ?? {});
  } finally {
    await current?.app?.close();
    current = null;
  }
});

async function launchAndToggleOn(language) {
  current = { app: null, usedWindow: null };
  const app = await launchElectronApp({ seedConfig: { language } });
  current.app = app;

  // The control-bar (main) window's renderer pushes the drawing-mode toast.
  const mainWin = await getControlBarWindow(app);
  current.usedWindow = mainWin;
  await mainWin.waitForTimeout(800);

  // Verify debug handle is available.
  const debugExists = await mainWin.evaluate(() =>
    typeof window.__OPENPEN_DEBUG__?.notifications?.recent === 'function'
  );
  expect(debugExists).toBe(true);

  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(true));
  return mainWin;
}

// The toast arrives via a main-process round trip; poll instead of a fixed
// sleep so a slow runner does not read the history too early.
function latestMessage(mainWin) {
  return mainWin.evaluate(() =>
    window.__OPENPEN_DEBUG__?.notifications?.recent()[0]?.message ?? null
  );
}

test('zh-Hant locale → drawing mode ON → HUD message is「進入繪圖模式」', async () => {
  const mainWin = await launchAndToggleOn('zh-Hant');
  await expect.poll(() => latestMessage(mainWin)).toBe('進入繪圖模式');
  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
});

test('en locale → drawing mode ON → HUD message is "Drawing Mode ON"', async () => {
  const mainWin = await launchAndToggleOn('en');
  await expect.poll(() => latestMessage(mainWin)).toBe('Drawing Mode ON');
  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
});
