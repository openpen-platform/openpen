/**
 * E2E spec: plugin dialogs take keyboard focus and give it back.
 *
 * Flow under test (Settings -> Modules -> "Add source" dialog):
 *   1. Keyboard-open the dialog: focus moves inside it.
 *   2. Tab / Shift+Tab never reach the controls behind it.
 *   3. Closing it returns focus to the button that opened it.
 *
 * Run: npx playwright test tests/e2e/plugins-tab/dialog-focus.spec.js
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchElectronApp } from '../launch.js';

let electronApp;
let settingsWin;
let sandboxHome;

test.beforeAll(async () => {
  sandboxHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-home-'));
  electronApp = await launchElectronApp({
    env: { HOME: sandboxHome, USERPROFILE: sandboxHome },
  });

  const deadline = Date.now() + 20000;
  while (Date.now() < deadline && !settingsWin) {
    for (const w of electronApp.windows()) {
      try {
        const url = w.url();
        if (url.includes('window=settings')) {
          settingsWin = w;
          break;
        }
        if (!url.includes('window=overlay')) {
          await w.evaluate(() => window.openPenApi?.openSettingsWindow());
        }
      } catch { /* window may not be ready yet */ }
    }
    if (!settingsWin) await new Promise((r) => setTimeout(r, 400));
  }
  if (!settingsWin) throw new Error('Settings window did not open within timeout');

  await settingsWin.click('[data-testid="tab-modules"]');
});

test.afterAll(async () => {
  await electronApp?.close();
  if (sandboxHome) fs.rmSync(sandboxHome, { recursive: true, force: true });
});

test('Add source dialog traps Tab and returns focus to its opener', async () => {
  const opener = settingsWin.getByTestId('plugins-add-source-btn');
  await opener.waitFor({ state: 'visible', timeout: 15000 });
  await opener.focus();
  await settingsWin.keyboard.press('Enter');

  const modal = settingsWin.getByTestId('pac-modal');
  await expect(modal).toBeVisible();
  await expect(modal).toHaveAttribute('role', 'dialog');
  await expect(modal).toHaveAttribute('aria-modal', 'true');

  const insideModal = () => settingsWin.evaluate(() => {
    const dialog = document.querySelector('[data-testid="pac-modal"]');
    return !!dialog && dialog.contains(document.activeElement);
  });

  // 1. Focus moved into the dialog.
  await expect.poll(insideModal).toBe(true);

  // 2. Forward and backward Tab stay inside, more presses than the dialog has controls.
  for (let i = 0; i < 12; i++) {
    await settingsWin.keyboard.press('Tab');
    expect(await insideModal()).toBe(true);
  }
  for (let i = 0; i < 12; i++) {
    await settingsWin.keyboard.press('Shift+Tab');
    expect(await insideModal()).toBe(true);
  }

  // 3. Closing returns focus to the opener.
  await settingsWin.keyboard.press('Escape');
  await expect(modal).toBeHidden();
  await expect(opener).toBeFocused();
});
