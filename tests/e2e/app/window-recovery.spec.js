/**
 * A drawing window whose renderer dies must come back on its own and be
 * drawable again; if it keeps dying, the user gets a way out that disables
 * every installed plugin without deleting any.
 *
 * The crash is forced from the main process with `forcefullyCrashRenderer()`
 * (the same path a hung renderer is pushed through), so the spec runs on every
 * platform and session. The native escalation dialog is replaced by a stub that
 * records the call and answers with a chosen button.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchElectronApp } from '../launch.js';

test.describe.configure({ mode: 'serial' });
test.setTimeout(60000);

const OVERLAY_URL_PART = 'window=overlay';

let app;
const tempDirs = [];

test.afterEach(async () => {
  await app?.close().catch(() => {});
  app = null;
});

test.afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Any window that can call openPenApi (control bar on every session). */
async function anyApiWindow() {
  const win = await app.firstWindow();
  await win.waitForLoadState('domcontentloaded');
  return win;
}

/**
 * Run a script inside the overlay renderer from the main process. Going through
 * the main process (instead of a Playwright page handle) keeps working after
 * the renderer was replaced by a recovery reload. Resolves null while the
 * renderer is dead or still loading.
 */
function inOverlay(script) {
  return app.evaluate(async ({ BrowserWindow }, { part, code }) => {
    const win = BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && w.webContents.getURL().includes(part),
    );
    if (!win) return null;
    try {
      return await Promise.race([
        win.webContents.executeJavaScript(code),
        new Promise((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);
    } catch {
      return null;
    }
  }, { part: OVERLAY_URL_PART, code: script });
}

const PROBE = `({
  hasCanvas: !!document.querySelector('[data-testid="canvas-overlay"]'),
  marker: window.__recoveryMarker ?? null,
  drawing: !!document.querySelector('[data-testid="canvas-overlay"]')?.classList.contains('drawing-mode'),
})`;

async function enterDrawingModeAndGetOverlay() {
  const api = await anyApiWindow();
  await api.evaluate(() => window.openPenApi.setDrawingMode(true));
  await expect
    .poll(async () => (await inOverlay(PROBE))?.hasCanvas ?? false, { timeout: 20000 })
    .toBe(true);
  await inOverlay(`window.__recoveryMarker = 'before-crash'; true`);
}

function crashOverlay() {
  return app.evaluate(({ BrowserWindow }, part) => {
    const win = BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && w.webContents.getURL().includes(part),
    );
    win.webContents.forcefullyCrashRenderer();
  }, OVERLAY_URL_PART);
}

async function expectReloadedAndDrawable() {
  await expect
    .poll(async () => {
      const state = await inOverlay(PROBE);
      return !!state && state.hasCanvas && state.marker === null && state.drawing;
    }, {
      timeout: 20000,
      message: 'overlay renderer reloaded (planted marker gone), canvas back, drawing mode restored',
    })
    .toBe(true);

  const drewPixels = await inOverlay(`(async () => {
    const canvas = document.querySelector('[data-testid="canvas-overlay"]');
    const fire = (type, x, y) => canvas.dispatchEvent(
      new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, buttons: type === 'pointerup' ? 0 : 1, bubbles: true }));
    fire('pointerdown', 60, 60);
    for (let i = 1; i <= 8; i++) fire('pointermove', 60 + i * 20, 60 + i * 12);
    fire('pointerup', 220, 156);
    await new Promise((r) => setTimeout(r, 300));
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
    return false;
  })()`);
  expect(drewPixels, 'a stroke can be drawn on the recovered overlay').toBe(true);
}

test('a crashed drawing window reloads itself and can draw again', async () => {
  app = await launchElectronApp();
  await enterDrawingModeAndGetOverlay();

  await crashOverlay();

  await expectReloadedAndDrawable();
});

test('a second crash stops the reloading; "disable plugins" keeps the plugin files and turns them off', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-recovery-home-'));
  tempDirs.push(home);
  const pluginDir = path.join(home, '.openpen', 'plugins', '@e2e', 'recovery-probe');
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify({ id: '@e2e/recovery-probe', name: 'Recovery probe', version: '1.0.0' }),
  );

  app = await launchElectronApp({ env: { HOME: home, USERPROFILE: home } });
  await enterDrawingModeAndGetOverlay();

  // Answer the escalation dialog with its second button (disable plugins) and
  // keep the process alive by recording relaunch / exit instead of performing them.
  await app.evaluate(({ app: electronApp, dialog }) => {
    globalThis.__recovery = { dialogs: [], relaunched: 0, exited: 0 };
    dialog.showMessageBox = async (opts) => {
      globalThis.__recovery.dialogs.push(opts.buttons);
      return { response: 1 };
    };
    globalThis.__recovery.original = { relaunch: electronApp.relaunch, exit: electronApp.exit };
    electronApp.relaunch = () => { globalThis.__recovery.relaunched += 1; };
    electronApp.exit = () => { globalThis.__recovery.exited += 1; };
  });

  await crashOverlay();
  await expectReloadedAndDrawable(); // first crash: automatic reload, no dialog
  expect(await app.evaluate(() => globalThis.__recovery.dialogs.length)).toBe(0);

  await crashOverlay(); // second crash soon after: no automatic reload, dialog instead
  await expect
    .poll(() => app.evaluate(() => globalThis.__recovery.relaunched), { timeout: 20000 })
    .toBe(1);
  const recovery = await app.evaluate(() => globalThis.__recovery);
  expect(recovery.dialogs).toHaveLength(1);
  expect(recovery.dialogs[0]).toHaveLength(3);
  expect(recovery.exited).toBe(1);

  const userData = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));
  const config = JSON.parse(fs.readFileSync(path.join(userData, 'config.json'), 'utf-8'));
  expect(config.disabledModules).toContain('@e2e/recovery-probe');
  expect(fs.existsSync(path.join(pluginDir, 'plugin.json')), 'plugin files are kept').toBe(true);

  // Put the real exit back so the harness can close the app.
  await app.evaluate(({ app: electronApp }) => {
    electronApp.relaunch = globalThis.__recovery.original.relaunch;
    electronApp.exit = globalThis.__recovery.original.exit;
  });
});

/** Fire a webContents event on the overlay from the main process, as Chromium would. */
function emitOnOverlay(event, ...args) {
  return app.evaluate(({ BrowserWindow }, { part, event: name, args: eventArgs }) => {
    const win = BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && w.webContents.getURL().includes(part),
    );
    const wc = win.webContents;
    // A load failure is reported against the page that was being loaded.
    const resolved = eventArgs.map((a) => (a === '__current_url__' ? wc.getURL() : a));
    wc.emit(name, ...resolved);
  }, { part: OVERLAY_URL_PART, event, args });
}

test('a window that stays unresponsive gets its renderer restarted and can draw again', async () => {
  test.setTimeout(90000);
  app = await launchElectronApp();
  await enterDrawingModeAndGetOverlay();

  // Chromium's own hang detection takes ~30 s; emit its event so the spec
  // exercises the grace period and the forced restart, not the detector.
  await emitOnOverlay('unresponsive');

  await expectReloadedAndDrawable();
});

test('a window whose load keeps failing is retried, then the user is asked, and it recovers', async () => {
  app = await launchElectronApp();
  await enterDrawingModeAndGetOverlay();

  // Answer the dialog with its first button (reload).
  await app.evaluate(({ dialog }) => {
    globalThis.__recovery = { dialogs: [] };
    dialog.showMessageBox = async (opts) => {
      globalThis.__recovery.dialogs.push(opts.message);
      return { response: 0 };
    };
  });

  // Three failures of the main frame: two retries are free, the third escalates.
  for (let i = 0; i < 3; i += 1) {
    await emitOnOverlay('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', '__current_url__', true);
  }

  await expect
    .poll(() => app.evaluate(() => globalThis.__recovery.dialogs.length), { timeout: 20000 })
    .toBe(1);
  await expectReloadedAndDrawable();
});
