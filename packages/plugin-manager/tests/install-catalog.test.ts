import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

// We test installFromCatalog by mocking global fetch.
// The catalog response points at a mock releaseUrl, which also returns
// a real zip created in-process from a minimal plugin fixture.

import archiver from 'archiver'
import { installFromCatalog } from '../src/install.ts'

// ── Build a minimal plugin zip in memory ─────────────────────────────────────

async function buildFixtureZip(pluginDir: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    const archive = archiver('zip', { zlib: { level: 1 } })

    archive.on('data', (chunk: Buffer) => chunks.push(chunk))
    archive.on('end', () => resolve(Buffer.concat(chunks)))
    archive.on('error', reject)

    const manifest = JSON.stringify({
      id: '@alice/notes',
      name: 'Notes',
      version: '1.2.0',
      renderer: 'dist/renderer.js',
    })
    archive.append(manifest, { name: 'plugin.json' })
    archive.append('// built', { name: 'dist/renderer.js' })
    archive.finalize()
  })
}

function sha256Hex(buf: Buffer): string {
  const { createHash } = require('node:crypto')
  return createHash('sha256').update(buf).digest('hex')
}

describe('installFromCatalog', () => {
  let tmpBase: string
  let installRoot: string
  let zipBuf: Buffer
  let correctSha: string

  beforeEach(async () => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-catalog-test-'))
    installRoot = path.join(tmpBase, 'plugins')

    zipBuf = await buildFixtureZip(tmpBase)
    correctSha = sha256Hex(zipBuf)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    fs.rmSync(tmpBase, { recursive: true, force: true })
  })

  function makeCatalog(sha256: string = correctSha) {
    return {
      schemaVersion: 2,
      plugins: [
        {
          id: '@alice/notes',
          scope: 'alice',
          name: 'notes',
          ownerId: 1,
          ownerLogin: 'alice',
          ownerType: 'User',
          description: 'Notes',
          minAppVersion: '1.0.0',
          repo: 'https://github.com/alice/notes',
          latestVersion: '1.2.0',
          releaseUrl: 'https://github.com/alice/notes/releases/download/v1.2.0/alice-notes-1.2.0.zip',
          sha256,
          state: 'active' as const,
          registeredAt: '2026-01-01T00:00:00Z',
        },
      ],
    }
  }

  function mockFetch(sha256?: string) {
    const catalog = makeCatalog(sha256)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (String(url).includes('plugins.json')) {
        return { ok: true, json: async () => catalog }
      }
      // Zip download — return a proper Node Readable as the body so pipeline() works
      const { Readable } = await import('node:stream')
      const readable = Readable.from([zipBuf])
      return { ok: true, body: readable }
    }))
  }

  it('installs a plugin when sha256 matches', async () => {
    mockFetch()
    const entry = await installFromCatalog('@alice/notes', {
      pluginsDir: installRoot,
      catalogUrl: 'https://example.com/plugins.json',
    })
    expect(entry.id).toBe('@alice/notes')
    expect(entry.version).toBe('1.2.0')
    expect(fs.existsSync(path.join(installRoot, '@alice', 'notes', 'plugin.json'))).toBe(true)
  })

  it('throws and does not install when sha256 mismatches', async () => {
    mockFetch('deadbeef0000000000000000000000000000000000000000000000000000cafe')
    await expect(
      installFromCatalog('@alice/notes', {
        pluginsDir: installRoot,
        catalogUrl: 'https://example.com/plugins.json',
      })
    ).rejects.toThrow(/sha256 mismatch/)

    expect(fs.existsSync(path.join(installRoot, '@alice', 'notes'))).toBe(false)
  })

  it('throws for a tombstoned plugin', async () => {
    const catalog = makeCatalog()
    catalog.plugins[0].state = 'tombstoned' as never
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => catalog }))

    await expect(
      installFromCatalog('@alice/notes', {
        pluginsDir: installRoot,
        catalogUrl: 'https://example.com/plugins.json',
      })
    ).rejects.toThrow(/permanently removed/)
  })

  it('throws for a yanked plugin', async () => {
    const catalog = makeCatalog()
    catalog.plugins[0].state = 'yanked' as never
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => catalog }))

    await expect(
      installFromCatalog('@alice/notes', {
        pluginsDir: installRoot,
        catalogUrl: 'https://example.com/plugins.json',
      })
    ).rejects.toThrow(/yanked/)
  })

  it('throws when plugin is not in catalog', async () => {
    const catalog = { schemaVersion: 2, plugins: [] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => catalog }))

    await expect(
      installFromCatalog('@bob/missing', {
        pluginsDir: installRoot,
        catalogUrl: 'https://example.com/plugins.json',
      })
    ).rejects.toThrow(/not found in catalog/)
  })
})
