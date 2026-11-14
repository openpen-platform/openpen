import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createHash } from 'node:crypto'
import archiver from 'archiver'
import { installFromCommunityCatalog } from '../src/install.ts'
import { parseCommunityCatalog, withoutOfficialIds } from '../src/community.ts'
import { COMMUNITY_CATALOG_URL_DEFAULT, CATALOG_URL_DEFAULT } from '../src/config.ts'

function buildZip(manifestId: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const archive = archiver('zip', { zlib: { level: 1 } })
    archive.on('data', (c: Buffer) => chunks.push(c))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)
    archive.append(
      JSON.stringify({ id: manifestId, name: 'Ruler', version: '1.2.0', renderer: 'dist/renderer.js' }),
      { name: 'plugin.json' },
    )
    archive.append('// built', { name: 'dist/renderer.js' })
    archive.finalize()
  })
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

function communityEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: '@alice/ruler',
    scope: 'alice',
    name: 'ruler',
    ownerId: 1000,
    ownerLogin: 'alice',
    ownerType: 'User',
    description: 'ruler plugin',
    minAppVersion: '1.0.0',
    repo: 'https://github.com/alice/ruler',
    latestVersion: '1.2.0',
    releaseUrl: 'https://github.com/alice/ruler/releases/download/v1.2.0/ruler-1.2.0.zip',
    sha256: 'a'.repeat(64),
    state: 'active',
    tier: 'community',
    reviewed: false,
    indexedAt: '2026-11-12T00:00:00Z',
    releasedAt: '2026-11-01T00:00:00Z',
    ...overrides,
  }
}

function communityDoc(plugins: unknown[]) {
  return { schemaVersion: 1, tier: 'community', updatedAt: '2026-11-12T00:00:00Z', plugins }
}

describe('community catalog URL', () => {
  it('sits next to the official index on the same repo and branch', () => {
    expect(COMMUNITY_CATALOG_URL_DEFAULT).toBe(CATALOG_URL_DEFAULT.replace(/plugins\.json$/, 'community/plugins.json'))
  })
})

describe('parseCommunityCatalog', () => {
  it('parses a valid entry and forces reviewed=false', () => {
    const out = parseCommunityCatalog(communityDoc([communityEntry({ reviewed: true })]))
    expect(out).toHaveLength(1)
    expect(out[0].id).toBe('@alice/ruler')
    expect(out[0].tier).toBe('community')
    expect(out[0].reviewed).toBe(false)
  })

  it('returns [] for a wrong schemaVersion, wrong tier, or non-object', () => {
    expect(parseCommunityCatalog({ ...communityDoc([communityEntry()]), schemaVersion: 2 })).toEqual([])
    expect(parseCommunityCatalog({ ...communityDoc([communityEntry()]), tier: 'official' })).toEqual([])
    expect(parseCommunityCatalog(null)).toEqual([])
    expect(parseCommunityCatalog({ schemaVersion: 1, tier: 'community', plugins: 'x' })).toEqual([])
  })

  it('drops malformed entries without hiding the valid ones', () => {
    const out = parseCommunityCatalog(communityDoc([
      communityEntry({ id: 'no-scope', scope: 'x', name: 'y' }),
      communityEntry({ id: '@bob/a', scope: 'bob', name: 'a', sha256: 'XYZ' }),
      communityEntry({ id: '@bob/b', scope: 'bob', name: 'b', releaseUrl: 'http://x/b.zip' }),
      communityEntry({ id: '@bob/c', scope: 'bob', name: 'c', state: 'yanked' }),
      communityEntry({ id: '@bob/d', scope: 'bob', name: 'd', tier: 'official' }),
      communityEntry({ id: '@bob/e', scope: 'eve', name: 'e' }),
      communityEntry({ id: '@carol/ok', scope: 'carol', name: 'ok' }),
      null,
    ]))
    expect(out.map((p) => p.id)).toEqual(['@carol/ok'])
  })

  it('keeps only the first entry for a duplicated id', () => {
    const out = parseCommunityCatalog(communityDoc([
      communityEntry({ description: 'first' }),
      communityEntry({ description: 'second' }),
    ]))
    expect(out).toHaveLength(1)
    expect(out[0].description).toBe('first')
  })
})

describe('withoutOfficialIds', () => {
  it('removes community entries that share an id with an official plugin', () => {
    const community = parseCommunityCatalog(communityDoc([
      communityEntry({ id: '@openpen/arrow', scope: 'openpen', name: 'arrow' }),
      communityEntry(),
    ]))
    const out = withoutOfficialIds(community, [{ id: '@openpen/arrow' }])
    expect(out.map((p) => p.id)).toEqual(['@alice/ruler'])
  })
})

describe('installFromCommunityCatalog', () => {
  let tmpBase: string
  let installRoot: string

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-community-test-'))
    installRoot = path.join(tmpBase, 'plugins')
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    fs.rmSync(tmpBase, { recursive: true, force: true })
  })

  function mockFetch(catalog: unknown, zip: Buffer) {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (String(url).endsWith('community/plugins.json')) {
        return { ok: true, json: async () => catalog }
      }
      const { Readable } = await import('node:stream')
      return { ok: true, body: Readable.from([zip]) }
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  const URL_ = 'https://example.test/community/plugins.json'

  it('installs when sha256 matches', async () => {
    const zip = await buildZip('@alice/ruler')
    mockFetch(communityDoc([communityEntry({ sha256: sha256Hex(zip) })]), zip)
    const entry = await installFromCommunityCatalog('@alice/ruler', { pluginsDir: installRoot, catalogUrl: URL_ })
    expect(entry.id).toBe('@alice/ruler')
    expect(fs.existsSync(path.join(installRoot, '@alice', 'ruler', 'plugin.json'))).toBe(true)
  })

  it('rejects a sha256 mismatch and installs nothing', async () => {
    const zip = await buildZip('@alice/ruler')
    mockFetch(communityDoc([communityEntry({ sha256: 'b'.repeat(64) })]), zip)
    await expect(
      installFromCommunityCatalog('@alice/ruler', { pluginsDir: installRoot, catalogUrl: URL_ }),
    ).rejects.toThrow(/sha256 mismatch/)
    expect(fs.existsSync(path.join(installRoot, '@alice', 'ruler'))).toBe(false)
  })

  it('rejects a package whose manifest id differs from the catalog id', async () => {
    const zip = await buildZip('@mallory/other')
    mockFetch(communityDoc([communityEntry({ sha256: sha256Hex(zip) })]), zip)
    await expect(
      installFromCommunityCatalog('@alice/ruler', { pluginsDir: installRoot, catalogUrl: URL_ }),
    ).rejects.toThrow(/id mismatch/)
    expect(fs.existsSync(path.join(installRoot, '@mallory'))).toBe(false)
    expect(fs.existsSync(path.join(installRoot, '@alice'))).toBe(false)
  })

  it('throws when the id is not in the community catalog', async () => {
    const zip = await buildZip('@alice/ruler')
    mockFetch(communityDoc([]), zip)
    await expect(
      installFromCommunityCatalog('@alice/ruler', { pluginsDir: installRoot, catalogUrl: URL_ }),
    ).rejects.toThrow(/not found in the community catalog/)
  })

  it('does not fetch the official catalog', async () => {
    const zip = await buildZip('@alice/ruler')
    const fetchMock = mockFetch(communityDoc([communityEntry({ sha256: sha256Hex(zip) })]), zip)
    await installFromCommunityCatalog('@alice/ruler', { pluginsDir: installRoot, catalogUrl: URL_ })
    const urls = fetchMock.mock.calls.map((c) => String(c[0]))
    expect(urls.some((u) => /\/plugins\.json$/.test(u) && !u.endsWith('community/plugins.json'))).toBe(false)
  })
})
