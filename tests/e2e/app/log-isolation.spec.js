/**
 * A launched app must log into the spec's isolated directories, never into the
 * developer's real log directory.
 *
 * electron-log resolves main.log from the home directory on macOS
 * (~/Library/Logs/openpen) and from userData on Linux and Windows, so the
 * spec gives the app its own HOME and userData and expects the session-start
 * line in a main.log under one of them.
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';

let electronApp;
let homeDir;
let userDataDir;

attachElectronErrorDetection(() => electronApp);

/** Every main.log below `dir`, at any depth. */
function findMainLogs(dir) {
  return fs.readdirSync(dir, { recursive: true })
    .map((entry) => path.join(dir, entry.toString()))
    .filter((file) => path.basename(file) === 'main.log');
}

test.beforeAll(async () => {
  homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-log-home-'));
  userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-log-userdata-'));
  fs.writeFileSync(path.join(userDataDir, 'config.json'), JSON.stringify({ language: 'en' }), 'utf-8');
  electronApp = await launchElectronApp({
    userDataDir,
    env: { HOME: homeDir, USERPROFILE: homeDir },
  });
});

test.afterAll(async () => {
  await electronApp?.close();
});

test('the app writes its log into the isolated home or userData directory', async () => {
  const mainWindow = await electronApp.firstWindow();
  await mainWindow.waitForLoadState('domcontentloaded');

  const logs = [...findMainLogs(homeDir), ...findMainLogs(userDataDir)];
  expect(logs.length).toBeGreaterThan(0);
  const contents = logs.map((file) => fs.readFileSync(file, 'utf-8')).join('\n');
  expect(contents).toContain('--- OpenPen session start ---');
});
