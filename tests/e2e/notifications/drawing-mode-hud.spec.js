/**
 * drawing-mode-hud.spec.js — e2e tests for drawing-mode HUD notifications.
 *
 * Scenarios:
 * 1. notifyOnDrawingMode=true (default): debug count increases after toggling drawing mode
 * 2. notifyOnDrawingMode=false: debug count does not increase after toggling
 * 3. NotificationLayer container is present in the overlay window
 * 4. notificationPosition setting correctly affects the CSS position
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
  const win = await electronApp.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return win;
}

async function getOverlayWindow() {
  await new Promise(r => setTimeout(r, 800));
  const wins = electronApp.windows();
  for (const w of wins) {
    if (w.url().includes('window=overlay')) return w;
  }
  const win = await electronApp.waitForEvent('window');
  await win.waitForLoadState('domcontentloaded');
  return win;
}

// ─────────────────────────────────────────────────────────────────────────────

test('NotificationLayer container is present in the overlay window', async () => {
  const overlayWin = await getOverlayWindow();
  // Wait for Vue components to mount.
  await overlayWin.waitForTimeout(500);
  const layer = overlayWin.getByTestId('notification-layer');
  await expect(layer).toBeAttached({ timeout: 3000 });
});

test('notifyOnDrawingMode=true (default): debug count increases after toggling drawing mode', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  // Wait for NotificationService to initialise.
  await overlayWin.waitForTimeout(800);

  // Verify debug handle is available.
  const debugExists = await overlayWin.evaluate(() => {
    return typeof window.__OPENPEN_DEBUG__?.notifications?.count === 'function';
  });
  expect(debugExists).toBe(true);

  const before = await overlayWin.evaluate(() =>
    window.__OPENPEN_DEBUG__?.notifications?.count() ?? 0
  );

  // Toggle drawing mode ON.
  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await overlayWin.waitForTimeout(300);

  const after = await overlayWin.evaluate(() =>
    window.__OPENPEN_DEBUG__?.notifications?.count() ?? 0
  );

  expect(after).toBeGreaterThan(before);

  // Cleanup: toggle back OFF.
  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await overlayWin.waitForTimeout(200);
});

test('notifyOnDrawingMode=true: recent() records correct variant and source', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  await overlayWin.waitForTimeout(800);

  // Reset to OFF for a clean state.
  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await overlayWin.waitForTimeout(200);

  // Toggle ON.
  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await overlayWin.waitForTimeout(300);

  const recent = await overlayWin.evaluate(() =>
    window.__OPENPEN_DEBUG__?.notifications?.recent() ?? []
  );

  // Most recent record should be the drawing-mode ON notification (warning variant).
  expect(recent.length).toBeGreaterThan(0);
  const latest = recent[0];
  expect(latest.source).toBe('host');
  expect(latest.variant).toBe('warning');
  expect(latest.position).toBeTruthy();

  // Cleanup.
  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await overlayWin.waitForTimeout(200);
});

test('notifyOnDrawingMode=false: toggling drawing mode does not push a notification', async () => {
  // Disable notifications via seedConfig.
  const noNotifyApp = await launchElectronApp({
    seedConfig: { language: 'en', notifyOnDrawingMode: false },
  });

  try {
    const mainWin = await noNotifyApp.firstWindow();
    await mainWin.waitForLoadState('domcontentloaded');

    await new Promise(r => setTimeout(r, 800));
    const wins = noNotifyApp.windows();
    let overlayWin = null;
    for (const w of wins) {
      if (w.url().includes('window=overlay')) { overlayWin = w; break; }
    }
    if (!overlayWin) {
      overlayWin = await noNotifyApp.waitForEvent('window');
      await overlayWin.waitForLoadState('domcontentloaded');
    }

    await overlayWin.waitForTimeout(800);

    const before = await overlayWin.evaluate(() =>
      window.__OPENPEN_DEBUG__?.notifications?.count() ?? 0
    );

    await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(true));
    await overlayWin.waitForTimeout(500);

    const after = await overlayWin.evaluate(() =>
      window.__OPENPEN_DEBUG__?.notifications?.count() ?? 0
    );

    // count must not increase when notifyOnDrawingMode=false.
    expect(after).toBe(before);

    await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
  } finally {
    await noNotifyApp.close();
  }
});

test('notificationPosition defaults to top-center — notification-stack has top:8% style', async () => {
  const overlayWin = await getOverlayWindow();
  await overlayWin.waitForTimeout(800);

  // Trigger a notification so the stack is visible.
  const mainWin = await getMainWindow();
  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await overlayWin.waitForTimeout(400);

  const stackStyle = await overlayWin.evaluate(() => {
    const stack = document.querySelector('[data-testid="notification-stack"]');
    if (!stack) return null;
    const s = stack.style;
    return { top: s.top, left: s.left, transform: s.transform };
  });

  // top-center: top 8%, left 50%, translateX(-50%).
  expect(stackStyle).not.toBeNull();
  expect(stackStyle.top).toBe('8%');
  expect(stackStyle.left).toBe('50%');

  // Cleanup.
  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await overlayWin.waitForTimeout(200);
});
