/**
 * The e2e harness launches Electron with a file path (`electron/main.js`), and
 * in that mode `app.getVersion()` reports Electron's own version instead of
 * openpen's. The plugin `minAppVersion` gate must still compare against
 * openpen's version, so a plugin that requires a newer openpen is skipped even
 * though it is below the Electron version.
 *
 * The fixtures live under a spec-private HOME rather than the run-wide sandbox,
 * so specs that assert the shared plugins dir stays untouched are not raced.
 */
import { test, expect } from '@playwright/test';
import { launchElectronApp } from '../launch.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const { version: OPENPEN_VERSION } = createRequire(import.meta.url)('../../../package.json');
const NEXT_MAJOR = `${Number(OPENPEN_VERSION.split('.')[0]) + 1}.0.0`;

const SCOPE = '@e2eminapp';
let specHome;
let scopeDir;

function writeFixturePlugin(name, minAppVersion) {
  const dir = path.join(scopeDir, name);
  fs.mkdirSync(path.join(dir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'plugin.json'), JSON.stringify({
    id: `${SCOPE}/${name}`,
    name,
    version: '1.0.0',
    minAppVersion,
    renderer: 'dist/renderer.js',
  }));
  fs.writeFileSync(
    path.join(dir, 'dist', 'renderer.js'),
    `export default { id: "${SCOPE}/${name}", version: "1.0.0", contributes: {} }\n`,
  );
}

let electronApp;

test.beforeAll(async () => {
  specHome = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-minapp-home-'));
  scopeDir = path.join(specHome, '.openpen', 'plugins', SCOPE);
  writeFixturePlugin('current', OPENPEN_VERSION);
  writeFixturePlugin('future', NEXT_MAJOR);
  electronApp = await launchElectronApp({ env: { HOME: specHome, USERPROFILE: specHome } });
});

test.afterAll(async () => {
  await electronApp?.close();
  if (specHome) fs.rmSync(specHome, { recursive: true, force: true });
});

test('minAppVersion is checked against the openpen version, not the Electron version', async () => {
  const win = electronApp.windows()[0] ?? (await electronApp.waitForEvent('window'));
  await win.waitForLoadState('domcontentloaded');

  const hostVersion = await win.evaluate(() => window.openPenApi?.getAppVersion());
  expect.soft(hostVersion).toBe(OPENPEN_VERSION);

  const ids = await win.evaluate(async () =>
    ((await window.openPenApi?.getModuleManifests?.()) ?? []).map((m) => m.id),
  );
  expect.soft(ids, `a plugin requiring ${OPENPEN_VERSION} loads`).toContain(`${SCOPE}/current`);
  expect.soft(ids, `a plugin requiring ${NEXT_MAJOR} is skipped`).not.toContain(`${SCOPE}/future`);
});
