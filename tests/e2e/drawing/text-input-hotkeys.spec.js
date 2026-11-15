/**
 * E2E: a focused text editor must receive every key, so the drawing-scoped
 * single-key grabs (P, L, R, H, E, 1-8) are released while it has focus and
 * come back once it loses focus (Enter / Esc / blur).
 *
 * The OS-level grab is observed through `globalShortcut.isRegistered`; the
 * plugin editor is stood in for by a plain textarea focused in the overlay.
 */
import { test, expect } from '@playwright/test';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';
import { IS_WAYLAND_SESSION } from '../session.js';

test.skip(IS_WAYLAND_SESSION, 'drawing-scoped keys are not registered on Wayland shortcut backends');

const KEYS = ['P', 'L', 'R', 'H', 'E', '1', '8'];
let electronApp;

attachElectronErrorDetection(() => electronApp);

test.beforeAll(async () => { electronApp = await launchElectronApp(); });
test.afterAll(async () => { await electronApp?.close(); });

async function findWindow(predicate, readySelector) {
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    for (const w of electronApp.windows()) {
      try {
        if (!predicate(w.url())) continue;
        await w.waitForLoadState('domcontentloaded', { timeout: 3000 });
        await w.waitForSelector(readySelector, { state: 'attached', timeout: 3000 });
        return w;
      } catch { /* still loading */ }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Expected window not found within 40s');
}

const isGrabbed = (accel) => electronApp.evaluate(({ globalShortcut }, a) => globalShortcut.isRegistered(a), accel);

async function expectAllGrabbed(expected) {
  for (const key of KEYS) {
    await expect.poll(() => isGrabbed(key), { timeout: 10000, message: key }).toBe(expected);
  }
}

test('AC-1 AC-2 keys are released while an editor is focused and return after it blurs', async () => {
  const mainWin = await findWindow(
    (u) => !u.includes('window=overlay') && !u.includes('window=settings'),
    '[data-testid="floatball-btn"], [data-testid="control-bar"]',
  );
  const overlay = await findWindow((u) => u.includes('window=overlay'), '[data-testid="canvas-overlay"]');

  await mainWin.evaluate(() => window.openPenApi.setDrawingMode(true));
  await expectAllGrabbed(true);

  await overlay.evaluate(() => {
    const t = document.createElement('textarea');
    t.id = 'e2e-editor';
    document.body.appendChild(t);
    t.focus();
  });
  await expectAllGrabbed(false);

  // Cancel path: removing the focused editor must also hand the keys back.
  await overlay.evaluate(() => document.getElementById('e2e-editor').remove());
  await expectAllGrabbed(true);

  // Submit path: blur.
  await overlay.evaluate(() => {
    const t = document.createElement('textarea');
    t.id = 'e2e-editor2';
    document.body.appendChild(t);
    t.focus();
  });
  await expectAllGrabbed(false);
  await overlay.evaluate(() => document.getElementById('e2e-editor2').blur());
  await expectAllGrabbed(true);

  await overlay.evaluate(() => document.getElementById('e2e-editor2')?.remove());
  await mainWin.evaluate(() => window.openPenApi.setDrawingMode(false));
});
