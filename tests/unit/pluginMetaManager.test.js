/**
 * Unit tests for electron/plugin-meta-manager.js
 *
 * Cases:
 * 1. Sidecar missing → getAllPluginMeta() returns {}.
 * 2. Invalid JSON → silent reset to {}.
 * 3. ensurePluginInstalledAt writes a new ISO entry, returns the ISO string.
 * 4. Calling ensurePluginInstalledAt twice returns the SAME timestamp (no rewrite).
 *    Verify fs.openSync was called exactly once across both calls.
 * 5. getPluginInstalledAt('unknown') returns null.
 * 6. Persisted entries from a previous session load correctly on init.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock electron ──
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-userdata-meta'),
    on: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
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

// ── mock ipc-channels.js ──
vi.mock('../../electron/ipc-channels.js', () => ({
  PLUGIN_META: {
    GET_ALL: 'plugin-meta:get-all',
  },
}));

// ── mock fs-utils.js ──
vi.mock('../../electron/fs-utils.js', () => ({
  fsyncDir: vi.fn(),
}));

// ── mock plugin-id-validator.js ──
vi.mock('../../electron/plugin-id-validator.js', () => ({
  MODULE_ID_RE: /^@([a-z0-9][a-z0-9-]{0,38})\/([a-z0-9][a-z0-9-]{0,38})$/,
  isValidPluginId: (id) =>
    typeof id === 'string' &&
    /^@([a-z0-9][a-z0-9-]{0,38})\/([a-z0-9][a-z0-9-]{0,38})$/.test(id),
}));

import fs from 'node:fs';
import {
  initPluginMetaManager,
  getAllPluginMeta,
  getPluginInstalledAt,
  ensurePluginInstalledAt,
} from '../../electron/plugin-meta-manager.js';

beforeEach(() => {
  vi.clearAllMocks();
  // Sidecar missing by default.
  fs.existsSync.mockReturnValue(false);
  initPluginMetaManager();
});

// ── 1. Empty state when sidecar is missing ────────────────────────────────────

describe('getAllPluginMeta', () => {
  it('returns {} when plugin-meta.json does not exist', () => {
    expect(getAllPluginMeta()).toEqual({});
  });
});

// ── 2. Invalid JSON → silent reset ───────────────────────────────────────────

describe('invalid sidecar', () => {
  it('silently resets to {} when plugin-meta.json contains invalid JSON', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('not valid json {{{');
    initPluginMetaManager();
    expect(getAllPluginMeta()).toEqual({});
  });

  it('silently resets to {} when plugin-meta.json contains a JSON array (wrong shape)', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('[]');
    initPluginMetaManager();
    expect(getAllPluginMeta()).toEqual({});
  });
});

// ── 3. ensurePluginInstalledAt writes a new entry ────────────────────────────

describe('ensurePluginInstalledAt', () => {
  it('writes a new ISO8601 entry and returns it', () => {
    const result = ensurePluginInstalledAt('@openpen/my-plugin');
    // Must be a valid ISO string.
    expect(new Date(result).toISOString()).toBe(result);
    // Must be persisted in memory.
    expect(getAllPluginMeta()).toEqual({ '@openpen/my-plugin': { installedAt: result } });
    // Must have triggered an atomic write (openSync called once for .tmp).
    expect(fs.openSync).toHaveBeenCalledTimes(1);
  });

  // ── 4. Second call returns same value, no rewrite ─────────────────────────

  it('returns the same timestamp on a second call and does NOT rewrite to disk', () => {
    const first = ensurePluginInstalledAt('@openpen/stable-plugin');
    vi.clearAllMocks(); // reset call counts
    const second = ensurePluginInstalledAt('@openpen/stable-plugin');
    expect(second).toBe(first);
    // No additional write should have occurred.
    expect(fs.openSync).not.toHaveBeenCalled();
  });

  // ── 5. getPluginInstalledAt returns null for unknown id ───────────────────

  it('getPluginInstalledAt returns null for an id that has never been seen', () => {
    expect(getPluginInstalledAt('completely-unknown')).toBeNull();
  });

  it('getPluginInstalledAt returns the stored value after ensurePluginInstalledAt', () => {
    const ts = ensurePluginInstalledAt('@openpen/known-plugin');
    expect(getPluginInstalledAt('@openpen/known-plugin')).toBe(ts);
  });
});

// ── 6. Persisted entries load correctly on init ───────────────────────────────

describe('session persistence', () => {
  it('restores entries from a previous session on init', () => {
    const payload = {
      'plugin-a': { installedAt: '2024-01-01T00:00:00.000Z' },
      'plugin-b': { installedAt: '2024-06-15T12:34:56.789Z' },
    };
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify(payload));
    initPluginMetaManager();

    expect(getPluginInstalledAt('plugin-a')).toBe('2024-01-01T00:00:00.000Z');
    expect(getPluginInstalledAt('plugin-b')).toBe('2024-06-15T12:34:56.789Z');
    expect(getAllPluginMeta()).toEqual(payload);
  });

  it('ensurePluginInstalledAt does not overwrite a loaded entry', () => {
    const original = '2024-01-01T00:00:00.000Z';
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue(JSON.stringify({ '@openpen/old-plugin': { installedAt: original } }));
    initPluginMetaManager();

    vi.clearAllMocks();
    const result = ensurePluginInstalledAt('@openpen/old-plugin');
    expect(result).toBe(original);
    expect(fs.openSync).not.toHaveBeenCalled();
  });
});
