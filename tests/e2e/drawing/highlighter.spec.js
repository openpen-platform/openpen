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
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    for (const win of electronApp.windows()) {
      try {
        const url = win.url();
        if (url.includes('window=overlay') || url.includes('window=settings')) continue;
        await win.waitForLoadState('domcontentloaded', { timeout: 3000 });
        const ready = await win.evaluate(() => !!document.querySelector('[data-testid="floatball-btn"], [data-testid="control-bar"]'));
        if (ready) return win;
      } catch {
        // Ignore windows that are still starting up.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Main window not found within 20s');
}

async function getOverlayWindow() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const win of electronApp.windows()) {
      try {
        if (!win.url().includes('window=overlay')) continue;
        await win.waitForLoadState('domcontentloaded', { timeout: 3000 });
        return win;
      } catch {
        // Ignore windows that are still starting up.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Overlay window not found within 30s');
}

async function expandBar(mainWin) {
  if (!(await mainWin.getByTestId('control-bar').isVisible())) {
    await mainWin.getByTestId('floatball-btn').click();
    await mainWin.waitForTimeout(400);
  }
}

async function prepare(mainWin, overlayWin) {
  await mainWin.evaluate(() => {
    window.openPenApi?.clearCanvas();
    window.openPenApi?.setStrokeStyle({ color: '#ff0000', lineWidth: 20 });
    window.openPenApi?.setDrawingMode(true);
  });
  await overlayWin.waitForTimeout(200);
}

// One diagonal stroke from (x0,y0) to (x0+140,y0+40); its midpoint is (x0+70,y0+20).
async function drawStroke(overlayWin, x0, y0) {
  const canvas = overlayWin.getByTestId('canvas-overlay');
  await canvas.dispatchEvent('pointerdown', { clientX: x0, clientY: y0, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointermove', { clientX: x0 + 140, clientY: y0 + 40, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointerup', { clientX: x0 + 140, clientY: y0 + 40, pointerId: 1, bubbles: true });
  await overlayWin.waitForTimeout(160);
}

async function pixelAt(overlayWin, cssX, cssY) {
  return overlayWin.evaluate(({ cssX, cssY }) => {
    const canvas = document.querySelector('[data-testid="canvas-overlay"]');
    const scale = canvas.width / canvas.clientWidth;
    const d = canvas.getContext('2d').getImageData(Math.round(cssX * scale), Math.round(cssY * scale), 1, 1).data;
    return { r: d[0], g: d[1], b: d[2], a: d[3] };
  }, { cssX, cssY });
}

test('highlighter draws a semi-transparent stroke in the selected colour; switching back to the pen is opaque', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();
  await expandBar(mainWin);
  await prepare(mainWin, overlayWin);

  await mainWin.getByTestId('controlbar-highlighter-btn').click();
  await expect(mainWin.getByTestId('controlbar-highlighter-btn')).toHaveClass(/active/);
  await mainWin.waitForTimeout(150);

  await drawStroke(overlayWin, 120, 120);
  const marked = await pixelAt(overlayWin, 190, 140);
  expect(marked.a).toBeGreaterThan(60);
  expect(marked.a).toBeLessThan(160);
  expect(marked.r).toBeGreaterThan(200);
  expect(marked.g).toBeLessThan(40);

  await mainWin.getByTestId('controlbar-freehand-btn').click();
  await mainWin.waitForTimeout(150);
  await drawStroke(overlayWin, 120, 320);
  const pen = await pixelAt(overlayWin, 190, 340);
  expect(pen.a).toBe(255);
  expect(pen.r).toBeGreaterThan(200);
});

test('undo, redo and clear act on a highlighter stroke like any other stroke', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();
  await prepare(mainWin, overlayWin);
  await mainWin.evaluate(() => window.openPenApi?.setActiveTool({ tool: 'highlighter-pen' }));
  await overlayWin.waitForTimeout(150);

  await drawStroke(overlayWin, 120, 120);
  expect((await pixelAt(overlayWin, 190, 140)).a).toBeGreaterThan(0);

  await mainWin.evaluate(() => window.openPenApi?.triggerUndo());
  await overlayWin.waitForTimeout(220);
  expect((await pixelAt(overlayWin, 190, 140)).a).toBe(0);

  await mainWin.evaluate(() => window.openPenApi?.triggerRedo());
  await overlayWin.waitForTimeout(220);
  const redone = await pixelAt(overlayWin, 190, 140);
  expect(redone.a).toBeGreaterThan(60);
  expect(redone.a).toBeLessThan(160);

  await mainWin.evaluate(() => window.openPenApi?.clearCanvas());
  await overlayWin.waitForTimeout(220);
  expect((await pixelAt(overlayWin, 190, 140)).a).toBe(0);
});

test('brush eraser and stroke eraser both remove highlighter strokes', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();
  await prepare(mainWin, overlayWin);
  await mainWin.evaluate(() => window.openPenApi?.setActiveTool({ tool: 'highlighter-pen' }));
  await overlayWin.waitForTimeout(150);

  // Two strokes 200px apart; midpoints are (190,140) and (190,340).
  await drawStroke(overlayWin, 120, 120);
  await drawStroke(overlayWin, 120, 320);
  expect((await pixelAt(overlayWin, 190, 140)).a).toBeGreaterThan(60);
  expect((await pixelAt(overlayWin, 190, 340)).a).toBeGreaterThan(60);

  // Stroke eraser: a click on the first stroke removes only that stroke.
  await mainWin.evaluate(() => window.openPenApi?.setActiveTool({ tool: 'eraser', eraserMode: 'stroke' }));
  await overlayWin.waitForTimeout(150);
  const canvas = overlayWin.getByTestId('canvas-overlay');
  await canvas.dispatchEvent('pointerdown', { clientX: 190, clientY: 140, pointerId: 3, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointermove', { clientX: 191, clientY: 140, pointerId: 3, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointerup', { clientX: 191, clientY: 140, pointerId: 3, bubbles: true });
  await overlayWin.waitForTimeout(200);
  expect((await pixelAt(overlayWin, 190, 140)).a).toBe(0);
  expect((await pixelAt(overlayWin, 190, 340)).a).toBeGreaterThan(60);

  // Brush eraser: dragging across the second stroke clears the pixels under it.
  await mainWin.evaluate(() => {
    window.openPenApi?.setStrokeStyle({ color: '#ff0000', lineWidth: 40 });
    window.openPenApi?.setActiveTool({ tool: 'eraser', eraserMode: 'brush' });
  });
  await overlayWin.waitForTimeout(150);
  await canvas.dispatchEvent('pointerdown', { clientX: 150, clientY: 330, pointerId: 4, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointermove', { clientX: 230, clientY: 350, pointerId: 4, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointerup', { clientX: 230, clientY: 350, pointerId: 4, bubbles: true });
  await overlayWin.waitForTimeout(200);
  expect((await pixelAt(overlayWin, 190, 340)).a).toBe(0);
});
