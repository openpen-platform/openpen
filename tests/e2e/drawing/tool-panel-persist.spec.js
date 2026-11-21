/**
 * Shape panel (kind + fill) and eraser panel (brush / whole-stroke) choices
 * must survive an app restart.
 *
 * Both launches share one ephemeral userData dir; the dir is removed in
 * afterAll, and launchElectronApp already sandboxes HOME / temp, so nothing
 * on the developer's real profile is read or written.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchElectronApp } from '../launch.js';

test.describe.configure({ mode: 'serial' });

let userDataDir;
let electronApp;

test.beforeAll(() => {
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-persist-'));
  fs.writeFileSync(path.join(userDataDir, 'config.json'), JSON.stringify({ language: 'en' }), 'utf-8');
});

test.afterAll(async () => {
  await electronApp?.close().catch(() => {});
  fs.rmSync(userDataDir, { recursive: true, force: true });
});

async function launch() {
  electronApp = await launchElectronApp({ userDataDir });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const win of electronApp.windows()) {
      try {
        if (win.url().includes('window=overlay') || win.url().includes('window=settings')) continue;
        await win.waitForLoadState('domcontentloaded', { timeout: 3000 });
        const ready = await win.evaluate(
          () => !!document.querySelector('[data-testid="floatball-btn"], [data-testid="control-bar"]'),
        );
        if (ready) {
          const bar = win.getByTestId('control-bar');
          if (!(await bar.isVisible().catch(() => false))) {
            await win.getByTestId('floatball-btn').click();
            await win.waitForTimeout(500);
          }
          return win;
        }
      } catch {
        // window still initialising
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Main window not found within 30s');
}

async function overlayWindow() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const w of electronApp.windows()) {
      if (w.url().includes('window=overlay')) {
        await w.waitForLoadState('domcontentloaded');
        return w;
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Overlay window not found');
}

async function waitForSaved(predicate) {
  const file = path.join(userDataDir, 'config.json');
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      if (predicate(JSON.parse(fs.readFileSync(file, 'utf-8')).modules ?? {})) return;
    } catch {
      // file mid-write
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('selection was not written to config.json');
}

test('first run: pick star + fill and whole-stroke erase', async () => {
  const win = await launch();

  await win.getByTestId('controlbar-shape-caret').click();
  await win.getByTestId('shape-chip-star').click();
  await win.getByTestId('controlbar-shape-caret').click();
  await win.getByRole('switch', { name: 'Toggle fill' }).click();

  await win.getByTestId('controlbar-eraser-caret').click();
  await win.getByTestId('eraser-mode-stroke').click();

  await waitForSaved(
    (m) =>
      m['@openpen/shape']?.shapeType === 'star' &&
      m['@openpen/shape']?.filled === true &&
      m['@openpen/eraser']?.mode === 'stroke-eraser',
  );

  // A hotkey / relayed tool switch to the brush eraser must not overwrite the
  // panel choice that was saved.
  await win.evaluate(() => window.openPenApi?.setActiveTool({ tool: 'eraser' }));
  await win.waitForTimeout(800);
  await waitForSaved((m) => m['@openpen/eraser']?.mode === 'stroke-eraser');

  await electronApp.close();
  electronApp = null;
});

test('second run: the shape panel and eraser button reuse the saved choices', async () => {
  const win = await launch();

  // AC1: shape kind + fill
  await win.getByTestId('controlbar-shape-caret').click();
  await expect(win.getByTestId('shape-chip-star')).toHaveClass(/active/);
  await expect(win.getByRole('switch', { name: 'Toggle fill' })).toHaveAttribute('aria-checked', 'true');

  // AC2: eraser main button activates whole-stroke erase
  const overlay = await overlayWindow();
  await win.getByTestId('controlbar-eraser-btn').click();
  await overlay.waitForFunction(
    () => window.__OPENPEN_DEBUG__?.overlay?.activeTool === 'stroke-eraser',
    undefined,
    { timeout: 5000 },
  );
});
