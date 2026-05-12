import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  app: { getAppPath: vi.fn(() => '/tmp/test-app') },
  ipcMain: { handle: vi.fn() },
}));

import { resolveAppConfig } from '../../electron/config-loader.js';

describe('resolveAppConfig', () => {
  it('merges valid overrides', () => {
    const { config, warnings, errors } = resolveAppConfig({
      ui: {
        eraser: { caretDirectionMode: 'down' },
        popup: { gapPx: 14 },
      },
      interaction: {
        drag: { thresholdPx: 6 },
      },
      electron: {
        window: { mainAlwaysOnTopRelativeLevel: 2 },
        devtools: {
          enabled: false,
          openMainWindow: false,
          openOverlayWindow: true,
          openSettingsWindow: false,
        },
      },
      dev: { strictConfig: true },
    });

    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(config.ui.eraser.caretDirectionMode).toBe('down');
    expect(config.ui.popup.gapPx).toBe(14);
    expect(config.interaction.drag.thresholdPx).toBe(6);
    expect(config.electron.window.mainAlwaysOnTopRelativeLevel).toBe(2);
    expect(config.electron.devtools.enabled).toBe(false);
    expect(config.electron.devtools.openMainWindow).toBe(false);
    expect(config.electron.devtools.openOverlayWindow).toBe(true);
    expect(config.electron.devtools.openSettingsWindow).toBe(false);
    expect(config.dev.strictConfig).toBe(true);
  });

  it('warns and ignores unknown keys', () => {
    const { config, warnings } = resolveAppConfig({
      ui: {
        unknownBlock: { enabled: true },
      },
    });

    expect(config.ui.eraser.caretDirectionMode).toBe('directional');
    expect(warnings.some((w) => w.includes('ui.unknownBlock'))).toBe(true);
  });

  it('falls back when enum is invalid and reports error', () => {
    const { config, errors } = resolveAppConfig({
      ui: {
        eraser: { caretDirectionMode: 'sideways' },
      },
    });

    expect(config.ui.eraser.caretDirectionMode).toBe('directional');
    expect(errors.some((e) => e.includes('ui.eraser.caretDirectionMode'))).toBe(true);
  });

  it('falls back when numeric value is out of range', () => {
    const { config, warnings } = resolveAppConfig({
      interaction: {
        drag: { snapDurationMs: 99999 },
      },
    });

    expect(config.interaction.drag.snapDurationMs).toBe(250);
    expect(warnings.some((w) => w.includes('interaction.drag.snapDurationMs'))).toBe(true);
  });

  it('falls back when boolean value type is invalid and reports error', () => {
    const { config, errors } = resolveAppConfig({
      electron: {
        devtools: { enabled: 'nope' },
      },
    });

    expect(config.electron.devtools.enabled).toBe(false);
    expect(errors.some((e) => e.includes('electron.devtools.enabled'))).toBe(true);
  });
});
