/**
 * Disk plugins load over the openpen-plugin:// scheme via cross-origin dynamic
 * import(). The scheme must be CORS-enabled and the protocol handler must serve
 * Access-Control-Allow-Origin, or every installed plugin silently fails to
 * import (no built-in coverage exercises this path — built-ins are bundled).
 *
 * The spec installs a dependency-free fixture plugin into ~/.openpen/plugins
 * of a HOME of its own (the manifest loader scans it regardless of userData;
 * see fixture-home.js), then asserts the renderer imported it without a
 * bootstrap import error.
 */
import { test, expect } from '@playwright/test';
import { launchElectronApp } from '../launch.js';
import { createFixtureHome, fixtureHomeEnv, fixturePluginDir } from '../fixture-home.js';
import fs from 'node:fs';
import path from 'node:path';

let electronApp;
let fixtureHome;
const consoleLines = [];

test.beforeAll(async () => {
  fixtureHome = createFixtureHome();
  const FIXTURE_DIR = fixturePluginDir(fixtureHome, '@e2efix/import-probe');
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
  electronApp = await launchElectronApp({ env: fixtureHomeEnv(fixtureHome) });
});

test.afterAll(async () => {
  await electronApp?.close();
  // Only this instance's HOME: parallel specs and repeats each have their own.
  if (fixtureHome) fs.rmSync(fixtureHome, { recursive: true, force: true });
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
