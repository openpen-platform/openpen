/**
 * DOM cursor pipeline E2E.
 *
 * Playwright cannot see what the OS compositor draws on the transparent
 * overlay, so these tests cover only the renderer-observable surface:
 *   - presence / visibility of the `.openpen-custom-cursor` div
 *   - svgMarkup swap when the active tool changes
 *   - transform updates following pointermove
 *
 * Final visual sign-off MUST come from system-level desktop screenshots
 * per the OpenPen CLAUDE.md testing supreme rule.
 */
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
  const wins = await electronApp.windows();
  for (const w of wins) {
    if (w.url().includes('window=overlay')) return w;
  }
  const win = await electronApp.waitForEvent('window');
  await win.waitForLoadState('domcontentloaded');
  return win;
}

async function setDrawingMode(mainWin, enabled) {
  await mainWin.evaluate((on) => window.openPenApi?.setDrawingMode(on), enabled);
  if (enabled) {
    // The OS cursor may sit over the control bar / float ball when the test
    // toggles drawing mode, which fires the main window's passthrough guard
    // and broadcasts interactiveHover=true → overlay DOM cursor hides. Force
    // main into passthrough so the broadcast carries hover=false, modelling
    // the user having moved their pointer onto the canvas to draw.
    await mainWin.evaluate(() => window.openPenApi?.setIgnoreMouseEvents(true));
  }
}

async function setActiveTool(mainWin, tool) {
  await mainWin.evaluate(
    (cfg) => window.openPenApi?.setActiveTool(cfg),
    { tool },
  );
}

async function setStrokeStyle(mainWin, color, lineWidth = 4) {
  await mainWin.evaluate(
    (payload) => window.openPenApi?.setStrokeStyle(payload),
    { color, lineWidth },
  );
}

test('DOM cursor is not visible when drawing mode is off', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  await setDrawingMode(mainWin, false);
  await overlayWin.waitForTimeout(150);

  const count = await overlayWin.locator('.openpen-custom-cursor').count();
  expect(count).toBe(0);
});

test.skip('DOM cursor appears in drawing mode and carries an SVG payload', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  await setDrawingMode(mainWin, true);
  // Move the pointer through the overlay so updatePosition snaps the
  // transform off the (0,0) initial corner.
  await overlayWin.mouse.move(400, 300);
  await overlayWin.waitForTimeout(200);

  const cursor = overlayWin.locator('.openpen-custom-cursor');
  await expect(cursor).toBeVisible();
  const innerHtml = await cursor.evaluate((el) => el.innerHTML);
  expect(innerHtml).toContain('<svg');

  await setDrawingMode(mainWin, false);
});

test.skip('DOM cursor swaps markup when the active tool changes', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  await setDrawingMode(mainWin, true);
  await setActiveTool(mainWin, 'freehand');
  await overlayWin.mouse.move(300, 300);
  await overlayWin.waitForTimeout(150);
  const freehandMarkup = await overlayWin
    .locator('.openpen-custom-cursor')
    .evaluate((el) => el.innerHTML);

  await setActiveTool(mainWin, 'line');
  await overlayWin.waitForTimeout(150);
  const lineMarkup = await overlayWin
    .locator('.openpen-custom-cursor')
    .evaluate((el) => el.innerHTML);

  expect(freehandMarkup).not.toBe(lineMarkup);
  // Cursor SVG keyframes are namespaced per tool — used as a stable
  // identity marker that survives design tweaks to geometry.
  expect(freehandMarkup).toContain('openpen-freehand-');
  expect(lineMarkup).toContain('openpen-line-');
  expect(freehandMarkup).not.toContain('openpen-line-');
  expect(lineMarkup).not.toContain('openpen-freehand-');

  await setDrawingMode(mainWin, false);
});

test('DOM cursor transform tracks pointer position (minus hotspot)', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  await setDrawingMode(mainWin, true);
  // Wait past the staggered cursor-wakeup mouseMove bursts in the main
  // process so their synthetic events at the OS screen cursor point
  // don't overwrite the renderer-level mouse.move() we issue.
  await overlayWin.waitForTimeout(220);
  await setActiveTool(mainWin, 'freehand');
  await overlayWin.mouse.move(500, 400);
  await overlayWin.waitForTimeout(80);

  const transform = await overlayWin
    .locator('.openpen-custom-cursor')
    .evaluate((el) => el.style.transform);
  // freehand hotspot is (2, 22) → expected translate ~ (498px, 378px)
  expect(transform).toMatch(/translate3d\(498px,\s*378px,\s*0(px)?\)/);

  await setDrawingMode(mainWin, false);
});

test('cursor accent CSS var follows stroke color (solid and gradient)', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  await setDrawingMode(mainWin, true);
  await overlayWin.waitForTimeout(220);

  // Solid color → CSS var resolves to the exact hex.
  await setStrokeStyle(mainWin, '#ff3030');
  await overlayWin.waitForTimeout(100);
  const solidVar = await overlayWin.evaluate(() =>
    document.documentElement.style.getPropertyValue('--openpen-cursor-accent'),
  );
  expect(solidVar.trim()).toBe('#ff3030');

  // Gradient → CSS var takes the `from` endpoint.
  await setStrokeStyle(mainWin, { type: 'linear', from: '#22dd88', to: '#ff66aa' });
  await overlayWin.waitForTimeout(100);
  const gradientVar = await overlayWin.evaluate(() =>
    document.documentElement.style.getPropertyValue('--openpen-cursor-accent'),
  );
  expect(gradientVar.trim()).toBe('#22dd88');

  await setDrawingMode(mainWin, false);
});
