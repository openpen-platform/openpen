/**
 * Validates that ensurePluginInstalledAt enforces the scoped MODULE_ID_RE
 * format (@scope/name) and rejects bare names and malformed IDs.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-userdata-scoped'),
    on: vi.fn(),
  },
  ipcMain: {
    handle: vi.fn(),
  },
}));

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

vi.mock('../../electron/ipc-channels.js', () => ({
  PLUGIN_META: { GET_ALL: 'plugin-meta:get-all' },
}));

vi.mock('../../electron/fs-utils.js', () => ({
  fsyncDir: vi.fn(),
}));

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
  ensurePluginInstalledAt,
} from '../../electron/plugin-meta-manager.js';

beforeEach(() => {
  vi.clearAllMocks();
  fs.existsSync.mockReturnValue(false);
  initPluginMetaManager();
});

describe('ensurePluginInstalledAt — scoped ID enforcement', () => {
  it('accepts a valid scoped id and writes to metaMap', () => {
    const ts = ensurePluginInstalledAt('@openpen/freehand');
    expect(new Date(ts).toISOString()).toBe(ts);
    expect(getAllPluginMeta()).toMatchObject({ '@openpen/freehand': { installedAt: ts } });
  });

  it('rejects a bare (unscoped) name', () => {
    expect(() => ensurePluginInstalledAt('invalid-bare-name')).toThrow(
      /Invalid plugin id/
    );
  });

  it('rejects an id with whitespace in the scope segment', () => {
    expect(() => ensurePluginInstalledAt('@bad scope/name')).toThrow(
      /Invalid plugin id/
    );
  });
});
