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

const SETTINGS_TAB_SELECTOR = '.stg-tab, .cw-tab';
const SETTINGS_CANCEL_SELECTOR = '.stg-btn-cancel, .cw-btn-cancel';

attachElectronErrorDetection(() => electronApp);

test.beforeAll(async () => {
  electronApp = await launchElectronApp();
});

test.afterAll(async () => {
  await electronApp?.close();
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getMainWindow() {
  // Wait for both windows (main + overlay) to exist, then pick the one whose
  // URL has no `?window=` param. firstWindow() may return the transparent
  // overlay, so explicit filtering is required.
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
  // Wait for Vue to mount (float-ball or control-bar indicates mount is done).
  await mainWin.waitForSelector('.float-ball, .control-bar', { timeout: 20000 });
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
 * Read the current settings through the IPC handler. More reliable than a
 * dynamic import and exercises the same code path the app uses.
 * @param {import('@playwright/test').Page} [win]
 */
async function getMainProcessSettings(win) {
  const w = win ?? await getMainWindow();
  return w.evaluate(() => window.openPenApi?.getSettings());
}

/**
 * Expand the control bar (idempotent).
 * Tests may inherit an already-expanded state from the previous test.
 */
async function expandControlBar(mainWin) {
  const alreadyExpanded = await mainWin.evaluate(() =>
    document.querySelector('.control-bar') !== null
  );
  if (alreadyExpanded) return;

  await mainWin.waitForSelector('.float-ball', { timeout: 10000 });
  await mainWin.evaluate(() => {
    document.querySelector('.float-ball')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  });
  await mainWin.waitForSelector('.control-bar', { timeout: 5000 });
}

/**
 * Open the settings window via the UI (gear button), mirroring a real user
 * flow rather than calling the IPC directly.
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
  // Wait for the settings draft to be hydrated: the selected color chip appears only after
  // loadSettings() populates draft.defaultColor, ensuring isInitialSettingsLoaded is true.
  await settingsWin.waitForSelector('.color-chip.selected', { timeout: 8000 });
  return settingsWin;
}

/**
 * Close every settings window and wait until the window count drops to 2.
 * Uses BrowserWindow.getAllWindows() from the main process for an accurate count.
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

  // Initial window count from the main process should be 2 (main + overlay).
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

  // Exactly one new window (Bug 1 regression check).
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
  await expect(settingsWin.locator('.color-chip').first()).toBeVisible();

  await tabs.nth(1).click();
  await expect(tabs.nth(1)).toHaveClass(/active/);
  await expect(tabs.nth(0)).not.toHaveClass(/active/);
  // Behavior tab: auto-collapse slider is its unique panel content.
  await expect(settingsWin.getByText('Auto-collapse Delay')).toBeVisible();

  await tabs.nth(2).click();
  await expect(tabs.nth(2)).toHaveClass(/active/);
  // Appearance color chips must no longer be visible (panel switched).
  await expect(settingsWin.locator('.color-chip').first()).not.toBeVisible();

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

  await expect(settingsWin.locator('.theme-seg-btn, .app-seg-btn')).toHaveCount(3);
  await expect(settingsWin.locator('.color-chip')).toHaveCount(5);
  // AppSlider uses Reka UI SliderRoot (.app-slider-root).
  await expect(settingsWin.locator('.opacity-row .app-slider-root')).toBeVisible();
  await expect(settingsWin.locator('.cw-select').first()).toBeVisible();

  await closeAllSettingsWindows(mainWin);
});

test('Appearance tab shows the language selector (four languages)', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);
  const settingsWin = await openSettingsViaUI(mainWin);
  expect(settingsWin).not.toBeNull();

  await settingsWin.locator(SETTINGS_TAB_SELECTOR).nth(0).click();
  await settingsWin.waitForTimeout(200);

  await expect(settingsWin.locator('.cw-select').first()).toBeVisible({ timeout: 5000 });
  const options = await settingsWin.locator('.cw-select option').allTextContents();
  expect(options.length).toBe(4);
  expect(options.some(o => o.includes('繁體中文'))).toBe(true);
  expect(options.some(o => o.includes('English'))).toBe(true);

  await closeAllSettingsWindows(mainWin);
});

test('live preview: accent-color change immediately updates the main-window CSS variable', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);

  // Capture the on-disk original before opening settings.
  const originalSettings = await getMainProcessSettings(mainWin);
  const originalColor = originalSettings.defaultColor;

  const settingsWin = await openSettingsViaUI(mainWin);
  expect(settingsWin).not.toBeNull();

  const chips = settingsWin.locator('.color-chip');
  await chips.nth(1).click();
  await mainWin.waitForTimeout(300);

  // The main window's CSS variable should update immediately (no save required).
  let accentVar = await mainWin.evaluate(() =>
    document.documentElement.style.getPropertyValue('--accent').trim()
  );

  // If the first chip happens to match the original color, try another to avoid a false negative.
  if (accentVar.toLowerCase() === (originalColor ?? '').toLowerCase()) {
    await chips.nth(0).click();
    await mainWin.waitForTimeout(300);
    accentVar = await mainWin.evaluate(() =>
      document.documentElement.style.getPropertyValue('--accent').trim()
    );
  }

  expect(accentVar).toBeTruthy();
  expect(accentVar.toLowerCase()).not.toBe((originalColor ?? '').toLowerCase());

  // Cancel -> revertSettings restores the on-disk value.
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

  // AppSlider wraps Reka UI SliderRoot (.app-slider-root).
  // Use keyboard interaction on the thumb to change the value.
  // Opacity slider: min=20, max=100, step=1. Default = 85 (0.85 * 100).
  // Press ArrowLeft 35× to reach 50.
  const thumb = settingsWin.locator('.opacity-row .app-slider-thumb');
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

  // Cancel reverts.
  await settingsWin.locator(SETTINGS_CANCEL_SELECTOR).click();
  await mainWin.waitForTimeout(500);
});

test('Cancel button reverts settings and does not write to disk', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);

  // Record the language before cancel.
  const beforeSettings = await getMainProcessSettings();
  const originalLang = beforeSettings.language;

  const settingsWin = await openSettingsViaUI(mainWin);
  expect(settingsWin).not.toBeNull();

  // Preview a switch to Japanese.
  await settingsWin.locator(SETTINGS_TAB_SELECTOR).nth(0).click();
  await settingsWin.waitForTimeout(200);
  await settingsWin.locator('.cw-select').selectOption('ja');
  await mainWin.waitForTimeout(200);

  await settingsWin.locator(SETTINGS_CANCEL_SELECTOR).click();
  await mainWin.waitForTimeout(500);

  // revertSettings re-reads from disk; language should be the original.
  const afterSettings = await getMainProcessSettings();
  expect(afterSettings.language).toBe(originalLang);

  // Settings window should be closed.
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

  // Click the Light theme button.
  await settingsWin.locator('.theme-seg-btn, .app-seg-btn').nth(0).click();
  await mainWin.waitForTimeout(400);

  // Main window's data-theme should update immediately.
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
  await settingsWin2.locator('.theme-seg-btn, .app-seg-btn').nth(1).click();
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
  await settingsWin.locator('.cw-select').selectOption('en');
  await settingsWin.locator('[data-testid="save-btn"]').click();
  await mainWin.waitForTimeout(500);

  const savedSettings = await getMainProcessSettings();
  expect(savedSettings.language).toBe('en');

  // Reopen and confirm the UI reflects the persisted value.
  const settingsWin2 = await openSettingsViaUI(mainWin);
  await settingsWin2.locator(SETTINGS_TAB_SELECTOR).nth(0).click();
  await settingsWin2.waitForTimeout(200);
  const langValue = await settingsWin2.locator('.cw-select').inputValue();
  expect(langValue).toBe('en');

  // Restore the default language.
  await settingsWin2.locator('.cw-select').selectOption('zh-Hant');
  await settingsWin2.locator('[data-testid="save-btn"]').click();
  await mainWin.waitForTimeout(400);
});

test('About tab shows the version number', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);
  const settingsWin = await openSettingsViaUI(mainWin);
  expect(settingsWin).not.toBeNull();

  await settingsWin.locator(SETTINGS_TAB_SELECTOR).nth(5).click();
  const aboutText = await settingsWin.locator('.about-val').first().textContent();
  expect(aboutText).toMatch(/\d+\.\d+\.\d+/);

  await closeAllSettingsWindows(mainWin);
});
