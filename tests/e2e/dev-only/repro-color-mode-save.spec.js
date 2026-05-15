/**
 * Regression: Color Mode (theme) single-change must persist to disk.
 *
 * Origin bug: `handleSave` sent the settings draft over IPC without stripping
 * Vue reactive Proxies. The nested `pluginIdConflictResolutions` proxy made
 * the renderer's structured clone for `settings:set` silently fail — the
 * main-process handler never ran, so the in-memory cache was updated by the
 * `settings:preview` round-trip but disk was not. Symptom: pick a new theme,
 * Save, restart — theme reverts.
 *
 * The launch helper seeds OPENPEN_AUTO_CONFIRM_QUIT=1 so electronApp.close()
 * takes the dialog-skipping exit path without hanging.
 */
import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { launchElectronApp } from '../launch.js';

async function getMainWindow(electronApp) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    for (const w of electronApp.windows()) {
      try {
        const url = w.url();
        if (!url.includes('window=overlay') && !url.includes('window=settings')) {
          await w.waitForLoadState('domcontentloaded');
          await w.waitForSelector('.float-ball, .control-bar', { timeout: 20000 });
          return w;
        }
      } catch (_) { /* window may be closing */ }
    }
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error('Main window not found');
}

async function expandControlBar(mainWin) {
  const expanded = await mainWin.evaluate(() => document.querySelector('.control-bar') !== null);
  if (expanded) return;
  await mainWin.waitForSelector('.float-ball', { timeout: 10000 });
  await mainWin.evaluate(() => {
    document.querySelector('.float-ball')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true })
    );
  });
  await mainWin.waitForSelector('.control-bar', { timeout: 5000 });
}

async function openSettings(electronApp, mainWin) {
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
  await settingsWin.waitForSelector('.color-chip.selected', { timeout: 8000 });
  return settingsWin;
}

test('color mode: single-change save reaches disk', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-color-mode-repro-'));
  fs.writeFileSync(
    path.join(userDataDir, 'config.json'),
    JSON.stringify({ language: 'en', theme: 'system' }),
    'utf-8',
  );

  const app = await launchElectronApp({ userDataDir });
  const mainWin = await getMainWindow(app);
  const settingsWin = await openSettings(app, mainWin);

  const themeBefore = await mainWin.evaluate(() => window.openPenApi.getSettings().then(s => s.theme));

  // Warm up the AppSegmented (Reka UI RadioGroup) — its first interaction in
  // a freshly-shown frameless transparent window is dead until focus shifts.
  await settingsWin.locator('[data-testid="tab-behavior"]').click();
  await settingsWin.waitForTimeout(200);
  await settingsWin.locator('[data-testid="tab-appearance"]').click();
  await settingsWin.waitForTimeout(200);

  const targetTheme = themeBefore === 'dark' ? 'light' : 'dark';
  await settingsWin.locator(`[data-testid="theme-${targetTheme}"]`).click();
  await settingsWin.waitForTimeout(400);

  await settingsWin.locator('[data-testid="save-btn"]').click();
  await mainWin.waitForTimeout(700);

  // writeConfig() enqueues a sync write, so by now the file on disk
  // already reflects the new theme regardless of how the app quits.
  const onDisk = JSON.parse(fs.readFileSync(path.join(userDataDir, 'config.json'), 'utf-8'));
  expect(onDisk.theme).toBe(targetTheme);

  await app.close();
});
