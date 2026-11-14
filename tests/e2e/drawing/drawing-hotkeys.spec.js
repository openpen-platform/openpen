/**
 * E2E: single-key tool and color shortcuts that exist only in drawing mode.
 *
 *   - outside drawing mode the keys are not grabbed from the OS, so the app
 *     underneath keeps receiving them; inside drawing mode they are grabbed
 *   - a tool key lights the matching control-bar button, and a color key
 *     changes the swatch
 *   - the settings shortcuts tab lists the rows and refuses a duplicate key
 *
 * The OS key press is simulated by the main process sending the same
 * `module:shortcut-triggered` message a real global shortcut produces.
 */
import { test, expect } from '@playwright/test';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';
import { IS_WAYLAND_SESSION } from '../session.js';

test.skip(IS_WAYLAND_SESSION, 'drawing-scoped keys are not registered on Wayland shortcut backends');

const MODULE_ID = '@openpen/drawing-hotkeys';
const ACTIVE_CLASS = /(^|\s)active(\s|$)/;

let electronApp;

attachElectronErrorDetection(() => electronApp);

test.beforeAll(async () => {
  electronApp = await launchElectronApp();
});

test.afterAll(async () => {
  await electronApp?.close();
});

async function findWindow(predicate, readySelector) {
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    for (const w of electronApp.windows()) {
      try {
        if (!predicate(w.url())) continue;
        await w.waitForLoadState('domcontentloaded', { timeout: 3000 });
        await w.waitForSelector(readySelector, { state: 'attached', timeout: 3000 });
        return w;
      } catch {
        // Window still loading; keep polling.
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Expected window not found within 40s');
}

const getMainWindow = () => findWindow(
  (url) => !url.includes('window=overlay') && !url.includes('window=settings'),
  '[data-testid="floatball-btn"], [data-testid="control-bar"]',
);

const getOverlayWindow = () => findWindow(
  (url) => url.includes('window=overlay'),
  '[data-testid="canvas-overlay"]',
);

async function expandControlBar(win) {
  const bar = win.getByTestId('control-bar');
  if (await bar.isVisible().catch(() => false)) return;
  await win.getByTestId('floatball-btn').click();
  await expect(bar).toBeVisible({ timeout: 5000 });
}

const isGrabbed = (accelerator) => electronApp.evaluate(
  ({ globalShortcut }, accel) => globalShortcut.isRegistered(accel),
  accelerator,
);

async function waitGrabbed(accelerator, expected) {
  await expect.poll(() => isGrabbed(accelerator), { timeout: 10000 }).toBe(expected);
}

function triggerShortcut(localId) {
  return electronApp.evaluate(({ BrowserWindow }, id) => {
    const overlay = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('window=overlay'));
    overlay.webContents.send('module:shortcut-triggered', { id });
  }, `${MODULE_ID}/${localId}`);
}

test('AC-3 the keys are free outside drawing mode and grabbed only while drawing', async () => {
  const mainWin = await getMainWindow();
  await getOverlayWindow();

  for (const key of ['P', 'L', 'R', 'H', 'E', 'Shift+E', '1', '8']) {
    expect(await isGrabbed(key), `${key} must not be grabbed outside drawing mode`).toBe(false);
  }

  await mainWin.evaluate(() => window.openPenApi.setDrawingMode(true));
  for (const key of ['P', 'L', 'R', 'H', 'E', 'Shift+E', '1', '8']) {
    await waitGrabbed(key, true);
  }

  await mainWin.evaluate(() => window.openPenApi.setDrawingMode(false));
  for (const key of ['P', 'L', 'R', 'H', 'E', 'Shift+E', '1', '8']) {
    await waitGrabbed(key, false);
  }
});

test('AC-1 a tool key lights the matching control-bar button and unlights the previous one', async () => {
  const mainWin = await getMainWindow();
  await getOverlayWindow();
  await expandControlBar(mainWin);
  await mainWin.evaluate(() => {
    window.openPenApi.setDrawingMode(true);
    window.openPenApi.setActiveTool({ tool: 'freehand' });
  });

  const freehandBtn = mainWin.getByTestId('controlbar-freehand-btn');
  const lineBtn = mainWin.getByTestId('controlbar-line-btn');
  const eraserBtn = mainWin.getByTestId('controlbar-eraser-btn');

  await triggerShortcut('tool-line');
  await expect(lineBtn).toHaveClass(ACTIVE_CLASS, { timeout: 5000 });
  await expect(freehandBtn).not.toHaveClass(ACTIVE_CLASS);

  await triggerShortcut('tool-eraser');
  await expect(eraserBtn).toHaveClass(ACTIVE_CLASS, { timeout: 5000 });
  await expect(lineBtn).not.toHaveClass(ACTIVE_CLASS);

  await triggerShortcut('tool-freehand');
  await expect(freehandBtn).toHaveClass(ACTIVE_CLASS, { timeout: 5000 });
  await expect(eraserBtn).not.toHaveClass(ACTIVE_CLASS);

  await mainWin.evaluate(() => window.openPenApi.setDrawingMode(false));
});

test('AC-2 a color key switches the stroke color shown on the swatch', async () => {
  const mainWin = await getMainWindow();
  await getOverlayWindow();
  await expandControlBar(mainWin);
  await mainWin.evaluate(() => window.openPenApi.setDrawingMode(true));

  const swatch = mainWin.getByTestId('controlbar-color-swatch');
  await triggerShortcut('color-red');
  await expect(swatch).toHaveCSS('background-color', 'rgb(248, 113, 113)', { timeout: 5000 });
  await triggerShortcut('color-green');
  await expect(swatch).toHaveCSS('background-color', 'rgb(52, 211, 153)', { timeout: 5000 });

  await mainWin.evaluate(() => window.openPenApi.setDrawingMode(false));
});

test('AC-4 AC-5 settings lists the rows, rebinds to a free key and refuses a duplicate', async () => {
  const mainWin = await getMainWindow();
  const winPromise = electronApp.waitForEvent('window', { timeout: 10000 });
  await mainWin.evaluate(() => window.openPenApi.openSettingsWindow());
  const settingsWin = await winPromise;
  await settingsWin.waitForLoadState('domcontentloaded');
  await settingsWin.getByTestId('tab-shortcuts').click();

  await expect(settingsWin.getByText('Drawing Hotkeys', { exact: true })).toBeVisible();
  for (const label of ['Freehand', 'Line', 'Shape', 'Highlighter', 'Stroke eraser', 'Red', 'White']) {
    await expect(settingsWin.getByText(label, { exact: true }).first()).toBeVisible();
  }

  const lineId = `${MODULE_ID}/tool-line`;
  const duplicate = await settingsWin.evaluate((id) => window.openPenApi.setShortcut(id, 'P'), lineId);
  expect(duplicate.ok).toBe(false);

  const builtin = await settingsWin.evaluate((id) => window.openPenApi.setShortcut(id, 'CommandOrControl+Z'), lineId);
  expect(builtin.ok).toBe(false);

  const free = await settingsWin.evaluate((id) => window.openPenApi.setShortcut(id, 'Q'), lineId);
  expect(free.ok).toBe(true);
  const stored = await settingsWin.evaluate(() => window.openPenApi.getModuleShortcuts());
  expect(stored[lineId]).toBe('Q');

  const reset = await settingsWin.evaluate((id) => window.openPenApi.resetShortcut(id), lineId);
  expect(reset.ok).toBe(true);

  await mainWin.evaluate(() => window.openPenApi.closeSettingsWindow());
});
