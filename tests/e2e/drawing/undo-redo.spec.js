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
    const windows = electronApp.windows();
    for (const win of windows) {
      try {
        const url = win.url();
        if (url.includes('window=overlay') || url.includes('window=settings')) continue;
        await win.waitForLoadState('domcontentloaded', { timeout: 3000 });
        const ready = await win.evaluate(() => !!document.querySelector('.float-ball, .control-bar'));
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
    const windows = electronApp.windows();
    for (const win of windows) {
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

async function prepareDrawState(mainWin, overlayWin) {
  await mainWin.evaluate(() => {
    window.openPenApi?.clearCanvas();
    window.openPenApi?.setActiveTool({ tool: 'freehand' });
    window.openPenApi?.setStrokeStyle({ color: '#111111', lineWidth: 8 });
    window.openPenApi?.setDrawingMode(true);
  });
  await overlayWin.waitForTimeout(200);
}

async function drawOneStroke(overlayWin) {
  const canvas = overlayWin.locator('.overlay-canvas');
  await canvas.dispatchEvent('pointerdown', { clientX: 120, clientY: 120, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointermove', { clientX: 260, clientY: 160, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointerup', { clientX: 260, clientY: 160, pointerId: 1, bubbles: true });
  await overlayWin.waitForTimeout(160);
}

async function hasAnyPixels(overlayWin) {
  return overlayWin.evaluate(() => {
    const canvas = document.querySelector('.overlay-canvas');
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  });
}

test('Cmd+Z undoes the last stroke', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();
  await prepareDrawState(mainWin, overlayWin);

  await drawOneStroke(overlayWin);
  expect(await hasAnyPixels(overlayWin)).toBe(true);

  const undoRegistered = await electronApp.evaluate(({ globalShortcut }) => {
    return globalShortcut.isRegistered('CommandOrControl+Z');
  });
  expect(undoRegistered).toBe(true);

  // Trigger undo via the main-window API (same code path as the global shortcut).
  await mainWin.evaluate(() => window.openPenApi?.triggerUndo());
  await overlayWin.waitForTimeout(220);

  expect(await hasAnyPixels(overlayWin)).toBe(false);
});

test('Cmd+Shift+Z redoes after an undo', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();
  await prepareDrawState(mainWin, overlayWin);

  await drawOneStroke(overlayWin);
  expect(await hasAnyPixels(overlayWin)).toBe(true);

  const undoRegistered = await electronApp.evaluate(({ globalShortcut }) => {
    return globalShortcut.isRegistered('CommandOrControl+Z');
  });
  const redoRegistered = await electronApp.evaluate(({ globalShortcut }) => {
    return globalShortcut.isRegistered('CommandOrControl+Shift+Z');
  });
  expect(undoRegistered).toBe(true);
  expect(redoRegistered).toBe(true);

  await mainWin.evaluate(() => window.openPenApi?.triggerUndo());
  await overlayWin.waitForTimeout(220);
  expect(await hasAnyPixels(overlayWin)).toBe(false);

  await mainWin.evaluate(() => window.openPenApi?.triggerRedo());
  await overlayWin.waitForTimeout(220);
  expect(await hasAnyPixels(overlayWin)).toBe(true);
});
