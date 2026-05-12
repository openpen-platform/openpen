/**
 * Unit tests for settings-store.js
 *
 * Focus:
 * 1. Default-value structure
 * 2. updateSettings merges patches correctly
 * 3. getSettings returns effectiveTheme
 * 4. writeConfig / readConfig use atomic writes (verified via fs mocks)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock electron modules ──
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-userdata'),
    getLocale: vi.fn(() => 'en-US'),
    on: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn(),
  },
  nativeTheme: {
    themeSource: 'system',
    shouldUseDarkColors: false,
    on: vi.fn(),
  },
}));

// ── mock node:fs ──
vi.mock('node:fs', () => ({
  default: {
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    openSync: vi.fn(() => 3),
    writeSync: vi.fn(),
    fsyncSync: vi.fn(),
    closeSync: vi.fn(),
    renameSync: vi.fn(),
    unlinkSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}));

// ── mock i18n/index.js ──
vi.mock('../../electron/i18n/index.js', () => ({
  setLocale: vi.fn(),
}));

// ── mock tray-manager.js ──
vi.mock('../../electron/tray-manager.js', () => ({
  refreshTrayLocale: vi.fn(),
}));

// ── mock ipc-channels.js ──
vi.mock('../../electron/ipc-channels.js', () => ({
  SETTINGS: {
    GET: 'settings:get',
    GET_LOCALE: 'settings:get-locale',
    SET: 'settings:set',
    UPDATED: 'settings:updated',
    LOCALE_CHANGED: 'settings:locale-changed',
    PREVIEW: 'settings:preview',
    REVERT: 'settings:revert',
  },
  LAYOUT: {
    GET: 'layout:get',
    SET: 'layout:set',
    REPAIR: 'layout:repair',
    UPDATED: 'layout:updated',
  },
  SHORTCUTS: {
    GET: 'shortcuts:get',
    SET: 'shortcuts:set',
    RESET: 'shortcuts:reset',
    UPDATED: 'shortcuts:updated',
  },
  MODULE: {
    SETTINGS_GET: 'module:settings-get',
    SETTINGS_SET: 'module:settings-set',
    SETTINGS_CHANGED: 'module:settings-changed',
  },
}));

import fs from 'node:fs';
import {
  DEFAULT_SETTINGS,
  getConfigPath,
  getSettings,
  getSetting,
  updateSettings,
  initSettingsStore,
  getEffectiveTheme,
  resolveSystemLanguage,
  flushWrites,
  previewSettings,
  revertSettings,
  setModuleShortcut,
  setModuleSettings,
} from '../../electron/settings-store.js';

describe('DEFAULT_SETTINGS', () => {
  it('contains every required field', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({
      theme: 'system',
      language: 'en',
      autoCollapseDelay: 3000,
      ballOpacity: 0.85,
      defaultColor: '#818CF8',
    });
  });
});

describe('initSettingsStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
  });

  it('on first launch, picks the OS language and persists to config.json', async () => {
    initSettingsStore();
    const s = getSettings();
    expect(s.theme).toBe('system');
    expect(s.language).toBe('en');
    expect(s.ballOpacity).toBe(0.85);
    // First-launch write is enqueued; flush before asserting.
    await flushWrites();
    expect(fs.openSync).toHaveBeenCalled();
  });

  it('merges values from config.json over defaults', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({
      theme: 'light',
      language: 'en',
      autoCollapseDelay: 5000,
    }));
    initSettingsStore();
    const s = getSettings();
    expect(s.theme).toBe('light');
    expect(s.language).toBe('en');
    expect(s.autoCollapseDelay).toBe(5000);
    // Keys not present in the file keep their default.
    expect(s.defaultColor).toBe('#818CF8');
  });

  it('falls back to defaults when config.json is malformed', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('NOT_VALID_JSON{{{');
    initSettingsStore();
    const s = getSettings();
    expect(s.theme).toBe('system');
  });
});

describe('getSettings / getSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    initSettingsStore();
  });

  it('getSettings returns effectiveTheme', () => {
    const s = getSettings();
    expect(s.effectiveTheme).toMatch(/^(light|dark)$/);
  });

  it('getSetting returns the value for a given key', () => {
    expect(getSetting('language')).toBe('en');
  });
});

describe('updateSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    initSettingsStore();
  });

  it('merges the patch into the cache', () => {
    updateSettings({ language: 'en', ballOpacity: 0.5 });
    expect(getSetting('language')).toBe('en');
    expect(getSetting('ballOpacity')).toBe(0.5);
  });

  it('does not affect other keys', () => {
    updateSettings({ language: 'ja' });
    expect(getSetting('theme')).toBe('system');
    expect(getSetting('defaultColor')).toBe('#818CF8');
  });

  it('writes atomically: .tmp file first, then rename with fsync', async () => {
    updateSettings({ language: 'en' });
    await flushWrites();
    expect(fs.openSync).toHaveBeenCalledWith(expect.stringContaining('.tmp'), 'w');
    expect(fs.fsyncSync).toHaveBeenCalled();
    expect(fs.renameSync).toHaveBeenCalled();
  });

  it('broadcasts to all windows', async () => {
    const { BrowserWindow } = await import('electron');
    const mockSend = vi.fn();
    BrowserWindow.getAllWindows.mockReturnValue([
      { isDestroyed: () => false, webContents: { send: mockSend } },
    ]);
    updateSettings({ theme: 'dark' });
    expect(mockSend).toHaveBeenCalledWith('settings:updated', expect.objectContaining({ theme: 'dark' }));
  });

  it('broadcasts locale-changed when the language changes', async () => {
    const { BrowserWindow } = await import('electron');
    const mockSend = vi.fn();
    BrowserWindow.getAllWindows.mockReturnValue([
      { isDestroyed: () => false, webContents: { send: mockSend } },
    ]);
    updateSettings({ language: 'en' });
    expect(mockSend).toHaveBeenCalledWith('settings:locale-changed', 'en');
    expect(mockSend).toHaveBeenCalledWith('settings:updated', expect.objectContaining({ language: 'en' }));
  });
});

describe('getEffectiveTheme', () => {
  it('theme=system follows nativeTheme.shouldUseDarkColors', async () => {
    const { nativeTheme } = await import('electron');
    vi.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    initSettingsStore();

    nativeTheme.shouldUseDarkColors = false;
    expect(getEffectiveTheme()).toBe('light');

    nativeTheme.shouldUseDarkColors = true;
    expect(getEffectiveTheme()).toBe('dark');
  });

  it('theme=light always returns light', () => {
    updateSettings({ theme: 'light' });
    expect(getEffectiveTheme()).toBe('light');
  });

  it('theme=dark always returns dark', () => {
    updateSettings({ theme: 'dark' });
    expect(getEffectiveTheme()).toBe('dark');
  });
});

describe('getConfigPath', () => {
  it('returns the userData/config.json path', () => {
    const p = getConfigPath();
    expect(p).toContain('config.json');
    expect(p).toContain('test-userdata');
  });
});

describe('previewSettings + writeConfig race: disk integrity', () => {
  // writeConfig must snapshot the cache synchronously at call time. Otherwise
  // a previewSettings call that mutates the in-memory cache between enqueue
  // and async write would bleed the preview value into config.json on disk.

  let writtenJson = null;

  beforeEach(() => {
    vi.clearAllMocks();
    writtenJson = null;
    fs.existsSync.mockReturnValue(false);
    // Intercept writeSync to capture the serialized JSON.
    fs.writeSync.mockImplementation((_fd, data) => { writtenJson = data; });
    initSettingsStore();
  });

  it('a previewSettings call after writeConfig is enqueued does not corrupt the write', async () => {
    // Simulate: user opens Settings, some unrelated operation (e.g. layout change)
    // enqueues a writeConfig. Before the write actually executes, the watcher fires
    // previewSettings with enableDragAutoSnap=false. The enqueued write must use
    // the pre-preview snapshot (enableDragAutoSnap=true), not the mutated cache.
    updateSettings({ enableDragAutoSnap: true });  // baseline save: disk has true

    // Enqueue a second write (simulates a setLayout or setShortcut call).
    // This is the write that must NOT pick up the preview mutation.
    updateSettings({ ballOpacity: 0.9 });

    // Now simulate previewSettings arriving before the queued write executes.
    // In production this races with the async write-queue execution.
    previewSettings({ enableDragAutoSnap: false });

    // Flush the write queue. The queued write should have snapshotted
    // enableDragAutoSnap=true at enqueue time, so disk must not have false.
    await flushWrites();

    expect(writtenJson).not.toBeNull();
    const written = JSON.parse(writtenJson);
    expect(written.enableDragAutoSnap).toBe(true);
    // After flush, in-memory cache still reflects the preview (false).
    // Revert must restore it to the correct disk value.
    expect(getSettings().enableDragAutoSnap).toBe(false); // preview still in cache
    revertSettings();
    expect(getSettings().enableDragAutoSnap).toBe(true);  // after revert, correct
  });

  it('revertSettings after a preview restores the correct value from disk', async () => {
    // Confirm that revert always reads a clean disk (not a preview-corrupted one).
    updateSettings({ enableDragAutoSnap: true });
    await flushWrites();
    // Reset writeSync capture for the upcoming revert-triggered write.
    writtenJson = null;

    previewSettings({ enableDragAutoSnap: false });
    expect(getSettings().enableDragAutoSnap).toBe(false);

    // Mock readFileSync so revertSettings reads back the clean value from "disk".
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ enableDragAutoSnap: true }));

    revertSettings();
    expect(getSettings().enableDragAutoSnap).toBe(true);
  });
});

describe('setModuleSettings preserves every persisted section', () => {
  // All write paths must serialise the full on-disk JSON shape; otherwise a
  // setModuleSettings call after a moduleShortcut write would wipe the
  // moduleShortcuts section from disk and the override would be lost on
  // restart.

  let writtenJson = null;

  beforeEach(() => {
    vi.clearAllMocks();
    writtenJson = null;
    fs.existsSync.mockReturnValue(false);
    fs.writeSync.mockImplementation((_fd, data) => { writtenJson = data; });
    initSettingsStore();
  });

  it('writes moduleShortcuts to disk after a setModuleSettings call', async () => {
    setModuleShortcut('my-mod:doStuff', 'CommandOrControl+B');
    await flushWrites();

    await setModuleSettings('my-mod', { foo: 1 }, 1);

    expect(writtenJson).not.toBeNull();
    const onDisk = JSON.parse(writtenJson);
    expect(onDisk.moduleShortcuts).toEqual({ 'my-mod:doStuff': 'CommandOrControl+B' });
    expect(onDisk.modules).toEqual({ 'my-mod': { foo: 1 } });
  });
});

describe('resolveSystemLanguage', () => {
  it('passes through an exact supported tag', () => {
    expect(resolveSystemLanguage('en')).toBe('en');
    expect(resolveSystemLanguage('zh-Hans')).toBe('zh-Hans');
    expect(resolveSystemLanguage('zh-Hant')).toBe('zh-Hant');
    expect(resolveSystemLanguage('ja')).toBe('ja');
  });

  it('maps Chinese script/region tags correctly via Intl.Locale.maximize()', () => {
    expect(resolveSystemLanguage('zh-Hans-CN')).toBe('zh-Hans');
    expect(resolveSystemLanguage('zh-Hant-TW')).toBe('zh-Hant');
    expect(resolveSystemLanguage('zh-HK')).toBe('zh-Hant');
    expect(resolveSystemLanguage('zh-SG')).toBe('zh-Hans');
    expect(resolveSystemLanguage('zh-TW')).toBe('zh-Hant');
    expect(resolveSystemLanguage('zh-CN')).toBe('zh-Hans');
  });

  it('collapses regional English and Japanese', () => {
    expect(resolveSystemLanguage('en-US')).toBe('en');
    expect(resolveSystemLanguage('en-GB')).toBe('en');
    expect(resolveSystemLanguage('ja-JP')).toBe('ja');
  });

  it('falls back to en for unsupported locales or bad input', () => {
    expect(resolveSystemLanguage('fr-FR')).toBe('en');
    expect(resolveSystemLanguage('de')).toBe('en');
    expect(resolveSystemLanguage('ko-KR')).toBe('en');
    expect(resolveSystemLanguage('')).toBe('en');
    expect(resolveSystemLanguage(undefined)).toBe('en');
  });
});
