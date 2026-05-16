/**
 * E2E test: the Settings button on the control bar is disabled while
 * drawing mode is active.
 *
 * Drawing mode covers the desktop and the Settings window unregisters
 * global shortcuts (so its own bind-shortcut UI isn't intercepted). If the
 * user could open Settings while drawing was active, the combination would
 * trap them: drawing covers the screen, shortcuts are gone, no way out.
 * The button is disabled in drawing mode to make that state unreachable.
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
    for (const w of electronApp.windows()) {
      try {
        const url = w.url();
        if (!url.includes('window=overlay') && !url.includes('window=settings')) {
          await w.waitForLoadState('domcontentloaded');
          await w.waitForSelector(
            '[data-testid="floatball-btn"], [data-testid="control-bar"]',
            { timeout: 20000 },
          );
          return w;
        }
      } catch { /* window may be closing */ }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Main window not found within timeout');
}

async function expandBar(win) {
  const bar = win.getByTestId('control-bar');
  if (!(await bar.isVisible().catch(() => false))) {
    await win.getByTestId('floatball-btn').click();
    await win.waitForTimeout(400);
  }
  await expect(bar).toBeVisible({ timeout: 5000 });
}

async function getWindowCount() {
  return electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().length
  );
}

async function setDrawingMode(win, enabled) {
  await win.evaluate((v) => window.openPenApi?.setDrawingMode(v), enabled);
  // Wait for the main→renderer broadcast to flip isDrawingMode in ControlBar.
  await win.waitForTimeout(200);
}

test.afterEach(async () => {
  const win = await getMainWindow();
  await setDrawingMode(win, false);
});

test('Settings button is enabled and opens the settings window when not in drawing mode', async () => {
  const win = await getMainWindow();
  await expandBar(win);

  const btn = win.getByTestId('controlbar-settings-btn');
  await expect(btn).toBeVisible({ timeout: 5000 });
  await expect(btn).not.toHaveClass(/cb-disabled/);
  await expect(btn).not.toHaveAttribute('aria-disabled', 'true');

  const countBefore = await getWindowCount();
  const winPromise = electronApp.waitForEvent('window', { timeout: 8000 });
  await btn.click();
  const settingsWin = await winPromise;
  await settingsWin.waitForSelector('[data-testid="settings-window"]', { timeout: 10000 });

  const countAfter = await getWindowCount();
  expect(countAfter).toBe(countBefore + 1);

  await win.evaluate(() => window.openPenApi?.closeSettingsWindow());
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if ((await getWindowCount()) <= countBefore) break;
    await win.waitForTimeout(100);
  }
});

test('Settings button is visually disabled while drawing mode is active', async () => {
  const win = await getMainWindow();
  await expandBar(win);
  await setDrawingMode(win, true);

  const btn = win.getByTestId('controlbar-settings-btn');
  await expect(btn).toHaveClass(/cb-disabled/);
  await expect(btn).toHaveAttribute('aria-disabled', 'true');
  // Tooltip remains present in disabled state so the user gets a hint.
  // Don't assert the literal text — that would couple the test to i18n strings.
  const tip = await btn.getAttribute('data-tip');
  expect(tip).toBeTruthy();
});

test('Clicking the Settings button while drawing mode is active does NOT open the settings window', async () => {
  const win = await getMainWindow();
  await expandBar(win);
  await setDrawingMode(win, true);

  const countBefore = await getWindowCount();
  // Bypass Playwright's auto "enabled" wait — aria-disabled blocks .click().
  // The test must prove that even a real click event is a no-op.
  await win.evaluate(() => {
    document.querySelector('[data-testid="controlbar-settings-btn"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  });
  await win.waitForTimeout(600);

  const countAfter = await getWindowCount();
  expect(countAfter).toBe(countBefore);

  const settingsUrl = await electronApp.evaluate(({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows();
    const cfg = wins.find((w) => w.webContents.getURL().includes('window=settings'));
    return cfg ? cfg.webContents.getURL() : null;
  });
  expect(settingsUrl).toBeNull();
});

test('Settings button re-enables after leaving drawing mode', async () => {
  const win = await getMainWindow();
  await expandBar(win);

  const btn = win.getByTestId('controlbar-settings-btn');
  const enabledTip = await btn.getAttribute('data-tip');

  await setDrawingMode(win, true);
  await expect(btn).toHaveClass(/cb-disabled/);
  const disabledTip = await btn.getAttribute('data-tip');
  // The tooltip must switch between the two states so the user sees why the
  // button is dimmed. Compare values rather than literal strings to stay
  // i18n-agnostic.
  expect(disabledTip).not.toBe(enabledTip);

  await setDrawingMode(win, false);
  await expect(btn).not.toHaveClass(/cb-disabled/);
  await expect(btn).not.toHaveAttribute('aria-disabled', 'true');
  expect(await btn.getAttribute('data-tip')).toBe(enabledTip);
});
