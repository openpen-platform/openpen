/**
 * Guards against the race between App.vue and SettingsView both sending
 * the CONTENT_READY IPC signal when the settings window opens. With the
 * fix, only SettingsView sends the signal (after loadSettings hydrates
 * the draft). Without the fix, App.vue also sends a racing signal that
 * can reveal the window before form state is hydrated.
 */
import { test, expect } from '@playwright/test';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';

const CONTENT_READY_CHANNEL = 'window:content-ready';

let electronApp;

attachElectronErrorDetection(() => electronApp);

test.beforeAll(async () => {
  electronApp = await launchElectronApp();
});

test.afterAll(async () => {
  await electronApp?.close();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  await mainWin.waitForSelector('[data-testid="floatball-btn"], [data-testid="control-bar"]', { timeout: 20000 });
  return mainWin;
}

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

async function closeAllSettingsWindows(mainWin) {
  await mainWin.evaluate(() => window.openPenApi?.closeSettingsWindow());
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const count = await electronApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().length
    );
    if (count <= 2) break;
    await mainWin.waitForTimeout(100);
  }
  await mainWin.waitForTimeout(300);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('settings window receives exactly one CONTENT_READY signal', async () => {
  const mainWin = await getMainWindow();
  await closeAllSettingsWindows(mainWin);

  // Install an ipcMain listener that counts CONTENT_READY signals from the
  // settings window. Reset any leftover counter first.
  await electronApp.evaluate(({ ipcMain }, channel) => {
    // Remove any prior listener from a previous run of this test.
    if (globalThis.__cntReadyListener) {
      ipcMain.removeListener(channel, globalThis.__cntReadyListener);
      globalThis.__cntReadyListener = null;
    }
    globalThis.__cntReadyCounter = 0;

    globalThis.__cntReadyListener = (event) => {
      const url = event.sender.getURL();
      if (url.includes('window=settings')) {
        globalThis.__cntReadyCounter++;
      }
    };
    ipcMain.on(channel, globalThis.__cntReadyListener);
  }, CONTENT_READY_CHANNEL);

  // Open the settings window via the UI gear button, mirroring a real user flow.
  await expandControlBar(mainWin);
  const winPromise = electronApp.waitForEvent('window', { timeout: 10000 });
  await mainWin.evaluate(() => {
    document.querySelector('[data-testid="controlbar-settings-btn"]')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  });
  const settingsWin = await winPromise;
  await settingsWin.waitForLoadState('domcontentloaded');
  await settingsWin.waitForSelector('[data-testid="settings-window"]', { timeout: 10000 });
  // Wait for hydration: .color-chip.selected only appears after loadSettings()
  // populates draft.defaultColor. CSS-class selector here is a scope-deferred
  // violation of test-selector-spec.md — tracked under todo task #29 (Phase 1
  // testid migration); AppearanceTab's color chip needs a data-testid first.
  await settingsWin.waitForSelector('.color-chip.selected', { timeout: 8000 });

  // Allow a generous window for any straggler signal from App.vue to land before
  // reading the counter. The assertion is on the count, not on this timeout.
  await mainWin.waitForTimeout(2000);

  const count = await electronApp.evaluate(() => globalThis.__cntReadyCounter);
  expect(count).toBe(1);

  // Cleanup: remove the listener so it does not bleed into other tests.
  await electronApp.evaluate(({ ipcMain }, channel) => {
    if (globalThis.__cntReadyListener) {
      ipcMain.removeListener(channel, globalThis.__cntReadyListener);
      globalThis.__cntReadyListener = null;
    }
  }, CONTENT_READY_CHANNEL);

  await closeAllSettingsWindows(mainWin);
});
