import { test, expect } from '@playwright/test';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';

let electronApp;

attachElectronErrorDetection(() => electronApp);

test.beforeAll(async () => {
  electronApp = await launchElectronApp();
});

test.afterAll(async () => {
  await electronApp?.close();
});

async function getMainWindow() {
  const win = await electronApp.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return win;
}

async function getOverlayWindow() {
  await new Promise(r => setTimeout(r, 500));
  const wins = electronApp.windows();
  for (const w of wins) {
    if (w.url().includes('window=overlay')) return w;
  }
  const win = await electronApp.waitForEvent('window');
  await win.waitForLoadState('domcontentloaded');
  return win;
}

// ─────────────────────────────────────────────────────────────────────────────

test('overlay canvas element exists and is visible', async () => {
  const overlayWin = await getOverlayWindow();
  const canvas = overlayWin.locator('.overlay-canvas');
  await expect(canvas).toBeVisible({ timeout: 3000 });
});

test('canvas has DPR-scaled width/height attributes', async () => {
  const overlayWin = await getOverlayWindow();
  const result = await overlayWin.evaluate(() => {
    const canvas = document.querySelector('.overlay-canvas');
    if (!canvas) return null;
    return {
      attrWidth: canvas.width,
      attrHeight: canvas.height,
      cssWidth: canvas.clientWidth,
      cssHeight: canvas.clientHeight,
    };
  });
  expect(result).not.toBeNull();
  // Backing-store dimensions should be >= CSS dimensions (DPR >= 1).
  expect(result.attrWidth).toBeGreaterThanOrEqual(result.cssWidth);
  expect(result.attrHeight).toBeGreaterThanOrEqual(result.cssHeight);
});

test('pointer down/move/up in drawing mode draws without throwing', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await overlayWin.waitForTimeout(200);

  const canvas = overlayWin.locator('.overlay-canvas');

  await canvas.dispatchEvent('pointerdown', { clientX: 100, clientY: 100, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointermove', { clientX: 150, clientY: 130, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointermove', { clientX: 200, clientY: 160, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointerup', { clientX: 200, clientY: 160, pointerId: 1, bubbles: true });

  await overlayWin.waitForTimeout(200);

  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
});

test('strokes persist after leaving drawing mode', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  // Reset to a clean state.
  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await overlayWin.waitForTimeout(100);

  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await overlayWin.waitForTimeout(200);

  const canvas = overlayWin.locator('.overlay-canvas');

  // Draw a visible line.
  await canvas.dispatchEvent('pointerdown', { clientX: 50, clientY: 50, pointerId: 1, buttons: 1, bubbles: true });
  for (let i = 1; i <= 8; i++) {
    await canvas.dispatchEvent('pointermove', {
      clientX: 50 + i * 25,
      clientY: 50 + i * 15,
      pointerId: 1,
      buttons: 1,
      bubbles: true,
    });
  }
  await canvas.dispatchEvent('pointerup', {
    clientX: 250,
    clientY: 170,
    pointerId: 1,
    bubbles: true,
  });
  await overlayWin.waitForTimeout(300);

  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await overlayWin.waitForTimeout(200);

  // Verify non-transparent pixels remain on the canvas.
  const hasPixels = await overlayWin.evaluate(() => {
    const canvas = document.querySelector('.overlay-canvas');
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  });

  expect(hasPixels).toBe(true);
});

test('canvas rejects pointer events outside of drawing mode (pointer-events: none)', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await overlayWin.waitForTimeout(100);

  const pointerEvents = await overlayWin.evaluate(() => {
    const canvas = document.querySelector('.overlay-canvas');
    return canvas ? window.getComputedStyle(canvas).pointerEvents : null;
  });
  expect(pointerEvents).toBe('none');
});

test('canvas pointer-events is auto in drawing mode', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await overlayWin.waitForTimeout(200);

  const pointerEvents = await overlayWin.evaluate(() => {
    const canvas = document.querySelector('.overlay-canvas');
    return canvas ? window.getComputedStyle(canvas).pointerEvents : null;
  });
  expect(pointerEvents).toBe('auto');

  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
});
