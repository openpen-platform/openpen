/**
 * Runs settings-store against a real userData directory (no fs mocks) to check
 * what lands on disk when a migration changes values: the original bytes in
 * backups/, the config file untouched on load, then rewritten by a save.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { userDataRef, logWarn } = vi.hoisted(() => ({ userDataRef: { dir: '' }, logWarn: vi.fn() }));

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => userDataRef.dir), getLocale: vi.fn(() => 'en-US'), on: vi.fn(), quit: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { handle: vi.fn(), on: vi.fn() },
  nativeTheme: { themeSource: 'system', shouldUseDarkColors: false, on: vi.fn() },
}));
vi.mock('electron-log/main.js', () => ({ default: { warn: logWarn, info: vi.fn(), error: vi.fn() } }));
vi.mock('../../electron/i18n/index.js', () => ({ setLocale: vi.fn() }));
vi.mock('../../electron/tray-manager.js', () => ({ refreshTrayLocale: vi.fn() }));
vi.mock('../../electron/ipc-channels.js', () => ({
  SETTINGS: { GET: 'a', GET_LOCALE: 'b', SET: 'c', UPDATED: 'd', LOCALE_CHANGED: 'e', PREVIEW: 'f', REVERT: 'g' },
  LAYOUT: { GET: 'h', SET: 'i', REPAIR: 'j', UPDATED: 'k' },
  SHORTCUTS: { GET: 'l', SET: 'm', RESET: 'n', UPDATED: 'o' },
  MODULE: { SETTINGS_GET: 'p', SETTINGS_SET: 'q', SETTINGS_CHANGED: 'r' },
}));

import { initSettingsStore, updateSettings, flushWrites, getConfigPath } from '../../electron/settings-store.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'config-snapshots');
const LEGACY = fs.readFileSync(path.join(FIXTURES, 'config-legacy-values.json'), 'utf-8');

const created = [];
function freshUserData() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-settings-'));
  created.push(dir);
  userDataRef.dir = dir;
  fs.writeFileSync(getConfigPath(), LEGACY, 'utf-8');
  return dir;
}

// Remove only the temp directories this file created itself.
afterAll(() => {
  for (const dir of created) fs.rmSync(dir, { recursive: true, force: true });
});

describe('backup before a value-changing migration, on a real disk', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the original bytes in backups/, leaves config.json alone on load, then saves the new form', async () => {
    const dir = freshUserData();
    initSettingsStore();
    await flushWrites();

    const backups = fs.readdirSync(path.join(dir, 'backups')).filter((n) => n.endsWith('.bak'));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, 'backups', backups[0]), 'utf-8')).toBe(LEGACY);
    expect(fs.readFileSync(getConfigPath(), 'utf-8')).toBe(LEGACY);

    updateSettings({ theme: 'dark' });
    await flushWrites();
    const saved = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'));
    expect(saved).toMatchObject({ configVersion: 1, language: 'zh-Hant', barLayout: 'horizontal', reducedMotion: true, theme: 'dark' });
    expect(saved).not.toHaveProperty('animations');
    expect(fs.readFileSync(path.join(dir, 'backups', backups[0]), 'utf-8')).toBe(LEGACY);
  });

  it('a failed backup is retried before the first save; if it still fails the save goes ahead and is logged', async () => {
    // Block backups/ with a plain file so the backup cannot be written.
    const dir = freshUserData();
    fs.writeFileSync(path.join(dir, 'backups'), 'not a directory', 'utf-8');
    initSettingsStore();
    await flushWrites();
    expect(fs.readFileSync(getConfigPath(), 'utf-8')).toBe(LEGACY);

    // Unblock before the first save: the retry lands and the original is kept.
    fs.rmSync(path.join(dir, 'backups'));
    updateSettings({ theme: 'dark' });
    await flushWrites();
    const [bak] = fs.readdirSync(path.join(dir, 'backups')).filter((n) => n.endsWith('.bak'));
    expect(fs.readFileSync(path.join(dir, 'backups', bak), 'utf-8')).toBe(LEGACY);
    expect(JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8')).configVersion).toBe(1);
    expect(logWarn).not.toHaveBeenCalledWith(expect.stringContaining('without a pre-migration backup'));

    // Still blocked at save time: settings stay writable, the gap is logged.
    const dir2 = freshUserData();
    fs.writeFileSync(path.join(dir2, 'backups'), 'not a directory', 'utf-8');
    initSettingsStore();
    updateSettings({ theme: 'dark' });
    await flushWrites();
    expect(JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8')).theme).toBe('dark');
    expect(logWarn).toHaveBeenCalledWith(expect.stringContaining('without a pre-migration backup'));
  });
});
