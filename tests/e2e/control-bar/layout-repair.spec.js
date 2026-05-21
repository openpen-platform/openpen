/**
 * Layout repair migration E2E tests.
 *
 * Validates that pre-Phase-7.7 user configs (where eraser was persisted in
 * the 'tools' group and groups had no inset field) are auto-repaired on
 * boot to the canonical layout (eraser in its own group, inset on tools) without losing the user's
 * other layout customizations.
 */
import { test, expect } from '@playwright/test';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';

let electronApp;
attachElectronErrorDetection(() => electronApp);

test.beforeAll(async () => {
  electronApp = await launchElectronApp({
    seedConfig: {
      controlBarLayout: {
        version: 1,
        groups: [
          { id: 'tools', items: ['freehand', 'line', 'shape', 'eraser'], separator: 'auto' },
          { id: 'stroke-width', items: ['stroke-width'], separator: 'always' },
          { id: 'color', items: ['color'], separator: 'always' },
          { id: 'default', items: [] },
        ],
      },
    },
  });
});

test.afterAll(async () => {
  await electronApp?.close();
});

async function getMainWindow() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    for (const w of electronApp.windows()) {
      try {
        await w.waitForLoadState('domcontentloaded', { timeout: 2000 });
        if (await w.evaluate(() => !!document.querySelector('[data-testid="floatball-btn"], [data-testid="control-bar"]'))) return w;
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('main window not ready');
}

test('stale config (eraser-in-tools, no inset) is repaired to canonical layout on boot', async () => {
  const win = await getMainWindow();
  await win.getByTestId('floatball-btn').click();
  await win.waitForTimeout(800);

  const layout = await win.evaluate(async () => await window.openPenApi?.getLayout());
  const tools = layout.groups.find((g) => g.id === 'tools');
  const eraser = layout.groups.find((g) => g.id === 'eraser');

  // Eraser must move out of tools.
  expect(tools.items).toEqual(['freehand', 'line', 'shape']);
  // Inset must auto-populate on tools group for backward compat.
  expect(tools.inset).toEqual({ enabled: true });
  // Eraser must land in its own 'eraser' group with separator: 'always'.
  expect(eraser).toBeDefined();
  expect(eraser.items).toEqual(['eraser']);
  expect(eraser.separator).toBe('always');

  // 'eraser' group must sit immediately after 'tools'.
  const toolsIdx = layout.groups.findIndex((g) => g.id === 'tools');
  const eraserIdx = layout.groups.findIndex((g) => g.id === 'eraser');
  expect(eraserIdx).toBe(toolsIdx + 1);

  // Bar height MUST stay 50px (no fattening even on first migration boot).
  const barH = await win.evaluate(() => document.querySelector('[data-testid="control-bar"]').getBoundingClientRect().height);
  expect(barH).toBe(50);
});
