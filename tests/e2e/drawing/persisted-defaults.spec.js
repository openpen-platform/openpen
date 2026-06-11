/**
 * Persisted module defaults (@openpen/color.defaultColor,
 * @openpen/stroke-width.defaultWidth) must apply to the first stroke
 * after launch, even when the user enters drawing mode straight from
 * the floating-ball state via shortcut without ever opening ControlBar.
 *
 * A second case covers the cross-window invariant: opening and closing
 * the settings window MUST NOT re-seed (and clobber) the user's current
 * stroke style in the overlay.
 */
import { test, expect } from '@playwright/test';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';

let electronApp;

attachElectronErrorDetection(() => electronApp);

const SEEDED_COLOR = '#00ff00';
const SEEDED_WIDTH = 10;

test.beforeAll(async () => {
  electronApp = await launchElectronApp({
    seedConfig: {
      modules: {
        '@openpen/color': { defaultColor: SEEDED_COLOR },
        '@openpen/stroke-width': { defaultWidth: SEEDED_WIDTH },
      },
    },
  });
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
  await new Promise((r) => setTimeout(r, 500));
  for (const w of electronApp.windows()) {
    if (w.url().includes('window=overlay')) return w;
  }
  const win = await electronApp.waitForEvent('window');
  await win.waitForLoadState('domcontentloaded');
  return win;
}

async function getWindowCount() {
  return electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().length,
  );
}

test('first stroke after launch uses persisted defaultColor + defaultWidth', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  // Enter drawing mode without ever opening ControlBar UI elements,
  // matching the floating-ball → shortcut → draw user flow.
  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await overlayWin.waitForTimeout(200);

  const canvas = overlayWin.getByTestId('canvas-overlay');

  // Long horizontal stroke so the center band is visible and unambiguous.
  await canvas.dispatchEvent('pointerdown', {
    clientX: 80, clientY: 200, pointerId: 1, buttons: 1, bubbles: true,
  });
  for (let x = 100; x <= 400; x += 20) {
    await canvas.dispatchEvent('pointermove', {
      clientX: x, clientY: 200, pointerId: 1, buttons: 1, bubbles: true,
    });
  }
  await canvas.dispatchEvent('pointerup', {
    clientX: 400, clientY: 200, pointerId: 1, bubbles: true,
  });
  await overlayWin.waitForTimeout(300);

  const sample = await overlayWin.evaluate(() => {
    const canvas = document.querySelector('[data-testid="canvas-overlay"]');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const dpr = canvas.width / canvas.clientWidth;
    // Sample a horizontal band across the stroke center to find the
    // fully-opaque pixel with the largest green component. Anti-aliased
    // edge pixels carry blended RGB; a centred sample avoids them.
    const cssY = 200;
    const py = Math.round(cssY * dpr);
    const startX = Math.round(120 * dpr);
    const endX = Math.round(380 * dpr);
    const row = ctx.getImageData(startX, py, endX - startX, 1).data;
    let best = { r: 0, g: 0, b: 0, a: 0 };
    for (let i = 0; i < row.length; i += 4) {
      const r = row[i], g = row[i + 1], b = row[i + 2], a = row[i + 3];
      if (a === 255 && g > best.g) best = { r, g, b, a };
    }
    return best;
  });

  expect(sample).not.toBeNull();
  // The drawn stroke must be the seeded green (#00ff00), not the
  // hardcoded fallback indigo (#818cf8 → rgb(129,140,248)).
  expect(sample.g).toBeGreaterThan(240);
  expect(sample.r).toBeLessThan(20);
  expect(sample.b).toBeLessThan(20);

  // Width sanity: the stroke band thickness should reflect the seeded
  // defaultWidth (>= the indigo-fallback width of 4). We measure by
  // counting fully-opaque pixels in a vertical sample at the stroke's
  // x midpoint.
  const widthInPixels = await overlayWin.evaluate(() => {
    const canvas = document.querySelector('[data-testid="canvas-overlay"]');
    const ctx = canvas.getContext('2d');
    const dpr = canvas.width / canvas.clientWidth;
    const cx = Math.round(250 * dpr);
    const startY = Math.round(180 * dpr);
    const endY = Math.round(220 * dpr);
    const col = ctx.getImageData(cx, startY, 1, endY - startY).data;
    let opaqueRows = 0;
    for (let i = 3; i < col.length; i += 4) {
      if (col[i] === 255) opaqueRows++;
    }
    return opaqueRows / dpr;
  });

  // Lower bound > hardcoded default 4. Anti-aliased edges may add ~1px
  // tolerance; 5 is a safe floor when the seeded width is 10.
  expect(widthInPixels).toBeGreaterThanOrEqual(5);

  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
});

test('opening + closing the settings window does NOT reset the user-changed stroke style', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  // User picks a non-default red via the ControlBar code path.
  await mainWin.evaluate(() =>
    window.openPenApi?.setStrokeStyle({ color: '#ff0000', lineWidth: 8 }),
  );
  await overlayWin.waitForTimeout(150);

  // Open the settings window, wait for it to fully boot, then close it.
  // The boot-time seed must NOT clobber the red the user just picked.
  const countBefore = await getWindowCount();
  const settingsWinPromise = electronApp.waitForEvent('window', { timeout: 10000 });
  await mainWin.evaluate(() => window.openPenApi?.openSettingsWindow());
  const settingsWin = await settingsWinPromise;
  await settingsWin.waitForSelector('[data-testid="settings-window"]', { timeout: 10000 });

  await mainWin.evaluate(() => window.openPenApi?.closeSettingsWindow());
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if ((await getWindowCount()) <= countBefore) break;
    await mainWin.waitForTimeout(100);
  }

  // Now draw — the red must survive.
  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await overlayWin.waitForTimeout(200);

  const canvas = overlayWin.getByTestId('canvas-overlay');
  await canvas.dispatchEvent('pointerdown', {
    clientX: 80, clientY: 320, pointerId: 1, buttons: 1, bubbles: true,
  });
  for (let x = 100; x <= 400; x += 20) {
    await canvas.dispatchEvent('pointermove', {
      clientX: x, clientY: 320, pointerId: 1, buttons: 1, bubbles: true,
    });
  }
  await canvas.dispatchEvent('pointerup', {
    clientX: 400, clientY: 320, pointerId: 1, bubbles: true,
  });
  await overlayWin.waitForTimeout(300);

  const sample = await overlayWin.evaluate(() => {
    const canvas = document.querySelector('[data-testid="canvas-overlay"]');
    const ctx = canvas.getContext('2d');
    const dpr = canvas.width / canvas.clientWidth;
    const py = Math.round(320 * dpr);
    const startX = Math.round(120 * dpr);
    const endX = Math.round(380 * dpr);
    const row = ctx.getImageData(startX, py, endX - startX, 1).data;
    let best = { r: 0, g: 0, b: 0, a: 0 };
    for (let i = 0; i < row.length; i += 4) {
      const r = row[i], g = row[i + 1], b = row[i + 2], a = row[i + 3];
      if (a === 255 && r > best.r) best = { r, g, b, a };
    }
    return best;
  });

  // Red survives (user-chosen) — NOT green (persisted default that would
  // have been re-seeded if the settings-window boot leaked across windows).
  expect(sample.r).toBeGreaterThan(240);
  expect(sample.g).toBeLessThan(20);
  expect(sample.b).toBeLessThan(20);

  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
});
