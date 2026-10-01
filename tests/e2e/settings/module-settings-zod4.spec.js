/**
 * Module settings survive the zod 4 schema runtime.
 *
 * Plugins do not bundle zod: they take `z` from `@openpen/module-api`, which
 * the host resolves through the importmap. The zod version is therefore the
 * host's, and every assertion below runs against whatever `z` a disk plugin
 * actually receives.
 *
 * - Built-in module settings written by a 1.x host (flat `.default()` schemas)
 *   are parsed as valid and kept, not reset to defaults.
 * - A disk plugin with a flat settingsSchema gets its defaults on first boot,
 *   and an `updateSettings()` write survives an app restart.
 */
import { test, expect } from '@playwright/test';
import { launchElectronApp } from '../launch.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const FIXTURE_SCOPE = '@e2efix';
const FIXTURE_ID = '@e2efix/zod4-settings';
const FIXTURE_DIR = path.join(os.homedir(), '.openpen', 'plugins', FIXTURE_SCOPE, 'zod4-settings');

const FIXTURE_RENDERER = `import { defineModule, z } from '@openpen/module-api'

export default defineModule({
  id: '${FIXTURE_ID}',
  version: '1.0.0',
  settingsSchema: z.object({
    color: z.string().default('#ff4d4f'),
    size: z.number().min(1).max(64).default(12),
    mode: z.enum(['outline', 'fill']).default('outline'),
    enabled: z.boolean().default(true),
  }),
  contributes: { lifecycle: { onReady() {} } },
  setup(ctx) {
    globalThis.__zod4Probe = {
      hasPrefault: typeof z.prefault === 'function',
      getSettings: () => ctx.getSettings(),
      update: (patch) => ctx.updateSettings(patch),
    }
  },
})
`;

const LEGACY_MODULE_SETTINGS = {
  '@openpen/color': { defaultColor: '#22c55e' },
  '@openpen/stroke-width': { defaultWidth: 9, minWidth: 2, maxWidth: 16, style: 'popup' },
};

function mkUserDataDir(seed) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-'));
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ language: 'en', ...seed }), 'utf-8');
  return dir;
}

function readConfig(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf-8'));
}

/** Resolve the first window whose renderer ran the fixture plugin's setup(). */
async function waitForProbeWindow(electronApp) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    for (const win of electronApp.windows()) {
      try {
        if (await win.evaluate(() => !!globalThis.__zod4Probe)) return win;
      } catch { /* window navigating — keep polling */ }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('fixture plugin setup() did not run within 20s');
}

test.beforeAll(() => {
  fs.mkdirSync(path.join(FIXTURE_DIR, 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(FIXTURE_DIR, 'plugin.json'),
    JSON.stringify({
      id: FIXTURE_ID,
      name: 'Zod 4 Settings Probe',
      version: '1.0.0',
      minAppVersion: '1.0.0',
      renderer: 'dist/renderer.js',
      author: 'e2e',
      description: 'Settings schema runtime probe.',
    }),
  );
  fs.writeFileSync(path.join(FIXTURE_DIR, 'dist', 'renderer.js'), FIXTURE_RENDERER);
});

test.afterAll(() => {
  fs.rmSync(path.join(os.homedir(), '.openpen', 'plugins', FIXTURE_SCOPE), { recursive: true, force: true });
});

test('built-in module settings written by a 1.x host are kept, not reset', async () => {
  const userDataDir = mkUserDataDir({
    modules: LEGACY_MODULE_SETTINGS,
    moduleMeta: { '@openpen/color': { schemaVersion: 1 }, '@openpen/stroke-width': { schemaVersion: 1 } },
  });
  const electronApp = await launchElectronApp({ userDataDir });
  try {
    const win = await waitForProbeWindow(electronApp);
    expect(await win.evaluate(() => globalThis.__zod4Probe.hasPrefault), 'plugins must receive zod 4').toBe(true);

    for (const [id, expected] of Object.entries(LEGACY_MODULE_SETTINGS)) {
      const { data } = await win.evaluate((moduleId) => window.openPenApi.getModuleSettings(moduleId), id);
      expect(data, `${id} settings after boot`).toEqual(expected);
    }
  } finally {
    await electronApp.close();
  }
  expect(readConfig(userDataDir).modules).toMatchObject(LEGACY_MODULE_SETTINGS);
});

test('a disk plugin loads schema defaults and keeps an update across restart', async () => {
  const userDataDir = mkUserDataDir({});

  let electronApp = await launchElectronApp({ userDataDir });
  try {
    const win = await waitForProbeWindow(electronApp);
    expect(await win.evaluate(() => globalThis.__zod4Probe.hasPrefault), 'plugins must receive zod 4').toBe(true);
    expect(await win.evaluate(() => globalThis.__zod4Probe.getSettings())).toEqual({
      color: '#ff4d4f',
      size: 12,
      mode: 'outline',
      enabled: true,
    });
    await win.evaluate(() => globalThis.__zod4Probe.update({ size: 30, mode: 'fill' }));
  } finally {
    await electronApp.close();
  }

  electronApp = await launchElectronApp({ userDataDir });
  try {
    const win = await waitForProbeWindow(electronApp);
    expect(await win.evaluate(() => globalThis.__zod4Probe.getSettings())).toEqual({
      color: '#ff4d4f',
      size: 30,
      mode: 'fill',
      enabled: true,
    });
  } finally {
    await electronApp.close();
  }
});
