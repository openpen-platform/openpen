/**
 * Shared colour swatch picker E2E — control-bar colour popup.
 *
 * Covers the radiogroup semantics, the single tab stop with arrow-key
 * navigation, and the selected-state double ring on the real control bar.
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
    for (const win of electronApp.windows()) {
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

async function openColorPopup(win) {
  await win.waitForSelector('[data-testid="floatball-btn"], [data-testid="control-bar"]', { timeout: 10000 });
  if (!(await win.getByTestId('control-bar').isVisible().catch(() => false))) {
    await win.getByTestId('floatball-btn').click();
    await win.waitForTimeout(500);
  }
  const popup = win.locator('[data-testid="controlbar-popover"][data-state="open"] [data-testid="cp-popup"]');
  // The colour button toggles the popup, so only click it when the popup is closed.
  if (!(await popup.isVisible().catch(() => false))) {
    await win.getByTestId('controlbar-color-btn').click();
  }
  await expect(popup).toBeVisible();
  return popup;
}

test('colour presets form a radiogroup of 8 radios with exactly one tab stop', async () => {
  const win = await getMainWindow();
  const popup = await openColorPopup(win);

  const group = popup.getByTestId('app-swatch-picker').first();
  await expect(group).toHaveAttribute('role', 'radiogroup');

  const swatches = popup.locator('[data-testid^="cp-preset-"]');
  await expect(swatches).toHaveCount(8);
  await expect(swatches.first()).toHaveAttribute('role', 'radio');

  // Roving focus: the radiogroup itself is the one tab stop, and Tab hands focus to the checked swatch.
  const tabStops = await group.evaluate((root) => [root, ...root.querySelectorAll('[role="radio"]')].filter((e) => e.tabIndex >= 0).length);
  expect(tabStops).toBe(1);
});

test('clicking a swatch checks it and updates the hex field', async () => {
  const win = await getMainWindow();
  const popup = await openColorPopup(win);

  const target = popup.getByTestId('cp-preset-60A5FA');
  await target.click();
  await expect(target).toHaveAttribute('aria-checked', 'true');
  await expect(popup.getByTestId('cp-solid-hex-input').first()).toHaveValue('#60A5FA');
  await expect(popup.locator('[data-testid^="cp-preset-"][aria-checked="true"]')).toHaveCount(1);
});

test('arrow keys move between swatches and Tab leaves the group', async () => {
  const win = await getMainWindow();
  const popup = await openColorPopup(win);

  await popup.getByTestId('cp-preset-60A5FA').click();
  // Hold the key like a person does: the group only selects on arrow focus while the key is still down.
  await win.keyboard.press('ArrowRight', { delay: 80 });
  const focusedId = await win.evaluate(() => document.activeElement?.getAttribute('data-testid'));
  expect(focusedId).toBe('cp-preset-818CF8');
  // Like AppSegmented and a native radio group, the arrow key selects the swatch it lands on.
  await expect(popup.getByTestId('cp-preset-818CF8')).toHaveAttribute('aria-checked', 'true');

  await win.keyboard.press('Tab');
  const afterTab = await win.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
  expect(afterTab.startsWith('cp-preset-')).toBe(false);
});

test('ArrowDown / ArrowUp move to the next / previous swatch and select it', async () => {
  const win = await getMainWindow();
  const popup = await openColorPopup(win);

  await popup.getByTestId('cp-preset-60A5FA').click();
  await win.keyboard.press('ArrowDown', { delay: 80 });
  await expect(popup.getByTestId('cp-preset-818CF8')).toHaveAttribute('aria-checked', 'true');
  await win.keyboard.press('ArrowUp', { delay: 80 });
  await expect(popup.getByTestId('cp-preset-60A5FA')).toHaveAttribute('aria-checked', 'true');
  await win.keyboard.press('ArrowUp', { delay: 80 });
  await expect(popup.getByTestId('cp-preset-34D399')).toHaveAttribute('aria-checked', 'true');
});

test('the selected swatch draws a two-layer inset ring', async () => {
  const win = await getMainWindow();
  const popup = await openColorPopup(win);

  const target = popup.getByTestId('cp-preset-F87171');
  await target.click();
  const shadow = await target.evaluate((el) => getComputedStyle(el).boxShadow);
  const insetLayers = shadow.match(/inset/g) ?? [];
  expect(insetLayers.length).toBeGreaterThanOrEqual(2);
});
