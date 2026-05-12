/**
 * Unit tests for electron/diagnostics-manager.js
 *
 * Focus:
 * 1. getDiagnosticsState() returns empty events when sidecar is missing.
 * 2. recordDiagnosticsEvent() appends with correct shape.
 * 3. Events are stored newest-first (reverse chronological).
 * 4. Event list is capped at 10.
 * 5. acknowledgeDiagnosticsEvent() sets acknowledgedAt; event stays in list.
 * 6. acknowledgeDiagnosticsEvent() with unknown id is a no-op (no throw).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── mock electron ──
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/tmp/test-userdata-diag'),
    on: vi.fn(),
  },
  BrowserWindow: {
    getAllWindows: vi.fn(() => []),
  },
  ipcMain: {
    handle: vi.fn(),
  },
  shell: {
    showItemInFolder: vi.fn(),
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
  DIAGNOSTICS: {
    GET_STATE: 'diagnostics:get-state',
    ACKNOWLEDGE: 'diagnostics:acknowledge',
    OPEN_BACKUP_DIR: 'diagnostics:open-backup-dir',
    STATE_CHANGED: 'diagnostics:state-changed',
  },
}));

import fs from 'node:fs';
import {
  initDiagnosticsManager,
  getDiagnosticsState,
  recordDiagnosticsEvent,
  acknowledgeDiagnosticsEvent,
} from '../../electron/diagnostics-manager.js';

// Re-initialise state before every test by re-importing with a fresh module
// cache. Vitest reuses module instances across tests by default, so we call
// initDiagnosticsManager (which calls loadState()) at the start of each test
// after resetting the fs mock to "file missing".
beforeEach(() => {
  vi.clearAllMocks();
  // Sidecar missing by default.
  fs.existsSync.mockReturnValue(false);
  // Re-init resets the in-memory state.
  initDiagnosticsManager();
});

// ── 1. Empty state when sidecar is missing ────────────────────────────────────

describe('getDiagnosticsState', () => {
  it('returns { events: [] } when diagnostics.json does not exist', () => {
    const state = getDiagnosticsState();
    expect(state).toEqual({ events: [] });
  });

  it('silently resets to empty when sidecar JSON is invalid', () => {
    fs.existsSync.mockReturnValue(true);
    fs.readFileSync.mockReturnValue('not valid json {{{');
    initDiagnosticsManager();
    const state = getDiagnosticsState();
    expect(state).toEqual({ events: [] });
  });
});

// ── 2. recordDiagnosticsEvent appends correct shape ──────────────────────────

describe('recordDiagnosticsEvent', () => {
  it('appends an event with non-null detectedAt, null acknowledgedAt, and a non-empty id', () => {
    recordDiagnosticsEvent('L1', '/path/to/backup.bak');
    const { events } = getDiagnosticsState();
    expect(events).toHaveLength(1);

    const ev = events[0];
    expect(ev.layer).toBe('L1');
    expect(ev.backupPath).toBe('/path/to/backup.bak');
    expect(typeof ev.id).toBe('string');
    expect(ev.id.length).toBeGreaterThan(0);
    expect(typeof ev.detectedAt).toBe('string');
    expect(ev.detectedAt.length).toBeGreaterThan(0);
    // Verify it is a valid ISO8601 date string.
    expect(new Date(ev.detectedAt).toISOString()).toBe(ev.detectedAt);
    expect(ev.acknowledgedAt).toBeNull();
  });
});

// ── 3. Events are stored newest-first ────────────────────────────────────────

describe('event ordering', () => {
  it('stores events in reverse-chronological order (newest at index 0)', () => {
    recordDiagnosticsEvent('L1', '/backup/first.bak');
    recordDiagnosticsEvent('L2', '/backup/second.bak');
    recordDiagnosticsEvent('L3b', '/backup/third.bak');

    const { events } = getDiagnosticsState();
    expect(events).toHaveLength(3);
    // Newest first.
    expect(events[0].backupPath).toBe('/backup/third.bak');
    expect(events[1].backupPath).toBe('/backup/second.bak');
    expect(events[2].backupPath).toBe('/backup/first.bak');
  });
});

// ── 4. Cap at 10 events ───────────────────────────────────────────────────────

describe('event cap', () => {
  it('retains only the 10 most recent events when 11 are recorded', () => {
    for (let i = 1; i <= 11; i++) {
      recordDiagnosticsEvent('L1', `/backup/file-${i}.bak`);
    }
    const { events } = getDiagnosticsState();
    expect(events).toHaveLength(10);
    // The oldest (file-1) should have been dropped; file-11 is newest (index 0).
    expect(events[0].backupPath).toBe('/backup/file-11.bak');
    const paths = events.map((e) => e.backupPath);
    expect(paths).not.toContain('/backup/file-1.bak');
  });
});

// ── 5. acknowledgeDiagnosticsEvent sets acknowledgedAt ───────────────────────

describe('acknowledgeDiagnosticsEvent', () => {
  it('sets acknowledgedAt to a non-null ISO8601 string; event stays in the list', () => {
    recordDiagnosticsEvent('L2', '/backup/target.bak');
    const { events: before } = getDiagnosticsState();
    const id = before[0].id;

    acknowledgeDiagnosticsEvent(id);

    const { events: after } = getDiagnosticsState();
    expect(after).toHaveLength(1);
    const ev = after[0];
    expect(ev.acknowledgedAt).not.toBeNull();
    expect(typeof ev.acknowledgedAt).toBe('string');
    expect(new Date(ev.acknowledgedAt).toISOString()).toBe(ev.acknowledgedAt);
  });

  // ── 6. Unknown id is a no-op ──────────────────────────────────────────────

  it('is a no-op (no throw) for an unknown id', () => {
    recordDiagnosticsEvent('L1', '/backup/existing.bak');
    expect(() => acknowledgeDiagnosticsEvent('does-not-exist')).not.toThrow();
    const { events } = getDiagnosticsState();
    // Original event unaffected.
    expect(events).toHaveLength(1);
    expect(events[0].acknowledgedAt).toBeNull();
  });
});
