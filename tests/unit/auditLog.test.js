import { describe, it, expect, beforeEach } from 'vitest';
import { createAuditLog } from '../../electron/audit-log.js';

/** Minimal valid entry factory. */
function makeEntry(overrides = {}) {
  return {
    requestId: null,
    timestamp: Date.now(),
    method: 'GET',
    url: 'https://example.com/api/data',
    statusCode: null,
    webContentsId: 1,
    initiator: null,
    pluginId: null,
    ...overrides,
  };
}

describe('createAuditLog', () => {
  let log;

  beforeEach(() => {
    log = createAuditLog({ maxEntries: 500 });
  });

  // ── Basic append / getEntries ────────────────────────────────────────────

  it('starts empty', () => {
    expect(log.size()).toBe(0);
    expect(log.getEntries()).toEqual([]);
  });

  it('append increases size', () => {
    log.append(makeEntry());
    expect(log.size()).toBe(1);
  });

  it('getEntries returns appended entries (newest first)', () => {
    const e1 = makeEntry({ timestamp: 1000, url: 'https://a.com' });
    const e2 = makeEntry({ timestamp: 2000, url: 'https://b.com' });
    log.append(e1);
    log.append(e2);

    const result = log.getEntries();
    expect(result).toHaveLength(2);
    // Newest first
    expect(result[0].url).toBe('https://b.com');
    expect(result[1].url).toBe('https://a.com');
  });

  it('entry contains required fields', () => {
    const entry = makeEntry({ statusCode: 200, pluginId: 'my-plugin' });
    log.append(entry);
    const [got] = log.getEntries();
    expect(got).toHaveProperty('timestamp');
    expect(got).toHaveProperty('method');
    expect(got).toHaveProperty('url');
    expect(got.statusCode).toBe(200);
    expect(got.pluginId).toBe('my-plugin');
  });

  // ── Ring buffer eviction ─────────────────────────────────────────────────

  it('ring buffer: appending maxEntries+1 keeps exactly maxEntries entries', () => {
    const MAX = 500;
    for (let i = 0; i < MAX + 1; i++) {
      log.append(makeEntry({ timestamp: i, url: `https://example.com/${i}` }));
    }
    expect(log.size()).toBe(MAX);
  });

  it('ring buffer: oldest entry is evicted first (FIFO)', () => {
    const small = createAuditLog({ maxEntries: 3 });
    small.append(makeEntry({ timestamp: 1, url: 'https://first.com' }));
    small.append(makeEntry({ timestamp: 2, url: 'https://second.com' }));
    small.append(makeEntry({ timestamp: 3, url: 'https://third.com' }));
    // This should evict 'first'
    small.append(makeEntry({ timestamp: 4, url: 'https://fourth.com' }));

    expect(small.size()).toBe(3);
    const urls = small.getEntries().map((e) => e.url);
    expect(urls).not.toContain('https://first.com');
    expect(urls).toContain('https://fourth.com');
  });

  // ── Filter: limit ────────────────────────────────────────────────────────

  it('limit option caps returned entries', () => {
    for (let i = 0; i < 20; i++) log.append(makeEntry({ timestamp: i }));
    const result = log.getEntries({ limit: 5 });
    expect(result).toHaveLength(5);
  });

  it('limit defaults to 100 when not specified', () => {
    for (let i = 0; i < 150; i++) log.append(makeEntry({ timestamp: i }));
    const result = log.getEntries();
    expect(result).toHaveLength(100);
  });

  // ── Filter: since ────────────────────────────────────────────────────────

  it('since filters out entries at or before the threshold', () => {
    log.append(makeEntry({ timestamp: 1000 }));
    log.append(makeEntry({ timestamp: 2000 }));
    log.append(makeEntry({ timestamp: 3000 }));

    const result = log.getEntries({ since: 2000 });
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe(3000);
  });

  it('since returns nothing when all entries are too old', () => {
    log.append(makeEntry({ timestamp: 500 }));
    expect(log.getEntries({ since: 1000 })).toHaveLength(0);
  });

  // ── Filter: pluginId ─────────────────────────────────────────────────────

  it('pluginId filter returns only matching entries', () => {
    log.append(makeEntry({ pluginId: 'plugin-a' }));
    log.append(makeEntry({ pluginId: 'plugin-b' }));
    log.append(makeEntry({ pluginId: 'plugin-a' }));

    const result = log.getEntries({ pluginId: 'plugin-a' });
    expect(result).toHaveLength(2);
    result.forEach((e) => expect(e.pluginId).toBe('plugin-a'));
  });

  it('pluginId: null returns only unattributed entries', () => {
    log.append(makeEntry({ pluginId: null }));
    log.append(makeEntry({ pluginId: 'plugin-x' }));
    log.append(makeEntry({ pluginId: null }));

    const result = log.getEntries({ pluginId: null });
    expect(result).toHaveLength(2);
    result.forEach((e) => expect(e.pluginId).toBeNull());
  });

  it('omitting pluginId returns entries regardless of pluginId', () => {
    log.append(makeEntry({ pluginId: null }));
    log.append(makeEntry({ pluginId: 'plugin-y' }));

    const result = log.getEntries();
    expect(result).toHaveLength(2);
  });

  // ── updateByRequestId ────────────────────────────────────────────────────

  it('updateByRequestId merges fields when the requestId matches', () => {
    log.append(makeEntry({ requestId: 42, statusCode: null }));
    const ok = log.updateByRequestId(42, { statusCode: 200 });
    expect(ok).toBe(true);
    expect(log.getEntries()[0].statusCode).toBe(200);
  });

  it('updateByRequestId returns false when no entry matches', () => {
    log.append(makeEntry({ requestId: 1 }));
    const ok = log.updateByRequestId(999, { statusCode: 404 });
    expect(ok).toBe(false);
  });

  it('updateByRequestId disambiguates same-URL parallel requests', () => {
    // Two concurrent requests to the same URL — they must remain distinct.
    log.append(makeEntry({ requestId: 100, url: 'https://api.example.com/x' }));
    log.append(makeEntry({ requestId: 101, url: 'https://api.example.com/x' }));

    log.updateByRequestId(101, { statusCode: 500 });
    log.updateByRequestId(100, { statusCode: 200 });

    const byId = Object.fromEntries(
      log.getEntries().map((e) => [e.requestId, e.statusCode]),
    );
    expect(byId[100]).toBe(200);
    expect(byId[101]).toBe(500);
  });

  it('updateByRequestId returns false after the entry is evicted from the ring', () => {
    const small = createAuditLog({ maxEntries: 2 });
    small.append(makeEntry({ requestId: 1 }));
    small.append(makeEntry({ requestId: 2 }));
    small.append(makeEntry({ requestId: 3 })); // evicts requestId 1
    expect(small.updateByRequestId(1, { statusCode: 200 })).toBe(false);
    expect(small.updateByRequestId(3, { statusCode: 200 })).toBe(true);
  });

  // ── clear() + size() ─────────────────────────────────────────────────────

  it('clear() removes all entries', () => {
    log.append(makeEntry());
    log.append(makeEntry());
    log.clear();
    expect(log.size()).toBe(0);
    expect(log.getEntries()).toHaveLength(0);
  });

  it('clear() allows further appends after clearing', () => {
    log.append(makeEntry());
    log.clear();
    log.append(makeEntry({ url: 'https://after-clear.com' }));
    expect(log.size()).toBe(1);
    expect(log.getEntries()[0].url).toBe('https://after-clear.com');
  });

  it('size() reflects current entry count accurately', () => {
    expect(log.size()).toBe(0);
    log.append(makeEntry());
    expect(log.size()).toBe(1);
    log.append(makeEntry());
    expect(log.size()).toBe(2);
    log.clear();
    expect(log.size()).toBe(0);
  });
});
