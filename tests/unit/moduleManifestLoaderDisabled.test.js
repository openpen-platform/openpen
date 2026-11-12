import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const handlers = new Map();
let disabled = [];

vi.mock('electron', () => ({
  app: { getVersion: () => '9.9.9', getPath: () => os.tmpdir() },
  ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) },
}));
vi.mock('../../electron/plugin-meta-manager.js', () => ({
  ensurePluginInstalledAt: vi.fn(),
  getPluginInstalledAt: () => null,
}));
vi.mock('../../electron/settings-store.js', () => ({
  getSettings: () => ({ disabledModules: disabled }),
}));

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-loader-'));
const pluginDir = path.join(home, '.openpen', 'plugins', '@vendor', 'thing');
const mainPath = path.join(pluginDir, 'main.mjs');
const mainExecuted = vi.fn();

beforeAll(() => {
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, 'plugin.json'),
    JSON.stringify({ id: '@vendor/thing', name: 'Thing', version: '1.0.0', main: 'main.mjs' }),
  );
  fs.writeFileSync(mainPath, 'export default {};\n');
  // Stand in for the plugin's main entry: running the factory = running the plugin's code.
  vi.doMock(`file://${mainPath}`, () => {
    mainExecuted();
    return { default: { handlers: { ping: () => 'pong' } } };
  });
  process.env.HOME = home;
  disabled = ['@vendor/thing'];
});

describe('module manifest loader: disabled plugins', () => {
  it('does not execute the main entry of a disabled plugin, and loads it once re-enabled', async () => {
    // Rules out a "disabled" plugin still running its main-process code, and a
    // re-enabled plugin staying dead until the app is restarted.
    const { initModuleManifestLoader, getInstalledPluginIds } = await import('../../electron/module-manifest-loader.js');
    await initModuleManifestLoader();
    expect(getInstalledPluginIds()).toEqual(['@vendor/thing']);
    expect(mainExecuted).not.toHaveBeenCalled();

    const call = handlers.get('module:call-handler');
    await expect(call({}, { moduleId: '@vendor/thing', action: 'ping', payload: null })).rejects.toThrow(/No main handlers/);
    expect(mainExecuted).not.toHaveBeenCalled();

    disabled = [];
    await expect(call({}, { moduleId: '@vendor/thing', action: 'ping', payload: null })).resolves.toBe('pong');
    expect(mainExecuted).toHaveBeenCalledTimes(1);
  });
});
