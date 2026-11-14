import { PLUGIN_ID_RE } from './id.js'
import type { CatalogEntry, CommunityCatalogEntry } from './types.js'

export const COMMUNITY_SCHEMA_VERSION = 1

const SHA256_RE = /^[0-9a-f]{64}$/
const ZIP_URL_RE = /^https:\/\/.+\.zip$/i

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0
}

/**
 * Validate one raw community entry. Returns null for anything that is not a
 * complete, installable, active community entry, so one malformed row never
 * hides the others and never reaches the install path.
 */
function parseCommunityEntry(raw: unknown): CommunityCatalogEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>

  if (!isNonEmptyString(e.id) || !PLUGIN_ID_RE.test(e.id)) return null
  if (e.tier !== 'community') return null
  if (e.state !== 'active') return null
  if (!isNonEmptyString(e.sha256) || !SHA256_RE.test(e.sha256)) return null
  if (!isNonEmptyString(e.releaseUrl) || !ZIP_URL_RE.test(e.releaseUrl)) return null
  if (!isNonEmptyString(e.latestVersion)) return null
  if (!isNonEmptyString(e.name) || !isNonEmptyString(e.scope)) return null

  const m = PLUGIN_ID_RE.exec(e.id)!
  if (m[1] !== e.scope || m[2] !== e.name) return null

  return {
    id: e.id,
    scope: e.scope,
    name: e.name,
    ownerId: typeof e.ownerId === 'number' ? e.ownerId : 0,
    ownerLogin: typeof e.ownerLogin === 'string' ? e.ownerLogin : '',
    ownerType: typeof e.ownerType === 'string' ? e.ownerType : '',
    description: typeof e.description === 'string' ? e.description : '',
    minAppVersion: typeof e.minAppVersion === 'string' ? e.minAppVersion : '0.0.0',
    repo: typeof e.repo === 'string' ? e.repo : '',
    latestVersion: e.latestVersion,
    releaseUrl: e.releaseUrl,
    sha256: e.sha256,
    state: 'active',
    tier: 'community',
    // Community entries are never reviewed, whatever the file claims.
    reviewed: false,
    indexedAt: typeof e.indexedAt === 'string' ? e.indexedAt : '',
    releasedAt: typeof e.releasedAt === 'string' ? e.releasedAt : '',
  }
}

/**
 * Parse a community catalog document into its valid entries.
 *
 * Returns [] when the document is not a schemaVersion 1 community catalog.
 */
export function parseCommunityCatalog(json: unknown): CommunityCatalogEntry[] {
  if (!json || typeof json !== 'object') return []
  const doc = json as Record<string, unknown>
  if (doc.schemaVersion !== COMMUNITY_SCHEMA_VERSION) return []
  if (doc.tier !== 'community') return []
  if (!Array.isArray(doc.plugins)) return []

  const seen = new Set<string>()
  const out: CommunityCatalogEntry[] = []
  for (const raw of doc.plugins) {
    const entry = parseCommunityEntry(raw)
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    out.push(entry)
  }
  return out
}

/**
 * Drop community entries whose id is also in the official catalog, so a
 * community listing can never stand in for an official plugin.
 */
export function withoutOfficialIds(
  community: CommunityCatalogEntry[],
  official: Pick<CatalogEntry, 'id'>[],
): CommunityCatalogEntry[] {
  const officialIds = new Set(official.map((p) => p.id))
  return community.filter((p) => !officialIds.has(p.id))
}
