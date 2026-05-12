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

async function getOverlayWin(app) {
  await new Promise(r => setTimeout(r, 1000));
  const wins = app.windows();
  for (const w of wins) {
    if (w.url().includes('window=overlay')) return w;
  }
  const w = await app.waitForEvent('window');
  await w.waitForLoadState('domcontentloaded');
  return w;
}

async function toggleDrawingModeOn(app) {
  const mainWin = await app.firstWindow();
  await mainWin.waitForLoadState('domcontentloaded');
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
    const overlayWin = await getOverlayWin(app);
    await overlayWin.waitForTimeout(800);

    // Verify debug handle is available.
    const debugExists = await overlayWin.evaluate(() =>
      typeof window.__OPENPEN_DEBUG__?.notifications?.recent === 'function'
    );
    expect(debugExists).toBe(true);

    await toggleDrawingModeOn(app);
    await overlayWin.waitForTimeout(400);

    const recent = await overlayWin.evaluate(() =>
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
    const overlayWin = await getOverlayWin(app);
    await overlayWin.waitForTimeout(800);

    await toggleDrawingModeOn(app);
    await overlayWin.waitForTimeout(400);

    const recent = await overlayWin.evaluate(() =>
      window.__OPENPEN_DEBUG__?.notifications?.recent() ?? []
    );

    expect(recent.length).toBeGreaterThan(0);
    expect(recent[0].message).toBe('Drawing Mode ON');

    await toggleDrawingModeOff(app);
  } finally {
    await app.close();
  }
});
