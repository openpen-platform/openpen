import { test, expect } from '@playwright/test';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';
import { IS_WAYLAND_SESSION } from '../session.js';

// The premise is a second process that cannot grab keys the first one holds.
// macOS lets several processes register the same global shortcut, and on native
// Wayland the single-instance lock stops the second instance from starting.
test.skip(
  process.platform === 'darwin' || IS_WAYLAND_SESSION,
  'a second instance only fails to register the keys on Windows and Linux X11',
);

// Two instances with separate userData dirs: the first one owns the global
// undo/redo accelerators, so the second one cannot register them.
let holderApp;
let electronApp;

attachElectronErrorDetection(() => electronApp);

test.beforeAll(async () => {
  holderApp = await launchElectronApp();
  electronApp = await launchElectronApp();
});

test.afterAll(async () => {
  await electronApp?.close();
  await holderApp?.close();
});

async function getMainWindow() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    for (const win of electronApp.windows()) {
      try {
        const url = win.url();
        if (url.includes('window=overlay') || url.includes('window=settings')) continue;
        await win.waitForLoadState('domcontentloaded', { timeout: 3000 });
        if (await win.evaluate(() => !!window.openPenApi?.getShortcutConflicts)) return win;
      } catch {
        // Window still starting up.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Main window not found within 20s');
}

test('settings shortcuts tab marks the built-in keys that could not be registered', async () => {
  const mainWin = await getMainWindow();
  const winPromise = electronApp.waitForEvent('window', { timeout: 10000 });
  await mainWin.evaluate(() => window.openPenApi.openSettingsWindow());
  const settingsWin = await winPromise;
  await settingsWin.waitForLoadState('domcontentloaded');
  await settingsWin.getByTestId('tab-shortcuts').click();

  const marked = settingsWin.getByLabel('This shortcut is already in use by another app');
  await expect(marked.first()).toBeVisible();
  expect(await marked.count()).toBeGreaterThanOrEqual(2);

  await mainWin.evaluate(() => window.openPenApi.closeSettingsWindow());
});

test('built-in undo/redo taken by another app are reported as conflicts and can be rebound', async () => {
  const mainWin = await getMainWindow();

  const conflicts = await mainWin.evaluate(() => window.openPenApi.getShortcutConflicts());
  expect(conflicts).toEqual(expect.arrayContaining(['undo', 'redo']));

  const result = await mainWin.evaluate(() =>
    window.openPenApi.setShortcut('undo', 'CommandOrControl+Alt+Shift+U'),
  );
  expect(result.ok).toBe(true);

  const after = await mainWin.evaluate(() => window.openPenApi.getShortcutConflicts());
  expect(after).not.toContain('undo');
  expect(after).toContain('redo');

  const registered = await electronApp.evaluate(({ globalShortcut }) =>
    globalShortcut.isRegistered('CommandOrControl+Alt+Shift+U'),
  );
  expect(registered).toBe(true);
});

test('resetting a rebound built-in whose default is held by another app shows the notice, and clears it once the key is free', async () => {
  const mainWin = await getMainWindow();
  const winPromise = electronApp.waitForEvent('window', { timeout: 10000 });
  await mainWin.evaluate(() => window.openPenApi.openSettingsWindow());
  const settingsWin = await winPromise;
  await settingsWin.waitForLoadState('domcontentloaded');
  await settingsWin.getByTestId('tab-shortcuts').click();

  // Undo was rebound above, so it is the only row that offers a reset.
  const reset = settingsWin.getByLabel('Reset to default');
  await expect(reset).toHaveCount(1);
  const notice = settingsWin.getByText('This shortcut is already in use by another app', { exact: true });
  await expect(notice).toHaveCount(0);

  await reset.click();
  await expect(notice).toBeVisible();
  await expect(reset).toHaveCount(1);

  // Free the default key, then reset again.
  await holderApp.close();
  holderApp = null;
  await reset.click();
  await expect(reset).toHaveCount(0);
  await expect(notice).toHaveCount(0);

  await mainWin.evaluate(() => window.openPenApi.closeSettingsWindow());
});
