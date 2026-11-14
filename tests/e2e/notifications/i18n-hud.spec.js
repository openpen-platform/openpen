/**
 * i18n-hud.spec.js — verifies that drawing-mode HUD messages change with the locale.
 *
 * Acceptance: NotifyPayload is plain string; message text is resolved by
 * i18n.global.t() and must match the language configured at startup.
 */
import { test, expect } from '@playwright/test';
import { launchElectronApp } from '../launch.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

// The control-bar (main) window's renderer pushes the drawing-mode toast.
async function getMainWin(app) {
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return win;
}

async function toggleDrawingModeOn(app) {
  const mainWin = await getMainWin(app);
  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(true));
}

async function toggleDrawingModeOff(app) {
  const mainWin = await app.firstWindow();
  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

test('zh-Hant locale → drawing mode ON → HUD message is「進入繪圖模式」', async () => {
  const app = await launchElectronApp({ seedConfig: { language: 'zh-Hant' } });

  try {
    const mainWin = await getMainWin(app);
    await mainWin.waitForTimeout(800);

    // Verify debug handle is available.
    const debugExists = await mainWin.evaluate(() =>
      typeof window.__OPENPEN_DEBUG__?.notifications?.recent === 'function'
    );
    expect(debugExists).toBe(true);

    await toggleDrawingModeOn(app);
    await mainWin.waitForTimeout(400);

    const recent = await mainWin.evaluate(() =>
      window.__OPENPEN_DEBUG__?.notifications?.recent() ?? []
    );

    expect(recent.length).toBeGreaterThan(0);
    expect(recent[0].message).toBe('進入繪圖模式');

    await toggleDrawingModeOff(app);
  } finally {
    await app.close();
  }
});

test('en locale → drawing mode ON → HUD message is "Drawing Mode ON"', async () => {
  const app = await launchElectronApp({ seedConfig: { language: 'en' } });

  try {
    const mainWin = await getMainWin(app);
    await mainWin.waitForTimeout(800);

    await toggleDrawingModeOn(app);
    await mainWin.waitForTimeout(400);

    const recent = await mainWin.evaluate(() =>
      window.__OPENPEN_DEBUG__?.notifications?.recent() ?? []
    );

    expect(recent.length).toBeGreaterThan(0);
    expect(recent[0].message).toBe('Drawing Mode ON');

    await toggleDrawingModeOff(app);
  } finally {
    await app.close();
  }
});
