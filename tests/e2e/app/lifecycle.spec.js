import { test, expect } from '@playwright/test';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';
import { IS_WAYLAND_SESSION } from '../session.js';

let electronApp;

attachElectronErrorDetection(() => electronApp);

test.beforeAll(async () => {
  if (!electronApp) {
    electronApp = await launchElectronApp();
  }
});

test.afterAll(async () => {
  await electronApp?.close();
});

test('main process starts and main window is visible', async () => {
  const mainWindow = await electronApp.firstWindow();
  await mainWindow.waitForLoadState('domcontentloaded');
  expect(await mainWindow.locator('body').isVisible()).toBe(true);
});

test('main window does not carry the settings query param', async () => {
  const mainWindow = await electronApp.firstWindow();
  const url = mainWindow.url();
  expect(url).not.toContain('window=settings');
});

test('IPC channel constants wire up — preload bridge + main handlers (window namespace)', async () => {
  // Contract test, complementary to the visibility/lifecycle test below.
  // If preload.js drifts from ipc-channels.js (function renamed/removed), most
  // call sites swallow the failure via `window.openPenApi?.foo()` optional
  // chaining and surface only as a downstream timeout. This test fails fast
  // with a clear "expected 'function', got 'undefined'" instead.
  const mainWindow = await electronApp.firstWindow();
  await mainWindow.waitForLoadState('domcontentloaded');

  const bridge = await mainWindow.evaluate(() => ({
    hasOpenPenApi: !!window.openPenApi,
    openSettings: typeof window.openPenApi?.openSettingsWindow,
    closeSettings: typeof window.openPenApi?.closeSettingsWindow,
    getPosition: typeof window.openPenApi?.getWindowPosition,
    setPosition: typeof window.openPenApi?.setWindowPosition,
    getDisplayInfo: typeof window.openPenApi?.getDisplayInfo,
  }));
  expect(bridge.hasOpenPenApi).toBe(true);
  expect(bridge.openSettings).toBe('function');
  expect(bridge.closeSettings).toBe('function');
  expect(bridge.getPosition).toBe('function');
  expect(bridge.setPosition).toBe('function');
  expect(bridge.getDisplayInfo).toBe('function');

  // Round-trip an invoke channel to prove the main-side handler for the
  // `window:` namespace is registered — not just exposed at preload.
  const pos = await mainWindow.evaluate(() => window.openPenApi.getWindowPosition());
  expect(pos).toMatchObject({ x: expect.any(Number), y: expect.any(Number) });
});

test('opening settings hides the main window; closing settings restores it', async () => {
  // Standard model hides the main window via setOpacity(0); on Wayland the bar is
  // hidden through reconcileLinuxWindows() (bar.hide()), not opacity, so the
  // opacity assertion below is standard-only. The rest of this file is agnostic.
  test.skip(IS_WAYLAND_SESSION, 'opacity-dim hide is standard-model only');
  const mainWindow = await electronApp.firstWindow();
  await mainWindow.waitForLoadState('domcontentloaded');

  const windowsBefore = electronApp.windows().length;

  await mainWindow.evaluate(() => {
    window.openPenApi?.openSettingsWindow();
  });

  const settingsWindow = await electronApp.waitForEvent('window');
  await settingsWindow.waitForLoadState('domcontentloaded');
  expect(electronApp.windows().length).toBe(windowsBefore + 1);

  // While settings is open the main BrowserWindow must not be visually present.
  // Implementation uses setOpacity(0) to hide it without triggering Windows DWM
  // surface-allocation flicker (hide()/show() would cause a one-frame flash on
  // transparent always-on-top windows). Poll up to 3s because the opacity change
  // is an async IPC side-effect that may complete slightly after the settings
  // window's domcontentloaded fires.
  let mainHidden = false;
  for (let i = 0; i < 15; i++) {
    mainHidden = await electronApp.evaluate(({ BrowserWindow }) => {
      const wins = BrowserWindow.getAllWindows();
      const main = wins.find(w => {
        const url = w.webContents.getURL();
        return !url.includes('window=settings') && !url.includes('window=overlay');
      });
      if (!main) return null;
      return main.getOpacity() === 0;
    });
    if (mainHidden) break;
    await mainWindow.waitForTimeout(200);
  }
  expect(mainHidden).toBe(true);

  await settingsWindow.evaluate(() => {
    window.openPenApi?.closeSettingsWindow();
  });
  await settingsWindow.waitForEvent('close');

  await mainWindow.waitForTimeout(300);

  const mainRestored = await electronApp.evaluate(({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows();
    const main = wins.find(w => {
      const url = w.webContents.getURL();
      return !url.includes('window=settings') && !url.includes('window=overlay');
    });
    if (!main) return null;
    return main.getOpacity() === 1;
  });
  expect(mainRestored).toBe(true);
});

test('app does not show a Dock icon (macOS)', async () => {
  if (process.platform !== 'darwin') {
    test.skip();
    return;
  }
  const dockVisible = await electronApp.evaluate(({ app }) => {
    return typeof app.dock?.isVisible === 'function' ? app.dock.isVisible() : null;
  });
  expect(dockVisible).toBe(false);
});

test('system tray is present', async () => {
  const hasTray = await electronApp.evaluate(({ app }) => !!app);
  expect(hasTray).toBe(true);
});

test('app.isPackaged is false in development', async () => {
  const isPackaged = await electronApp.evaluate(({ app }) => app.isPackaged);
  expect(isPackaged).toBe(false);
});
