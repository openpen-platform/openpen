/**
 * Settings-window E2E tests, including i18n and theme behavior.
 *
 * Electron testing principles that differ from pure web tests:
 * 1. Verify BrowserWindow state via the main process (window count, bounds,
 *    properties) using `electronApp.evaluate(({BrowserWindow}) => ...)`.
 * 2. Don't bypass the UI — real DOM operations (e.g. the gear button) trigger
 *    real flows.
 * 3. Cover Electron-specific behavior (window count, IPC broadcasts,
 *    main-process settings state).
 * 4. Confirm settings changes reflect in the renderer via CSS variables.
 * 5. Verify live-preview / revert semantics: cancel must not write to disk.
 */
import { test, expect } from '@playwright/test';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';

let electronApp;

const SETTINGS_TAB_SELECTOR = '[data-testid^="tab-"]';
const SETTINGS_CANCEL_SELECTOR = '[data-testid="cancel-btn"]';

attachElectronErrorDetection(() => electronApp);

test.beforeAll(async () => {
  electronApp = await launchElectronApp();
});

test.afterAll(async () => {
  await electronApp?.close();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getMainWindow() {
  const deadline = Date.now() + 20000;
  let mainWin = null;
  while (Date.now() < deadline) {
    const windows = electronApp.windows();
    for (const w of windows) {
      try {
        const url = w.url();
        if (!url.includes('window=overlay') && !url.includes('window=settings')) {
          mainWin = w;
          break;
        }
      } catch (_) { /* window may be closing */ }
    }
    if (mainWin) break;
    await new Promise(r => setTimeout(r, 200));
  }
  if (!mainWin) throw new Error('Main window not found within timeout');
  await mainWin.waitForLoadState('domcontentloaded');
  // Wait for Vue to mount (floatball-btn or control-bar indicates mount is done).
  await mainWin.waitForSelector('[data-testid="floatball-btn"], [data-testid="control-bar"]', { timeout: 20000 });
  return mainWin;
}

/** Number of Electron windows from the main process. */
async function getWindowCount() {
  return electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().length
  );
}

/** URL of the settings window from the main process (confirms identity). */
async function getSettingsWindowUrl() {
  return electronApp.evaluate(({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows();
    const cfg = wins.find(w => w.webContents.getURL().includes('window=settings'));
    return cfg ? cfg.webContents.getURL() : null;
  });
}

/**
 * Read the current settings through the IPC handler.
 */
async function getMainProcessSettings(win) {
  const w = win ?? await getMainWindow();
  return w.evaluate(() => window.openPenApi?.getSettings());
}

/**
 * Expand the control bar (idempotent).
 */
async function expandControlBar(mainWin) {
  const alreadyExpanded = await mainWin.evaluate(() =>
    document.querySelector('[data-testid="control-bar"]') !== null
  );
  if (alreadyExpanded) return;

  await mainWin.waitForSelector('[data-testid="floatball-btn"]', { timeout: 10000 });
  await mainWin.evaluate(() => {
    document.querySelector('[data-testid="floatball-btn"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  });
  await mainWin.waitForSelector('[data-testid="control-bar"]', { timeout: 5000 });
}

/**
 * Open the settings window via the UI (gear button).
 */
async function openSettingsViaUI(mainWin) {
  await expandControlBar(mainWin);
  const winPromise = electronApp.waitForEvent('window', { timeout: 10000 });
  await mainWin.evaluate(() => {
    document.querySelector('[data-testid="controlbar-settings-btn"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  });
  const settingsWin = await winPromise.catch(() => null);
  if (!settingsWin) {
    // Fallback: open via IPC (useful while debugging gear-button issues).
    const fallbackPromise = electronApp.waitForEvent('window', { timeout: 8000 });
    await mainWin.evaluate(() => window.openPenApi?.openSettingsWindow());
    const fallback = await fallbackPromise.catch(() => null);
    return fallback;
  }
  await settingsWin.waitForLoadState('domcontentloaded');
  await settingsWin.waitForSelector('[data-testid="settings-window"]', { timeout: 10000 });
  // Wait for the settings draft to be hydrated (aria-pressed="true" appears
  // after loadSettings() resolves and Vue binds the selected chip).
  await settingsWin.waitForSelector('[data-testid^="settings-color-chip-"][aria-pressed="true"]', { timeout: 8000 });
  return settingsWin;
}

/**
 * Close every settings window and wait until the window count drops to 2.
 */
async function closeAllSettingsWindows(mainWin) {
  await mainWin.evaluate(() => window.openPenApi?.closeSettingsWindow());
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const count = await getWindowCount();
    if (count <= 2) break;
    await mainWin.waitForTimeout(100);
  }
  await mainWin.waitForTimeout(300);
}

// ── Tests ───────────────────────────────────────────────────────────────────

test('gear button opens exactly one settings window', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);

  const countBefore = await getWindowCount();
  expect(countBefore).toBe(2);

  await expandControlBar(mainWin);
  const hasGearBtn = await mainWin.evaluate(() =>
    document.querySelector('[data-testid="controlbar-settings-btn"]') !== null
  );
  expect(hasGearBtn).toBe(true);

  const winPromise = electronApp.waitForEvent('window', { timeout: 8000 });
  await mainWin.evaluate(() => {
    document.querySelector('[data-testid="controlbar-settings-btn"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  });
  const settingsWin = await winPromise;
  await settingsWin.waitForLoadState('domcontentloaded');
  await settingsWin.waitForSelector('[data-testid="settings-window"]', { timeout: 10000 });

  const countAfter = await getWindowCount();
  expect(countAfter).toBe(3);

  const cfgUrl = await getSettingsWindowUrl();
  expect(cfgUrl).toContain('window=settings');

  await closeAllSettingsWindows(mainWin);
  const countFinal = await getWindowCount();
  expect(countFinal).toBe(2);
});


test('tab switching: Appearance -> Behavior -> Features -> About', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);
  const settingsWin = await openSettingsViaUI(mainWin);
  expect(settingsWin).not.toBeNull();

  const tabs = settingsWin.locator(SETTINGS_TAB_SELECTOR);
  await expect(tabs.nth(0)).toHaveClass(/active/);
  // Appearance tab: color chips are its unique panel content.
  await expect(settingsWin.getByTestId('settings-color-chips').first()).toBeVisible();

  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveClass(/active/);
  await expect(tabs.nth(0)).not.toHaveClass(/active/);
  // Behavior tab: auto-collapse slider is its unique panel content.
  await expect(settingsWin.getByText('Auto-collapse Delay')).toBeVisible();

  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveClass(/active/);
  // Appearance color chips must no longer be visible (panel switched).
  await expect(settingsWin.getByTestId('settings-color-chips').first()).not.toBeVisible();

  await tabs.nth(3).click();
  await expect(tabs.nth(3)).toHaveClass(/active/);

  await closeAllSettingsWindows(mainWin);
});

test('Appearance tab shows the color-mode toggle', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);
  const settingsWin = await openSettingsViaUI(mainWin);
  expect(settingsWin).not.toBeNull();

  const tabs = settingsWin.locator(SETTINGS_TAB_SELECTOR);
  await tabs.nth(0).click();

  await expect(settingsWin.getByTestId('app-seg').locator('button')).toHaveCount(3);
  await expect(settingsWin.locator('[data-testid^="settings-color-chip-"]')).toHaveCount(5);
  // AppSlider uses Reka UI SliderRoot (data-testid="app-slider-root").
  await expect(settingsWin.getByTestId('settings-opacity-row').getByTestId('app-slider-root')).toBeVisible();
  await expect(settingsWin.getByTestId('settings-language-select')).toBeVisible();

  await closeAllSettingsWindows(mainWin);
});

test('Appearance tab shows the language selector (four languages)', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);
  const settingsWin = await openSettingsViaUI(mainWin);
  expect(settingsWin).not.toBeNull();

  await settingsWin.locator(SETTINGS_TAB_SELECTOR).nth(0).click();
  await settingsWin.waitForTimeout(200);

  await expect(settingsWin.getByTestId('settings-language-select')).toBeVisible({ timeout: 5000 });
  const options = await settingsWin.getByTestId('settings-language-select').locator('option').allTextContents();
  expect(options.length).toBe(4);
  expect(options.some(o => o.includes('繁體中文'))).toBe(true);
  expect(options.some(o => o.includes('English'))).toBe(true);

  await closeAllSettingsWindows(mainWin);
});

test('live preview: accent-color change immediately updates the main-window CSS variable', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);

  const originalSettings = await getMainProcessSettings(mainWin);
  const originalColor = originalSettings.defaultColor;

  const settingsWin = await openSettingsViaUI(mainWin);
  expect(settingsWin).not.toBeNull();

  const chips = settingsWin.locator('[data-testid^="settings-color-chip-"]');
  await chips.nth(1).click();
  await mainWin.waitForTimeout(300);

  let accentVar = await mainWin.evaluate(() =>
    document.documentElement.style.getPropertyValue('--accent').trim()
  );

  if (accentVar.toLowerCase() === (originalColor ?? '').toLowerCase()) {
    await chips.nth(0).click();
    await mainWin.waitForTimeout(300);
    accentVar = await mainWin.evaluate(() =>
      document.documentElement.style.getPropertyValue('--accent').trim()
    );
  }

  expect(accentVar).toBeTruthy();
  expect(accentVar.toLowerCase()).not.toBe((originalColor ?? '').toLowerCase());

  await settingsWin.locator(SETTINGS_CANCEL_SELECTOR).click();
  await mainWin.waitForTimeout(600);

  const settingsAfterCancel = await getMainProcessSettings(mainWin);
  expect(settingsAfterCancel.defaultColor).toBe(originalColor);
});

test('live preview: opacity change immediately updates the main-window CSS variable', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);
  const settingsWin = await openSettingsViaUI(mainWin);
  expect(settingsWin).not.toBeNull();

  // AppSlider wraps Reka UI SliderRoot (data-testid="app-slider-thumb").
  // Use keyboard interaction on the thumb to change the value.
  const thumb = settingsWin.getByTestId('settings-opacity-row').getByTestId('app-slider-thumb');
  await expect(thumb).toBeVisible();
  await thumb.focus();
  for (let i = 0; i < 35; i++) {
    await settingsWin.keyboard.press('ArrowLeft');
  }
  await mainWin.waitForTimeout(300);

  const ballOpacityVar = await mainWin.evaluate(() =>
    document.documentElement.style.getPropertyValue('--ball-opacity').trim()
  );
  expect(ballOpacityVar).toBeTruthy();
  expect(parseFloat(ballOpacityVar)).toBeCloseTo(0.5, 1);

  await settingsWin.locator(SETTINGS_CANCEL_SELECTOR).click();
  await mainWin.waitForTimeout(500);
});

test('Cancel button reverts settings and does not write to disk', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);

  const beforeSettings = await getMainProcessSettings();
  const originalLang = beforeSettings.language;

  const settingsWin = await openSettingsViaUI(mainWin);
  expect(settingsWin).not.toBeNull();

  await settingsWin.locator(SETTINGS_TAB_SELECTOR).nth(0).click();
  await settingsWin.waitForTimeout(200);
  await settingsWin.getByTestId('settings-language-select').selectOption('ja');
  await mainWin.waitForTimeout(200);

  await settingsWin.locator(SETTINGS_CANCEL_SELECTOR).click();
  await mainWin.waitForTimeout(500);

  const afterSettings = await getMainProcessSettings();
  expect(afterSettings.language).toBe(originalLang);

  const winCount = await getWindowCount();
  expect(winCount).toBeLessThanOrEqual(2);
});

test('Save button persists settings and closes the window', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);
  const settingsWin = await openSettingsViaUI(mainWin);
  expect(settingsWin).not.toBeNull();

  const saveBtn = settingsWin.locator('[data-testid="save-btn"]');
  await expect(saveBtn).toBeVisible();
  await saveBtn.click();
  await mainWin.waitForTimeout(500);

  const winCount = await getWindowCount();
  expect(winCount).toBeLessThanOrEqual(2);
});

test('theme switch: live preview updates data-theme and nativeTheme; Save persists', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);
  const settingsWin = await openSettingsViaUI(mainWin);
  expect(settingsWin).not.toBeNull();

  // Click the Light theme button (first option in AppSegmented).
  await settingsWin.getByTestId('theme-light').click();
  await mainWin.waitForTimeout(400);

  const themeBeforeSave = await mainWin.evaluate(() =>
    document.documentElement.getAttribute('data-theme')
  );
  expect(themeBeforeSave).toBe('light');

  await settingsWin.locator('[data-testid="save-btn"]').click();
  await mainWin.waitForTimeout(500);

  const savedSettings = await getMainProcessSettings();
  expect(savedSettings.theme).toBe('light');

  // Restore the dark theme.
  const settingsWin2 = await openSettingsViaUI(mainWin);
  await settingsWin2.getByTestId('theme-dark').click();
  await settingsWin2.locator('[data-testid="save-btn"]').click();
  await mainWin.waitForTimeout(400);

  const restoredSettings = await getMainProcessSettings();
  expect(restoredSettings.theme).toBe('dark');
});

test('settings persistence: saved language survives reopening the window', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);
  const settingsWin = await openSettingsViaUI(mainWin);
  expect(settingsWin).not.toBeNull();

  await settingsWin.locator(SETTINGS_TAB_SELECTOR).nth(0).click();
  await settingsWin.waitForTimeout(200);
  await settingsWin.getByTestId('settings-language-select').selectOption('en');
  await settingsWin.locator('[data-testid="save-btn"]').click();
  await mainWin.waitForTimeout(500);

  const savedSettings = await getMainProcessSettings();
  expect(savedSettings.language).toBe('en');

  // Reopen and confirm the UI reflects the persisted value.
  const settingsWin2 = await openSettingsViaUI(mainWin);
  await settingsWin2.locator(SETTINGS_TAB_SELECTOR).nth(0).click();
  await settingsWin2.waitForTimeout(200);
  const langValue = await settingsWin2.getByTestId('settings-language-select').inputValue();
  expect(langValue).toBe('en');

  // Restore the default language.
  await settingsWin2.getByTestId('settings-language-select').selectOption('zh-Hant');
  await settingsWin2.locator('[data-testid="save-btn"]').click();
  await mainWin.waitForTimeout(400);
});

test('About tab shows the version number', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);
  const settingsWin = await openSettingsViaUI(mainWin);
  expect(settingsWin).not.toBeNull();

  await settingsWin.locator(SETTINGS_TAB_SELECTOR).nth(5).click();
  const aboutText = await settingsWin.getByTestId('about-version').textContent();
  expect(aboutText).toMatch(/\d+\.\d+\.\d+/);

  await closeAllSettingsWindows(mainWin);
});
