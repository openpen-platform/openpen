/**
 * Disk plugins load over the openpen-plugin:// scheme via cross-origin dynamic
 * import(). The scheme must be CORS-enabled and the protocol handler must serve
 * Access-Control-Allow-Origin, or every installed plugin silently fails to
 * import (no built-in coverage exercises this path — built-ins are bundled).
 *
 * The spec installs a dependency-free fixture plugin into the real plugins dir
 * (the manifest loader scans ~/.openpen/plugins regardless of userData), then
 * asserts the renderer imported it without a bootstrap import error.
 */
import { test, expect } from '@playwright/test';
import { launchElectronApp } from '../launch.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FIXTURE_ID_SCOPE = '@e2efix';
const FIXTURE_DIR = path.join(os.homedir(), '.openpen', 'plugins', FIXTURE_ID_SCOPE, 'import-probe');

let electronApp;
const consoleLines = [];

test.beforeAll(async () => {
  fs.mkdirSync(path.join(FIXTURE_DIR, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(FIXTURE_DIR, 'plugin.json'),
    JSON.stringify({
      id: '@e2efix/import-probe',
      name: 'Import Probe',
      version: '1.0.0',
      minAppVersion: '1.0.0',
      renderer: 'dist/renderer.js',
      author: 'e2e',
      description: 'CORS import regression probe.',
    }),
  );
  fs.writeFileSync(
    path.join(FIXTURE_DIR, 'dist', 'renderer.js'),
    'export default { id: "@e2efix/import-probe", version: "1.0.0", contributes: {} }\n',
  );
  electronApp = await launchElectronApp();
});

test.afterAll(async () => {
  await electronApp?.close();
  fs.rmSync(path.join(os.homedir(), '.openpen', 'plugins', FIXTURE_ID_SCOPE), { recursive: true, force: true });
});

test('a disk plugin renderer bundle imports over openpen-plugin:// without a CORS failure', async () => {
  const win = electronApp.windows()[0] ?? (await electronApp.waitForEvent('window'));
  win.on('console', (m) => consoleLines.push(m.text()));
  await win.waitForLoadState('domcontentloaded');
  await win.waitForTimeout(4000);

  const manifests = await win.evaluate(() => window.openPenApi?.getModuleManifests?.());
  const probe = (manifests ?? []).find((m) => m.id === '@e2efix/import-probe');
  expect(probe, 'fixture plugin must be discovered by the manifest loader').toBeTruthy();

  const importFailure = consoleLines.find(
    (l) => l.includes('Failed to import plugin') && l.includes('@e2efix/import-probe'),
  );
  expect(importFailure, `fixture plugin import must succeed, got: ${importFailure}`).toBeUndefined();
});
