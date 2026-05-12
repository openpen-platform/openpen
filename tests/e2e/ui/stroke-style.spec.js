/**
 * Stroke-style E2E tests — color, line width, and gradient.
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
        // Ignore windows still starting up.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Main window not found within 20s');
}

async function expandControlBar(win) {
  // Wait for interactive elements; otherwise clicks can fire before the page is ready.
  await win.waitForSelector('.float-ball, .control-bar', { timeout: 10000 });
  const bar = win.locator('.control-bar');
  const barVisible = await bar.isVisible().catch(() => false);
  if (!barVisible) {
    await win.locator('.float-ball').click();
    await win.waitForTimeout(500);
  }
}

/**
 * Returns a locator for the open color picker popup.
 * Uses data-state="open" to avoid strict-mode violations when Reka UI
 * retains a closed popup in the DOM during leave animations.
 */
function colorPickerPopup(win) {
  // ColorPicker.vue root element is .color-picker-popup, which sits inside
  // .openpen-popover-content when the AppPopover is open.
  return win.locator('.openpen-popover-content[data-state="open"] .color-picker-popup');
}

// ─────────────────────────────────────────────────────────────────────────────

test('expanded control bar shows the color button and stroke-width slider', async () => {
  const mainWin = await getMainWindow();
  await expandControlBar(mainWin);

  const colorBtn = mainWin.locator('.cb-color-btn');
  await expect(colorBtn).toBeVisible();

  // Stroke-width slider is visible in horizontal mode.
  // AppSlider uses Reka UI SliderRoot (.app-slider-root).
  const slider = mainWin.locator('.stroke-width-slider-wrap .app-slider-root');
  await expect(slider).toBeVisible();
});

test('clicking the color button opens the color-picker popup', async () => {
  const mainWin = await getMainWindow();
  await expandControlBar(mainWin);

  const colorBtn = mainWin.locator('.cb-color-btn');
  await colorBtn.click();
  await mainWin.waitForTimeout(200);

  const picker = colorPickerPopup(mainWin);
  await expect(picker).toBeVisible();

  // Two tabs (solid / gradient).
  const tabs = mainWin.locator('.cp-tab');
  await expect(tabs).toHaveCount(2);
});

test('color picker contains a 2D canvas, hue slider, 8 preset swatches, and a hex input', async () => {
  const mainWin = await getMainWindow();
  await expandControlBar(mainWin);

  const colorBtn = mainWin.locator('.cb-color-btn');
  const picker = colorPickerPopup(mainWin);
  if (!(await picker.isVisible().catch(() => false))) {
    await colorBtn.click();
    await mainWin.waitForTimeout(200);
  }

  // 2D SV canvas.
  await expect(mainWin.locator('.cp-sv-canvas')).toBeVisible();

  // Hue slider in solid mode.
  await expect(mainWin.locator('.cp-solid-hue')).toBeVisible();

  // 8 preset swatches.
  const swatches = mainWin.locator('.cp-color-preset');
  await expect(swatches).toHaveCount(8);

  // Hex input.
  await expect(mainWin.locator('.cp-solid-hex-input')).toBeVisible();
});

test('typing a valid hex updates the color button swatch', async () => {
  const mainWin = await getMainWindow();
  await expandControlBar(mainWin);

  // Only click the color button if the picker is not already open (clicking
  // while open would close it).
  const colorBtn = mainWin.locator('.cb-color-btn');
  const picker = colorPickerPopup(mainWin);
  if (!(await picker.isVisible().catch(() => false))) {
    await colorBtn.click();
    await mainWin.waitForTimeout(200);
  }

  // Fill() dispatches a real input event so Vue's event chain runs.
  const hexInput = mainWin.locator('.cp-solid-hex-input');
  await hexInput.fill('ef4444');
  await mainWin.waitForTimeout(400);

  // Confirm the swatch background (inline style from Vue) reflects the new color.
  const swatchBg = await mainWin.locator('.cb-color-swatch').evaluate(
    (el) => el.style.background || window.getComputedStyle(el).backgroundColor
  );
  // #ef4444 = rgb(239, 68, 68)
  expect(swatchBg).toMatch(/ef4444|239/i);
});

test('clicking a preset swatch updates the color', async () => {
  const mainWin = await getMainWindow();
  await expandControlBar(mainWin);

  const colorBtn = mainWin.locator('.cb-color-btn');
  const picker = colorPickerPopup(mainWin);
  if (!(await picker.isVisible().catch(() => false))) {
    await colorBtn.click();
    await mainWin.waitForTimeout(200);
  }

  // Click the first swatch (#F87171).
  const firstSwatch = mainWin.locator('.cp-color-preset').first();
  await firstSwatch.click();
  await mainWin.waitForTimeout(100);

  // Hex input should update.
  const hexVal = await mainWin.locator('.cp-solid-hex-input').inputValue();
  expect(hexVal.toUpperCase()).toBe('#F87171');
});

test('switching to the "Gradient" tab shows start and end color wells', async () => {
  const mainWin = await getMainWindow();
  await expandControlBar(mainWin);

  const colorBtn = mainWin.locator('.cb-color-btn');
  const picker = colorPickerPopup(mainWin);
  if (!(await picker.isVisible().catch(() => false))) {
    await colorBtn.click();
    await mainWin.waitForTimeout(200);
  }

  const gradTab = mainWin.locator('.cp-tab').nth(1);
  await gradTab.click();
  await mainWin.waitForTimeout(100);

  // Start + end color wells.
  const wells = mainWin.locator('.cp-grad-well');
  await expect(wells).toHaveCount(2);

  // Gradient preview strip.
  await expect(mainWin.locator('.cp-grad-preview')).toBeVisible();
});

test('dragging the stroke-width slider updates lineWidth', async () => {
  const mainWin = await getMainWindow();
  await expandControlBar(mainWin);

  // AppSlider wraps Reka UI SliderRoot (.app-slider-root).
  // The thumb element handles keyboard input (ArrowRight increments by step=1).
  // Slider: min=1, max=20, step=1. Press Home to reset to min=1, then
  // ArrowRight 11× to reach 12 (independent of current state).
  const thumb = mainWin.locator('.stroke-width-slider-wrap .app-slider-thumb');
  await expect(thumb).toBeVisible();
  await thumb.focus();
  await mainWin.keyboard.press('Home');
  for (let i = 0; i < 11; i++) {
    await mainWin.keyboard.press('ArrowRight');
  }
  await mainWin.waitForTimeout(100);

  // Reka UI sets aria-valuenow on the thumb after update.
  const valueNow = await thumb.getAttribute('aria-valuenow');
  expect(Number(valueNow)).toBe(12);
});

test('clicking the color button again closes the picker', async () => {
  const mainWin = await getMainWindow();
  await expandControlBar(mainWin);

  const colorBtn = mainWin.locator('.cb-color-btn');
  const picker = colorPickerPopup(mainWin);

  // Open.
  if (!(await picker.isVisible().catch(() => false))) {
    await colorBtn.click();
    await mainWin.waitForTimeout(200);
  }
  await expect(picker).toBeVisible();

  // Close via a second click.
  await colorBtn.click();
  await mainWin.waitForTimeout(300);
  // After closing, no open picker should be visible.
  await expect(mainWin.locator('.openpen-popover-content[data-state="open"]')).toHaveCount(0);
});
