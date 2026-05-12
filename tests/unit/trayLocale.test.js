/**
 * Unit tests for tray-manager.js locale integration.
 *
 * Verifies that tray context-menu labels reflect the active i18n locale
 * after setLocale() + refreshTrayLocale() are called.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock electron ──
const mockSetContextMenu = vi.fn();
const mockIsDestroyed = vi.fn(() => false);

vi.mock('electron', () => ({
  Tray: vi.fn().mockImplementation(() => ({
    setToolTip: vi.fn(),
    setImage: vi.fn(),
    setContextMenu: mockSetContextMenu,
    isDestroyed: mockIsDestroyed,
    destroy: vi.fn(),
  })),
  Menu: {
    buildFromTemplate: vi.fn((template) => ({ template })),
  },
  nativeImage: {
    createFromBuffer: vi.fn(() => ({
      setTemplateImage: vi.fn(),
    })),
  },
  app: {
    dock: { hide: vi.fn() },
    quit: vi.fn(),
  },
}));

import { initI18n, setLocale } from '../../electron/i18n/index.js';
import { initTrayManager, refreshTrayLocale, destroyTray } from '../../electron/tray-manager.js';

// ── helpers ──

/**
 * Extract the labels from the most recent setContextMenu call.
 * @returns {string[]}
 */
function getLastMenuLabels() {
  const lastCall = mockSetContextMenu.mock.calls.at(-1);
  if (!lastCall) return [];
  const menu = lastCall[0];
  // Menu.buildFromTemplate returns { template } in our mock.
  return (menu.template ?? [])
    .filter((item) => item.label !== undefined)
    .map((item) => item.label);
}

describe('tray menu locale', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    destroyTray();
    // Ensure i18n bundles are loaded with English as base.
    await initI18n('en');
  });

  it('English: first item is "Show Control Bar" (initial state, main hidden)', async () => {
    // Control bar starts visible (isMainVisible = true internally).
    // After initTrayManager the first item is "Hide Control Bar".
    initTrayManager({
      onShowMain: vi.fn(),
      onHideMain: vi.fn(),
      onOpenSettings: vi.fn(),
    });

    const labels = getLastMenuLabels();
    // isMainVisible starts true → first label should be hideControlBar.
    // Template: [hideShow, preferences, (separator filtered out), quit]
    expect(labels[0]).toBe('Hide Control Bar');
    expect(labels[1]).toBe('Preferences…');
    expect(labels[2]).toBe('Quit OpenPen');
  });

  it('after setLocale("zh-Hant") + refreshTrayLocale(), labels switch to Traditional Chinese', async () => {
    initTrayManager({
      onShowMain: vi.fn(),
      onHideMain: vi.fn(),
      onOpenSettings: vi.fn(),
    });

    setLocale('zh-Hant');
    refreshTrayLocale();

    const labels = getLastMenuLabels();
    expect(labels[0]).toBe('隱藏控制列');
    expect(labels[1]).toBe('偏好設定…');
    expect(labels[2]).toBe('結束 OpenPen');
  });

  it('after setLocale("ja") + refreshTrayLocale(), labels switch to Japanese', async () => {
    initTrayManager({
      onShowMain: vi.fn(),
      onHideMain: vi.fn(),
      onOpenSettings: vi.fn(),
    });

    setLocale('ja');
    refreshTrayLocale();

    const labels = getLastMenuLabels();
    expect(labels[0]).toBe('コントロールバーを隠す');
    expect(labels[1]).toBe('環境設定…');
    expect(labels[2]).toBe('OpenPen を終了');
  });
});
