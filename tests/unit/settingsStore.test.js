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

// Mock electron-log, the project logger that feeds main.log.
const { logWarn, logInfo, logError } = vi.hoisted(() => ({
  logWarn: vi.fn(), logInfo: vi.fn(), logError: vi.fn(),
}));
vi.mock('electron-log/main.js', () => ({
  default: { warn: logWarn, info: logInfo, error: logError },
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
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const fsActual = (await vi.importActual('node:fs')).default;
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
  getModuleSettings,
  getModuleShortcuts,
  getShortcuts,
  getLayout,
  writeBackup,
  repairLayoutWithKnownIds,
} from '../../electron/settings-store.js';
import { app } from 'electron';
import { CURRENT_CONFIG_VERSION } from '../../electron/settings-migrations.js';

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
    setModuleShortcut('my-mod/doStuff', 'CommandOrControl+B');
    await flushWrites();

    await setModuleSettings('my-mod', { foo: 1 }, 1);

    expect(writtenJson).not.toBeNull();
    const onDisk = JSON.parse(writtenJson);
    expect(onDisk.moduleShortcuts).toEqual({ 'my-mod/doStuff': 'CommandOrControl+B' });
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

describe('config versioning', () => {
  const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'config-snapshots');
  const realFs = fsActual;
  const fixture = (name) => realFs.readFileSync(path.join(FIXTURES, name), 'utf-8');

  let writtenJson = null;

  beforeEach(() => {
    vi.clearAllMocks();
    writtenJson = null;
    fs.existsSync.mockReturnValue(false);
    fs.writeSync.mockImplementation((_fd, data) => { writtenJson = data; });
    fs.readdirSync = vi.fn(() => { throw new Error('ENOENT'); });
  });

  it.each([
    'config-v1.0.0-to-v1.2.0.json',
    'config-v1.3.0-to-v1.4.3.json',
    'config-v1.5.0.json',
    'config-legacy-values.json',
  ])('loads %s with the user values intact', (name) => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(fixture(name));
    initSettingsStore();
    const s = getSettings();
    expect(s).toMatchObject({ ballOpacity: expect.any(Number), disabledModules: ['@acme/example'] });
    expect(getModuleSettings('@openpen/freehand')).toEqual({ data: { smoothing: 0.7 }, schemaVersion: 2 });
    expect(getModuleShortcuts()).toEqual({ '@openpen/freehand:select': 'CommandOrControl+Alt+F' });
    expect(getShortcuts()).toMatchObject(JSON.parse(fixture(name)).userShortcuts);
    expect(getLayout().groups.map((g) => g.id)).toContain('default');
  });

  it('applies the legacy-value migrations to the loaded settings', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(fixture('config-legacy-values.json'));
    initSettingsStore();
    expect(getSettings()).toMatchObject({ language: 'zh-Hant', barLayout: 'horizontal', reducedMotion: true, theme: 'light' });
  });

  it('skips the backup when the newest backup already holds the same bytes', () => {
    const raw = fixture('config-legacy-values.json');
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(raw);
    fs.readdirSync = vi.fn(() => ['config.json.2026-01-01T00-00-00.000Z.bak']);
    initSettingsStore();
    expect(fs.writeFileSync).not.toHaveBeenCalledWith(expect.stringContaining('.bak.tmp'), raw, 'utf-8');
  });

  it('migrating a legacy file backs up the original bytes, a current-form file does not', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(fixture('config-v1.5.0.json'));
    initSettingsStore();
    expect(fs.renameSync).not.toHaveBeenCalled();

    fs.readFileSync.mockReturnValue(fixture('config-legacy-values.json'));
    initSettingsStore();
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.bak.tmp'), fixture('config-legacy-values.json'), 'utf-8');
    // The config file itself is not rewritten on load.
    expect(fs.openSync).not.toHaveBeenCalledWith(expect.stringContaining('config.json.tmp'), 'w');
  });

  it('writes configVersion as the first top-level key when saving', async () => {
    initSettingsStore();
    updateSettings({ theme: 'dark' });
    await flushWrites();
    const onDisk = JSON.parse(writtenJson);
    expect(Object.keys(onDisk)[0]).toBe('configVersion');
    expect(onDisk.configVersion).toBe(CURRENT_CONFIG_VERSION);
  });

  it('leaves a config from a newer app untouched and logs it', async () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ configVersion: CURRENT_CONFIG_VERSION + 1, theme: 'light' }));
    initSettingsStore();
    expect(getSettings().theme).toBe('light');
    // The project logger writes main.log; console output alone never reaches it.
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('newer'));

    updateSettings({ theme: 'dark' });
    await setModuleSettings('my-mod', { a: 1 }, 1);
    await flushWrites();
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Skipped writing config.json'));
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Skipped writing module settings'));
    expect(fs.openSync).not.toHaveBeenCalled();
    expect(fs.renameSync).not.toHaveBeenCalled();
    expect(getSettings().theme).toBe('dark'); // in-memory edits still apply
  });
});

describe('corruption recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fs.existsSync.mockReturnValue(true);
    fs.readdirSync = vi.fn(() => { throw new Error('ENOENT'); });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('unparseable JSON resets everything to defaults and backs up the raw bytes', () => {
    fs.readFileSync.mockReturnValue('{"theme": "light", BROKEN');
    initSettingsStore();
    expect(getSettings().theme).toBe('system');
    expect(getLayout().groups).toHaveLength(1);
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('.bak.tmp'), '{"theme": "light", BROKEN', 'utf-8');
  });

  it('an invalid controlBarLayout resets only the layout and backs up the file', () => {
    const raw = JSON.stringify({ theme: 'light', controlBarLayout: { version: 1, groups: 'nope' } });
    fs.readFileSync.mockReturnValue(raw);
    initSettingsStore();
    expect(getSettings().theme).toBe('light');
    expect(getLayout().groups).toEqual([{ id: 'default', items: [], separator: 'auto' }]);
    expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringContaining('.bak.tmp'), raw, 'utf-8');
  });
});

describe('settings access failures reach the file logger', () => {
  const layoutWithoutToolsInset = { version: 1, groups: [{ id: 'default', items: [] }, { id: 'tools', items: [] }] };

  beforeEach(() => {
    vi.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    fs.readdirSync = vi.fn(() => { throw new Error('ENOENT'); });
  });

  it('logs a write queue error', async () => {
    initSettingsStore();
    await flushWrites(); // drain the first-launch write so the injected failure hits the write under test
    updateSettings({ theme: 'dark' });
    app.getPath.mockImplementationOnce(() => { throw new Error('userData unavailable'); });
    await flushWrites();
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Write queue error'), 'userData unavailable');
  });

  it('logs a failed backup write', () => {
    fs.mkdirSync.mockImplementationOnce(() => { throw new Error('EACCES'); });
    writeBackup('{}');
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to write backup'), 'EACCES');
  });

  it('logs a layout that fails validation', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ controlBarLayout: { version: 1, groups: 'nope' } }));
    initSettingsStore();
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('failed validation (L2)'));
  });

  it('logs L3a layout repairs on load', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ controlBarLayout: layoutWithoutToolsInset }));
    initSettingsStore();
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('L3a'));
  });

  it('logs a config.json read failure', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('{ BROKEN');
    initSettingsStore();
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('Failed to read config.json (L1)'), expect.any(String));
  });

  it('logs a config.json write failure', async () => {
    initSettingsStore();
    await flushWrites(); // drain the first-launch write so the injected failure hits the write under test
    fs.openSync.mockImplementationOnce(() => { throw new Error('ENOSPC'); });
    updateSettings({ theme: 'dark' });
    await flushWrites();
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to write config.json'), 'ENOSPC');
  });

  it('logs L3b layout repairs', () => {
    const items = Array.from({ length: 20 }, (_, i) => `ghost-${i}`);
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ controlBarLayout: { version: 1, groups: [{ id: 'default', items, separator: 'auto' }] } }));
    initSettingsStore();
    logInfo.mockClear();
    repairLayoutWithKnownIds([]);
    expect(logInfo).toHaveBeenCalledWith(expect.stringContaining('L3b'));
  });

  it('logs a module settings write failure', async () => {
    initSettingsStore();
    await flushWrites(); // drain the first-launch write so the injected failure hits the write under test
    fs.openSync.mockImplementationOnce(() => { throw new Error('EIO'); });
    await expect(setModuleSettings('my-mod', { a: 1 }, 1)).rejects.toThrow('EIO');
    expect(logError).toHaveBeenCalledWith(expect.stringContaining('Failed to write module settings'), 'EIO');
  });
});
