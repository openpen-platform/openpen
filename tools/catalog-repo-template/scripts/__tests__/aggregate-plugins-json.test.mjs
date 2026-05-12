/**
 * Tests for aggregate-plugins-json.mjs helper logic.
 *
 * Verifies the aggregation logic against fixture manifest files,
 * checking that the output plugins.json is correctly assembled.
 *
 * Run: node --test scripts/__tests__/aggregate-plugins-json.test.mjs
 */

import { strict as assert } from 'node:assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { compareSemver, enrichWithIncompatible } from '../aggregate-plugins-json.mjs'

// ── Inline the aggregation logic (same as aggregate-plugins-json.mjs) ─────────

function collectManifests(pluginsDir) {
  const plugins = []
  if (!fs.existsSync(pluginsDir)) return plugins

  for (const scopeEntry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!scopeEntry.isDirectory()) continue
    const scopeDir = path.join(pluginsDir, scopeEntry.name)

    for (const nameEntry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
      if (!nameEntry.isDirectory()) continue
      const manifestPath = path.join(scopeDir, nameEntry.name, 'manifest.json')
      if (!fs.existsSync(manifestPath)) continue
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        if (!manifest.id || !manifest.state) continue
        if (manifest.state === 'tombstoned') continue
        plugins.push(manifest)
      } catch { /* skip */ }
    }
  }

  plugins.sort((a, b) => a.id.localeCompare(b.id))
  return plugins
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeManifest(id, state = 'active') {
  const [, scope, name] = /^@([^/]+)\/(.+)$/.exec(id)
  return {
    id, scope, name, ownerId: 1, ownerLogin: scope,
    ownerType: 'User', description: 'Test', minAppVersion: '1.0.0',
    repo: `https://github.com/${scope}/${name}`,
    latestVersion: '1.0.0',
    releaseUrl: `https://github.com/${scope}/${name}/releases/download/v1.0.0/${scope}-${name}-1.0.0.zip`,
    sha256: 'abc', state,
  }
}

function writeManifest(pluginsDir, id, state = 'active') {
  const [, scope, name] = /^@([^/]+)\/(.+)$/.exec(id)
  const dir = path.join(pluginsDir, scope, name)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(makeManifest(id, state)))
}

// ── Tests ─────────────────────────────────────────────────────────────────────

let tmpDir, pluginsDir

describe('aggregate-plugins-json', () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-aggregate-test-'))
    pluginsDir = path.join(tmpDir, 'plugins')
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns empty array when plugins/ does not exist', () => {
    const result = collectManifests(pluginsDir)
    assert.deepEqual(result, [])
  })

  it('includes a single active plugin', () => {
    writeManifest(pluginsDir, '@alice/notes')
    const result = collectManifests(pluginsDir)
    assert.equal(result.length, 1)
    assert.equal(result[0].id, '@alice/notes')
  })

  it('includes two plugins from different scopes, sorted by id', () => {
    writeManifest(pluginsDir, '@bob/color-picker')
    writeManifest(pluginsDir, '@alice/notes')
    const result = collectManifests(pluginsDir)
    assert.equal(result.length, 2)
    assert.equal(result[0].id, '@alice/notes')
    assert.equal(result[1].id, '@bob/color-picker')
  })

  it('excludes tombstoned plugins from the aggregate', () => {
    writeManifest(pluginsDir, '@alice/notes', 'active')
    writeManifest(pluginsDir, '@alice/bad-plugin', 'tombstoned')
    const result = collectManifests(pluginsDir)
    assert.equal(result.length, 1)
    assert.equal(result[0].id, '@alice/notes')
  })

  it('includes yanked plugins (they stay visible, just with a warning)', () => {
    writeManifest(pluginsDir, '@alice/notes', 'yanked')
    const result = collectManifests(pluginsDir)
    assert.equal(result.length, 1)
    assert.equal(result[0].state, 'yanked')
  })

  it('skips directories without manifest.json', () => {
    fs.mkdirSync(path.join(pluginsDir, 'alice', 'empty-plugin'), { recursive: true })
    const result = collectManifests(pluginsDir)
    assert.equal(result.length, 0)
  })

  it('skips malformed manifests (missing required fields)', () => {
    fs.mkdirSync(path.join(pluginsDir, 'alice', 'broken'), { recursive: true })
    fs.writeFileSync(path.join(pluginsDir, 'alice', 'broken', 'manifest.json'), '{"id":"@alice/broken"}')
    const result = collectManifests(pluginsDir)
    // Missing `state` field — should be skipped
    assert.equal(result.length, 0)
  })
})

// ── minAppVersion / incompatible enrichment tests ─────────────────────────────

describe('enrichWithIncompatible', () => {
  it('does not set incompatible when minAppVersion <= hostLatestVersion', () => {
    const plugins = [{ id: '@alice/notes', minAppVersion: '1.0.0', state: 'active' }]
    const result = enrichWithIncompatible(plugins, '1.2.0')
    assert.equal(result[0].incompatible, undefined, 'should not emit incompatible field when compatible')
  })

  it('sets incompatible: true when minAppVersion > hostLatestVersion', () => {
    const plugins = [{ id: '@alice/future', minAppVersion: '2.0.0', state: 'active' }]
    const result = enrichWithIncompatible(plugins, '1.9.9')
    assert.equal(result[0].incompatible, true)
  })

  it('does not set incompatible when hostLatestVersion is null (API failure)', () => {
    const plugins = [{ id: '@alice/future', minAppVersion: '99.0.0', state: 'active' }]
    const result = enrichWithIncompatible(plugins, null)
    assert.equal(result[0].incompatible, undefined, 'should not flag when host version unknown')
  })

  it('handles equal versions as compatible', () => {
    const plugins = [{ id: '@alice/exact', minAppVersion: '1.5.3', state: 'active' }]
    const result = enrichWithIncompatible(plugins, '1.5.3')
    assert.equal(result[0].incompatible, undefined)
  })
})

describe('compareSemver', () => {
  it('returns -1 when a < b', () => {
    assert.equal(compareSemver('1.0.0', '1.2.0'), -1)
    assert.equal(compareSemver('0.9.9', '1.0.0'), -1)
  })

  it('returns 0 when a == b', () => {
    assert.equal(compareSemver('1.2.3', '1.2.3'), 0)
  })

  it('returns 1 when a > b', () => {
    assert.equal(compareSemver('2.0.0', '1.9.9'), 1)
    assert.equal(compareSemver('1.0.1', '1.0.0'), 1)
  })

  it('returns 0 on parse failure (graceful)', () => {
    assert.equal(compareSemver('invalid', '1.0.0'), 0)
    assert.equal(compareSemver('1.0.0', 'invalid'), 0)
  })
})
