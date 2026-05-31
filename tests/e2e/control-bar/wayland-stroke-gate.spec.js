import { test, expect } from '@playwright/test';
import { launchElectronApp } from '../launch.js';
import { IS_WAYLAND_SESSION } from '../session.js';

// Wayland-only: the drawing overlay is on-demand (created on drawing-enter,
// destroyed on exit). A stroke only enters the store on pointer-up, so a
// drawing-exit issued mid-stroke must NOT tear the overlay down (it would lose
// the in-flight stroke). setDrawingModeState ignores an exit while a stroke is
// active; the exit takes once the pointer is released. testIgnored off Wayland by
// playwright.config.js; the inline skip is belt-and-suspenders for a direct run.
test.skip(!IS_WAYLAND_SESSION, 'Wayland on-demand-overlay teardown gate only');

let app;
test.beforeAll(async () => { app = await launchElectronApp(); });
test.afterAll(async () => { await app?.close(); });

function overlayCount() {
  return app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().filter(
      (w) => !w.isDestroyed() && w.webContents.getURL().includes('role=overlay-bar'),
    ).length,
  );
}

async function findBar() {
  let bar = null;
  await expect
    .poll(() => {
      for (const w of app.windows()) if (w.url().includes('role=panel')) { bar = w; return true; }
      return false;
    }, { timeout: 15000 })
    .toBe(true);
  return bar;
}

test('a drawing-exit issued mid-stroke is ignored; exit proceeds after pointer-up', async () => {
  const bar = await findBar();

  await bar.evaluate(() => window.openPenApi.setDrawingMode(true));
  await expect.poll(overlayCount, { timeout: 15000 }).toBe(1);

  let overlay = null;
  for (const w of app.windows()) if (w.url().includes('role=overlay-bar')) overlay = w;
  expect(overlay).not.toBeNull();
  await overlay.waitForSelector('.overlay-canvas', { timeout: 10000 });

  // Begin a stroke and hold (no pointer-up yet).
  await overlay.evaluate(() => {
    document.querySelector('.overlay-canvas').dispatchEvent(
      new PointerEvent('pointerdown', { clientX: 200, clientY: 200, bubbles: true, pointerId: 1 }),
    );
  });
  await overlay.waitForTimeout(150); // let STROKE_ACTIVE(true) reach main

  // Exit mid-stroke → must be IGNORED; the overlay survives.
  await bar.evaluate(() => window.openPenApi.setDrawingMode(false));
  await bar.waitForTimeout(400);
  expect(await overlayCount(), 'overlay must survive a mid-stroke drawing-exit').toBe(1);

  // Release the pointer, then exit → now the overlay is torn down.
  await overlay.evaluate(() => {
    document.querySelector('.overlay-canvas').dispatchEvent(
      new PointerEvent('pointerup', { clientX: 220, clientY: 220, bubbles: true, pointerId: 1 }),
    );
  });
  await overlay.waitForTimeout(150);
  await bar.evaluate(() => window.openPenApi.setDrawingMode(false));
  await expect
    .poll(overlayCount, { timeout: 15000, message: 'overlay destroyed after pointer-up exit' })
    .toBe(0);
});
