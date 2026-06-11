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

/** Return the main window (the one without a `?window=` param). */
async function getMainWindow() {
  const win = await electronApp.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return win;
}

/** Return the overlay window (`?window=overlay`). */
async function getOverlayWindow() {
  const wins = await electronApp.windows();
  for (const w of wins) {
    const url = w.url();
    if (url.includes('window=overlay')) return w;
  }
  // If it hasn't appeared yet, wait for the next window event.
  const win = await electronApp.waitForEvent('window');
  await win.waitForLoadState('domcontentloaded');
  return win;
}

// ─────────────────────────────────────────────────────────────────────────────

test('overlay window is created (window count >= 2)', async () => {
  await electronApp.firstWindow();
  await new Promise(r => setTimeout(r, 500));

  const wins = await electronApp.windows();
  expect(wins.length).toBeGreaterThanOrEqual(2);
});

test('overlay window URL contains ?window=overlay', async () => {
  await electronApp.firstWindow();
  await new Promise(r => setTimeout(r, 500));

  const wins = await electronApp.windows();
  const overlayWin = wins.find(w => w.url().includes('window=overlay'));
  expect(overlayWin).toBeTruthy();
});

test('overlay canvas starts without the drawing-mode class', async () => {
  const overlayWin = await getOverlayWindow();
  const canvas = overlayWin.getByTestId('canvas-overlay');
  await expect(canvas).toBeVisible({ timeout: 3000 });

  const cls = await canvas.getAttribute('class');
  expect(cls).not.toContain('drawing-mode');
});

test('setDrawingMode(true) adds drawing-mode class to the canvas', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  await mainWin.evaluate(() =>
    window.openPenApi?.setDrawingMode(true),
  );
  await overlayWin.waitForTimeout(200);

  const cls = await overlayWin.getByTestId('canvas-overlay').getAttribute('class');
  expect(cls).toContain('drawing-mode');
});

test('setDrawingMode(false) removes drawing-mode class from the canvas', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  await mainWin.evaluate(() =>
    window.openPenApi?.setDrawingMode(true),
  );
  await overlayWin.waitForTimeout(100);

  await mainWin.evaluate(() =>
    window.openPenApi?.setDrawingMode(false),
  );
  await overlayWin.waitForTimeout(200);

  const cls = await overlayWin.getByTestId('canvas-overlay').getAttribute('class');
  expect(cls).not.toContain('drawing-mode');
});

test('canvas and body cursor are hidden in drawing mode (DOM cursor takes over)', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  await mainWin.evaluate(() =>
    window.openPenApi?.setDrawingMode(true),
  );
  await overlayWin.waitForTimeout(200);

  const cursor = await overlayWin.getByTestId('canvas-overlay').evaluate(
    el => window.getComputedStyle(el).cursor,
  );
  expect(cursor).toBe('none');
  const bodyCursor = await overlayWin.evaluate(
    () => window.getComputedStyle(document.body).cursor,
  );
  expect(bodyCursor).toBe('none');

  await mainWin.evaluate(() =>
    window.openPenApi?.setDrawingMode(false),
  );
});

test('canvas cursor stays none in all drawing-mode states', async () => {
  // Canvas cursor is held constant `none` — the canvas is the primary
  // surface macOS evaluates while drawing mode is on, so keeping it
  // stable removes the transition window where macOS WindowServer
  // occasionally fails to honour the new rule. Body cursor toggles
  // separately to restore the OS cursor when the user is not drawing.
  const overlayWin = await getOverlayWindow();

  const mainWin = await getMainWindow();
  await mainWin.evaluate(() =>
    window.openPenApi?.setDrawingMode(false),
  );
  await overlayWin.waitForTimeout(100);

  const cursor = await overlayWin.getByTestId('canvas-overlay').evaluate(
    el => window.getComputedStyle(el).cursor,
  );
  expect(cursor).toBe('none');
});

test('body cursor is restored when drawing mode exits (OS cursor returns)', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  // Enter then exit so the body cursor toggles through the on→off path.
  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await overlayWin.waitForTimeout(150);
  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await overlayWin.waitForTimeout(150);

  const bodyCursor = await overlayWin.evaluate(
    () => document.body.style.cursor,
  );
  // Body inline cursor MUST be cleared on exit so macOS shows the OS
  // cursor again outside drawing mode. Holding 'none' here would hide
  // the OS cursor for the whole non-drawing session.
  expect(bodyCursor).toBe('');
});
