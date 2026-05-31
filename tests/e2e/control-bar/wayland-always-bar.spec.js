import { test, expect } from '@playwright/test';
import { launchElectronApp } from '../launch.js';
import { IS_WAYLAND_SESSION } from '../session.js';

// Wayland-only behaviour: the control bar is ONE persistent window (role=panel)
// that is always expanded (no ball). reconcileLinuxWindows() is the single owner
// of its visibility — it hides the bar while drawing or while the settings window
// is open, and re-shows it afterwards. On non-Wayland sessions there is no
// role=panel window, so the suite skips itself.
//
// NOTE: the toggleBar / barHidden path (toggleBar shortcut, tray hide, gsettings
// --toggle-bar) has no renderer-drivable entry point, so its desired-set logic is
// covered by the deriveLinuxWindowState unit truth-table instead; here we exercise
// the two reconcile triggers a renderer CAN drive (drawing + settings).

// playwright.config.js testIgnores this file on non-Wayland sessions; the inline
// skip is belt-and-suspenders for a direct/bare run.
test.skip(!IS_WAYLAND_SESSION, 'Wayland always-bar model only');

let electronApp;

test.beforeAll(async () => {
  electronApp = await launchElectronApp();
});

test.afterAll(async () => {
  await electronApp?.close();
});

async function findBarWindow(app) {
  let bar = null;
  await expect
    .poll(
      () => {
        for (const w of app.windows()) {
          if (w.url().includes('role=panel')) {
            bar = w;
            return true;
          }
        }
        return false;
      },
      { timeout: 15000, message: 'role=panel bar window never appeared' },
    )
    .toBe(true);
  return bar;
}

/** Whether the persistent role=panel bar window is currently shown (main-process truth). */
function barVisible(app) {
  return app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(
      (win) => !win.isDestroyed() && win.webContents.getURL().includes('role=panel'),
    );
    return w ? w.isVisible() : null;
  });
}

test('Wayland: bar is always expanded, no ball', async () => {

  const bar = await findBarWindow(electronApp);
  await expect(bar.locator('[data-testid="control-bar"]')).toBeVisible();
  // No floating ball is rendered in the persistent bar window.
  await expect(bar.locator('[data-testid="floatball-btn"]')).toHaveCount(0);
});

test('Wayland: entering drawing hides the bar, exiting restores it', async () => {

  const bar = await findBarWindow(electronApp);
  await expect.poll(() => barVisible(electronApp), { timeout: 15000 }).toBe(true);

  await bar.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await expect
    .poll(() => barVisible(electronApp), { timeout: 15000, message: 'bar should hide while drawing' })
    .toBe(false);

  await bar.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await expect
    .poll(() => barVisible(electronApp), { timeout: 15000, message: 'bar should re-show after drawing' })
    .toBe(true);
});

test('Wayland: opening settings hides the bar, closing restores it', async () => {

  const bar = await findBarWindow(electronApp);
  await expect.poll(() => barVisible(electronApp), { timeout: 15000 }).toBe(true);

  await bar.evaluate(() => window.openPenApi?.openSettingsWindow());
  await expect
    .poll(() => barVisible(electronApp), { timeout: 15000, message: 'bar should hide while settings is open' })
    .toBe(false);

  await bar.evaluate(() => window.openPenApi?.closeSettingsWindow());
  await expect
    .poll(() => barVisible(electronApp), { timeout: 15000, message: 'bar should re-show after settings closes' })
    .toBe(true);
});
