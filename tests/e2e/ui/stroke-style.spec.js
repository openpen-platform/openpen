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
        const ready = await win.evaluate(() => !!document.querySelector('[data-testid="floatball-btn"], [data-testid="control-bar"]'));
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
  await win.waitForSelector('[data-testid="floatball-btn"], [data-testid="control-bar"]', { timeout: 10000 });
  const bar = win.getByTestId('control-bar');
  const barVisible = await bar.isVisible().catch(() => false);
  if (!barVisible) {
    await win.getByTestId('floatball-btn').click();
    await win.waitForTimeout(500);
  }
}

/**
 * Returns a locator for the open color picker popup.
 * Uses data-testid and data-state="open" to avoid strict-mode violations when Reka UI
 * retains a closed popup in the DOM during leave animations.
 */
function colorPickerPopup(win) {
  return win.locator('[data-testid="controlbar-popover"][data-state="open"] [data-testid="cp-popup"]');
}

// ─────────────────────────────────────────────────────────────────────────────

test('expanded control bar shows the color button and stroke-width slider', async () => {
  const mainWin = await getMainWindow();
  await expandControlBar(mainWin);

  const colorBtn = mainWin.getByTestId('controlbar-color-btn');
  await expect(colorBtn).toBeVisible();

  // Stroke-width slider is visible in horizontal mode.
  const slider = mainWin.getByTestId('controlbar-stroke-slider').getByTestId('app-slider-root');
  await expect(slider).toBeVisible();
});

test('clicking the color button opens the color-picker popup', async () => {
  const mainWin = await getMainWindow();
  await expandControlBar(mainWin);

  const colorBtn = mainWin.getByTestId('controlbar-color-btn');
  await colorBtn.click();
  await mainWin.waitForTimeout(200);

  const picker = colorPickerPopup(mainWin);
  await expect(picker).toBeVisible();

  // Two tabs (solid / gradient).
  const tabs = mainWin.locator('[data-testid^="cp-tab-"]');
  await expect(tabs).toHaveCount(2);
});

test('color picker contains a 2D canvas, hue slider, 8 preset swatches, and a hex input', async () => {
  const mainWin = await getMainWindow();
  await expandControlBar(mainWin);

  const colorBtn = mainWin.getByTestId('controlbar-color-btn');
  const picker = colorPickerPopup(mainWin);
  if (!(await picker.isVisible().catch(() => false))) {
    await colorBtn.click();
    await mainWin.waitForTimeout(200);
  }

  // 2D SV canvas.
  await expect(mainWin.getByTestId('cp-sv-canvas').first()).toBeVisible();

  // Hue slider in solid mode.
  await expect(mainWin.getByTestId('cp-solid-hue')).toBeVisible();

  // 8 preset swatches.
  const swatches = mainWin.locator('[data-testid^="cp-preset-"]');
  await expect(swatches).toHaveCount(8);

  // Hex input.
  await expect(mainWin.getByTestId('cp-solid-hex-input').first()).toBeVisible();
});

test('typing a valid hex updates the color button swatch', async () => {
  const mainWin = await getMainWindow();
  await expandControlBar(mainWin);

  const colorBtn = mainWin.getByTestId('controlbar-color-btn');
  const picker = colorPickerPopup(mainWin);
  if (!(await picker.isVisible().catch(() => false))) {
    await colorBtn.click();
    await mainWin.waitForTimeout(200);
  }

  const hexInput = mainWin.getByTestId('cp-solid-hex-input').first();
  await hexInput.fill('ef4444');
  await mainWin.waitForTimeout(400);

  // Confirm the swatch background (inline style from Vue) reflects the new color.
  const swatchBg = await mainWin.getByTestId('controlbar-color-swatch').evaluate(
    (el) => el.style.background || window.getComputedStyle(el).backgroundColor
  );
  // #ef4444 = rgb(239, 68, 68)
  expect(swatchBg).toMatch(/ef4444|239/i);
});

test('clicking a preset swatch updates the color', async () => {
  const mainWin = await getMainWindow();
  await expandControlBar(mainWin);

  const colorBtn = mainWin.getByTestId('controlbar-color-btn');
  const picker = colorPickerPopup(mainWin);
  if (!(await picker.isVisible().catch(() => false))) {
    await colorBtn.click();
    await mainWin.waitForTimeout(200);
  }

  // Click the first swatch (#F87171).
  const firstSwatch = mainWin.locator('[data-testid^="cp-preset-"]').first();
  await firstSwatch.click();
  await mainWin.waitForTimeout(100);

  // Hex input should update.
  const hexVal = await mainWin.getByTestId('cp-solid-hex-input').first().inputValue();
  expect(hexVal.toUpperCase()).toBe('#F87171');
});

test('switching to the "Gradient" tab shows start and end color wells', async () => {
  const mainWin = await getMainWindow();
  await expandControlBar(mainWin);

  const colorBtn = mainWin.getByTestId('controlbar-color-btn');
  const picker = colorPickerPopup(mainWin);
  if (!(await picker.isVisible().catch(() => false))) {
    await colorBtn.click();
    await mainWin.waitForTimeout(200);
  }

  const gradTab = mainWin.getByTestId('cp-tab-gradient');
  await gradTab.click();
  await mainWin.waitForTimeout(100);

  // Start + end color wells.
  const wells = mainWin.locator('[data-testid^="cp-grad-well"]');
  await expect(wells).toHaveCount(2);
  await expect(mainWin.getByTestId('cp-grad-well-from')).toBeVisible();
  await expect(mainWin.getByTestId('cp-grad-well-to')).toBeVisible();

  // Gradient preview strip.
  await expect(mainWin.getByTestId('cp-grad-preview')).toBeVisible();
});

test('dragging the stroke-width slider updates lineWidth', async () => {
  const mainWin = await getMainWindow();
  await expandControlBar(mainWin);

  // AppSlider wraps Reka UI SliderRoot.
  const thumb = mainWin.getByTestId('controlbar-stroke-slider').getByTestId('app-slider-thumb');
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

  const colorBtn = mainWin.getByTestId('controlbar-color-btn');
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
  await expect(mainWin.locator('[data-testid="controlbar-popover"][data-state="open"]')).toHaveCount(0);
});
