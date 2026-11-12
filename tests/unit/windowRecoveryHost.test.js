import { describe, it, expect, vi, beforeEach } from 'vitest';

const updateSettings = vi.fn();
const flushWrites = vi.fn().mockResolvedValue(undefined);
let currentDisabled = [];
let installed = [];

vi.mock('electron', () => ({ app: { relaunch: vi.fn(), exit: vi.fn() }, dialog: {} }));
vi.mock('electron-log/main.js', () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../electron/i18n/index.js', () => ({ t: (k) => k }));
vi.mock('../../electron/settings-store.js', () => ({
  getSettings: () => ({ disabledModules: currentDisabled }),
  updateSettings: (...a) => updateSettings(...a),
  flushWrites: () => flushWrites(),
}));
vi.mock('../../electron/module-manifest-loader.js', () => ({
  getInstalledPluginIds: () => installed,
}));

const { disableAllInstalledPlugins } = await import('../../electron/window-recovery-host.js');

describe('disableAllInstalledPlugins', () => {
  beforeEach(() => {
    updateSettings.mockClear();
    flushWrites.mockClear();
  });

  it('persists every installed plugin as disabled, keeping modules already disabled, then flushes', async () => {
    // Rules out a restart that still loads a plugin, or that drops the user's earlier toggles.
    currentDisabled = ['@openpen/line'];
    installed = ['@openpen/arrow', '@vendor/thing'];
    const ids = await disableAllInstalledPlugins();
    expect(ids).toEqual(['@openpen/arrow', '@vendor/thing']);
    expect(updateSettings).toHaveBeenCalledWith({
      disabledModules: ['@openpen/line', '@openpen/arrow', '@vendor/thing'],
    });
    expect(flushWrites).toHaveBeenCalledTimes(1);
  });

  it('writes only the disabled-modules setting, so plugin files and settings stay untouched', async () => {
    currentDisabled = [];
    installed = ['@vendor/thing'];
    await disableAllInstalledPlugins();
    expect(Object.keys(updateSettings.mock.calls[0][0])).toEqual(['disabledModules']);
  });
});
