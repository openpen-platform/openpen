/**
 * E2E: a plugin shortcut that switches tools through the public `activateTool`
 * lights the plugin's control-bar button and unlights the previous tool's button.
 *
 * The plugin handler runs in the overlay window (where shortcut handlers run),
 * so the control bar lives in a different renderer and can only follow through
 * the main-process relay. The OS key press is simulated by the main process
 * sending the same `module:shortcut-triggered` message a real global shortcut
 * produces; physical key presses are verified separately by QA.
 *
 * The fixture plugin is written under the sandbox HOME created by globalSetup,
 * never the developer's real home.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';

const PLUGIN_SCOPE = '@e2efix';
const PLUGIN_NAME = 'tool-sync';
const PLUGIN_ID = `${PLUGIN_SCOPE}/${PLUGIN_NAME}`;
const SHORTCUT_ID = 'pick';
const ACTIVE_CLASS = /(^|\s)active(\s|$)/;

const RENDERER_SOURCE = `
import { h, inject } from 'vue';
import { AppButton } from '@openpen/module-api/uikit';
import { activateTool, ACTIVE_TOOL_KEY } from '@openpen/module-api';

// The control bar provides the active tool id; the button reads it instead of
// subscribing to events.
const ToolButton = {
  setup() {
    const activeTool = inject(ACTIVE_TOOL_KEY);
    return () => h(
      AppButton,
      {
        active: activeTool?.value === 'probe-tool',
        'data-testid': 'controlbar-probe-tool-btn',
        onClick: () => activateTool('probe-tool'),
      },
      () => 'P',
    );
  },
};

export default {
  id: '${PLUGIN_ID}',
  version: '1.0.0',
  contributes: {
    tools: [{ id: 'probe-tool', onPointerDown() {}, onPointerMove() {}, onPointerUp() {} }],
    controlBar: [{ id: 'probe-tool', component: ToolButton, defaultGroup: 'tools' }],
    shortcuts: [{
      id: '${SHORTCUT_ID}',
      keys: 'CommandOrControl+Alt+9',
      scope: 'global',
      handler: () => activateTool('probe-tool'),
    }],
  },
};
`;

let electronApp;
let pluginRoot;

attachElectronErrorDetection(() => electronApp);

test.beforeAll(async () => {
  // Refuse to write a fixture plugin anywhere but the run-wide sandbox HOME.
  if (!process.env.OPENPEN_E2E_HOME) {
    throw new Error('OPENPEN_E2E_HOME is not set; refusing to seed a plugin into the real home directory');
  }
  pluginRoot = path.join(os.homedir(), '.openpen', 'plugins', PLUGIN_SCOPE);
  const dir = path.join(pluginRoot, PLUGIN_NAME);
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'plugin.json'),
    JSON.stringify({
      id: PLUGIN_ID,
      name: 'Tool Sync Probe',
      version: '1.0.0',
      minAppVersion: '1.0.0',
      renderer: 'dist/renderer.js',
      author: 'e2e',
      description: 'Switches tool through activateTool from a shortcut.',
    }),
  );
  fs.writeFileSync(path.join(dir, 'dist', 'renderer.js'), RENDERER_SOURCE);
  electronApp = await launchElectronApp();
});

test.afterAll(async () => {
  await electronApp?.close();
  if (pluginRoot) fs.rmSync(pluginRoot, { recursive: true, force: true });
});

async function findWindow(predicate, readySelector) {
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    for (const w of electronApp.windows()) {
      try {
        if (!predicate(w.url())) continue;
        await w.waitForLoadState('domcontentloaded', { timeout: 3000 });
        await w.waitForSelector(readySelector, { state: 'attached', timeout: 3000 });
        return w;
      } catch {
        // Window still loading; keep polling.
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Expected window not found within 40s');
}

// The bar boots collapsed into the float ball; expand it so tool buttons mount.
async function expandControlBar(win) {
  const bar = win.getByTestId('control-bar');
  if (await bar.isVisible().catch(() => false)) return;
  await win.getByTestId('floatball-btn').click();
  await expect(bar).toBeVisible({ timeout: 5000 });
}

test('AC-1 a plugin shortcut switching tools lights the plugin button and unlights the previous one', async () => {
  const mainWin = await findWindow(
    (url) => !url.includes('window=overlay') && !url.includes('window=settings'),
    '[data-testid="floatball-btn"], [data-testid="control-bar"]',
  );
  const overlayWin = await findWindow(
    (url) => url.includes('window=overlay'),
    '[data-testid="canvas-overlay"]',
  );
  await expandControlBar(mainWin);

  const freehandBtn = mainWin.getByTestId('controlbar-freehand-btn');
  const pluginBtn = mainWin.getByTestId('controlbar-probe-tool-btn');
  await expect(pluginBtn).toBeAttached({ timeout: 15000 });
  await expect(freehandBtn).toHaveClass(ACTIVE_CLASS);
  await expect(pluginBtn).not.toHaveClass(ACTIVE_CLASS);

  // Same message a global shortcut produces, delivered to the overlay window.
  await electronApp.evaluate(({ BrowserWindow }, id) => {
    const overlay = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes('window=overlay'));
    overlay.webContents.send('module:shortcut-triggered', { id });
  }, `${PLUGIN_ID}/${SHORTCUT_ID}`);

  await expect(pluginBtn).toHaveClass(ACTIVE_CLASS, { timeout: 5000 });
  await expect(freehandBtn).not.toHaveClass(ACTIVE_CLASS);
  // overlayWin is resolved only to prove the overlay renderer is up before triggering.
  expect(overlayWin.url()).toContain('window=overlay');
});
