import { describe, it, expect, vi } from 'vitest';
import {
  loadCommunityPlugins,
  checkCommunityInstallAllowed,
  COMMUNITY_OFF_ERROR,
} from '../../electron/community-catalog.js';

const OFFICIAL_URL = 'https://example.test/plugins.json';
const COMMUNITY_URL = 'https://example.test/community/plugins.json';

function communityEntry(id, overrides = {}) {
  const [, scope, name] = /^@([^/]+)\/(.+)$/.exec(id);
  return {
    id, scope, name, ownerId: 1, ownerLogin: scope, ownerType: 'User',
    description: 'd', minAppVersion: '1.0.0', repo: 'https://github.com/x/y',
    latestVersion: '1.0.0', releaseUrl: 'https://example.test/x.zip',
    sha256: 'a'.repeat(64), state: 'active', tier: 'community', reviewed: false,
    indexedAt: '2026-11-12T00:00:00Z', releasedAt: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

function makeDeps({ enabled = true, official = [], community = [] } = {}) {
  const fetchJson = vi.fn(async (url) => {
    if (url === OFFICIAL_URL) return { schemaVersion: 2, plugins: official };
    if (url === COMMUNITY_URL) return { schemaVersion: 1, tier: 'community', plugins: community };
    throw new Error(`unexpected url ${url}`);
  });
  return {
    deps: { isEnabled: () => enabled, fetchJson, officialUrl: OFFICIAL_URL, communityUrl: COMMUNITY_URL },
    fetchJson,
  };
}

describe('loadCommunityPlugins', () => {
  it('refuses and does not touch the network while the setting is off', async () => {
    const { deps, fetchJson } = makeDeps({ enabled: false, community: [communityEntry('@alice/ruler')] });
    const res = await loadCommunityPlugins(deps);
    expect(res).toEqual({ ok: false, error: COMMUNITY_OFF_ERROR });
    expect(fetchJson).not.toHaveBeenCalled();
  });

  it('returns parsed community entries while the setting is on', async () => {
    const { deps } = makeDeps({ community: [communityEntry('@alice/ruler')] });
    const res = await loadCommunityPlugins(deps);
    expect(res.ok).toBe(true);
    expect(res.plugins.map((p) => p.id)).toEqual(['@alice/ruler']);
  });

  it('drops a community entry that reuses an official id', async () => {
    const { deps } = makeDeps({
      official: [{ id: '@openpen/arrow' }],
      community: [communityEntry('@openpen/arrow'), communityEntry('@alice/ruler')],
    });
    const res = await loadCommunityPlugins(deps);
    expect(res.plugins.map((p) => p.id)).toEqual(['@alice/ruler']);
  });
});

describe('checkCommunityInstallAllowed', () => {
  it('refuses while the setting is off', async () => {
    const { deps } = makeDeps({ enabled: false });
    expect(await checkCommunityInstallAllowed(deps, '@alice/ruler')).toEqual({ ok: false, error: COMMUNITY_OFF_ERROR });
  });

  it('refuses an id that belongs to an official plugin', async () => {
    const { deps } = makeDeps({ official: [{ id: '@openpen/arrow' }] });
    const res = await checkCommunityInstallAllowed(deps, '@openpen/arrow');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/official plugin/);
  });

  it('allows a community-only id while the setting is on', async () => {
    const { deps } = makeDeps({ official: [{ id: '@openpen/arrow' }] });
    expect(await checkCommunityInstallAllowed(deps, '@alice/ruler')).toEqual({ ok: true });
  });
});
