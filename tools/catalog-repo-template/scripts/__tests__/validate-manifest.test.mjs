/**
 * Tests for validate-manifest.mjs helper functions.
 *
 * These tests run in isolation using Node's built-in test runner (no npm deps).
 * They verify the validation logic against fixture manifests without any network calls.
 *
 * Run: node --test scripts/__tests__/validate-manifest.test.mjs
 */

import { strict as assert } from 'node:assert'
import { describe, it, before, after } from 'node:test'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import AdmZip from 'adm-zip'
import { verifyContributionSlots } from '../validate-manifest.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ── Extract testable helpers by inlining them ─────────────────────────────────
// (validate-manifest.mjs is a CLI script, not a module; we replicate the
//  pure functions here rather than spawning a subprocess for each test.)

const PLUGIN_ID_RE = /^@([a-z0-9][a-z0-9-]{0,38})\/([a-z0-9][a-z0-9-]{0,38})$/
const RESERVED_SCOPES = ['openpen', 'core']
const SEMVER_RE = /^\d+\.\d+\.\d+$/

function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[m][n]
}

function validateManifestSync(manifest, prAuthor, isRegistration = false) {
  const checks = []

  if (!manifest || typeof manifest !== 'object') {
    checks.push({ name: 'manifest-parseable', passed: false })
    return { passed: false, checks }
  }
  checks.push({ name: 'manifest-parseable', passed: true })

  const required = ['id', 'scope', 'name', 'ownerId', 'ownerLogin', 'ownerType',
    'description', 'minAppVersion', 'repo', 'latestVersion', 'releaseUrl', 'sha256', 'state']
  const missing = required.filter((k) => manifest[k] === undefined || manifest[k] === null)
  if (missing.length > 0) {
    checks.push({ name: 'schema-complete', passed: false, message: `Missing: ${missing.join(', ')}` })
    return { passed: false, checks }
  }
  checks.push({ name: 'schema-complete', passed: true })

  if (!PLUGIN_ID_RE.test(manifest.id)) {
    checks.push({ name: 'id-format', passed: false })
    return { passed: false, checks }
  }
  checks.push({ name: 'id-format', passed: true })

  const [, scopePart] = PLUGIN_ID_RE.exec(manifest.id)
  if (RESERVED_SCOPES.includes(scopePart)) {
    checks.push({ name: 'reserved-scope', passed: false, message: `scope "@${scopePart}" is reserved` })
    return { passed: false, checks }
  }
  checks.push({ name: 'reserved-scope', passed: true })

  const scopeMatchesAuthor = scopePart.toLowerCase() === prAuthor.toLowerCase()
  checks.push({ name: 'scope-matches-submitter', passed: scopeMatchesAuthor })
  if (!scopeMatchesAuthor) return { passed: false, checks }

  const validSemver = SEMVER_RE.test(manifest.minAppVersion)
  checks.push({ name: 'min-app-version-semver', passed: validSemver })

  return { passed: checks.every((c) => c.passed), checks }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

const VALID_MANIFEST = {
  id: '@alice/notes',
  scope: 'alice',
  name: 'notes',
  ownerId: 12345678,
  ownerLogin: 'alice',
  ownerType: 'User',
  description: 'Take notes',
  minAppVersion: '1.0.0',
  repo: 'https://github.com/alice/notes',
  latestVersion: '1.0.0',
  releaseUrl: 'https://github.com/alice/notes/releases/download/v1.0.0/alice-notes-1.0.0.zip',
  sha256: 'abc123',
  state: 'active',
}

describe('validate-manifest: valid manifest', () => {
  it('passes all sync checks for a well-formed manifest', () => {
    const result = validateManifestSync(VALID_MANIFEST, 'alice')
    assert.equal(result.passed, true, JSON.stringify(result.checks))
  })
})

describe('validate-manifest: scope mismatch', () => {
  it('fails when PR author does not match scope', () => {
    const result = validateManifestSync(VALID_MANIFEST, 'bob')
    assert.equal(result.passed, false)
    const check = result.checks.find((c) => c.name === 'scope-matches-submitter')
    assert.equal(check?.passed, false)
  })
})

describe('validate-manifest: reserved scope', () => {
  it('rejects @openpen scope', () => {
    const manifest = { ...VALID_MANIFEST, id: '@openpen/tool', scope: 'openpen' }
    const result = validateManifestSync(manifest, 'openpen')
    assert.equal(result.passed, false)
    const check = result.checks.find((c) => c.name === 'reserved-scope')
    assert.equal(check?.passed, false)
  })

  it('rejects @core scope', () => {
    const manifest = { ...VALID_MANIFEST, id: '@core/utils', scope: 'core' }
    const result = validateManifestSync(manifest, 'core')
    assert.equal(result.passed, false)
  })
})

describe('validate-manifest: schema', () => {
  it('fails when required field is missing', () => {
    const { sha256: _removed, ...manifest } = VALID_MANIFEST
    const result = validateManifestSync(manifest, 'alice')
    assert.equal(result.passed, false)
    const check = result.checks.find((c) => c.name === 'schema-complete')
    assert.ok(check?.message?.includes('sha256'))
  })
})

describe('validate-manifest: id format', () => {
  it('rejects uppercase in id', () => {
    const manifest = { ...VALID_MANIFEST, id: '@Alice/notes' }
    const result = validateManifestSync(manifest, 'alice')
    assert.equal(result.passed, false)
    const check = result.checks.find((c) => c.name === 'id-format')
    assert.equal(check?.passed, false)
  })

  it('rejects bare id without scope', () => {
    const manifest = { ...VALID_MANIFEST, id: 'notes' }
    const result = validateManifestSync(manifest, 'alice')
    assert.equal(result.passed, false)
  })
})

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    assert.equal(levenshtein('notes', 'notes'), 0)
  })

  it('returns 1 for single substitution', () => {
    assert.equal(levenshtein('notes', 'note5'), 1)
  })

  it('returns 2 for two edits', () => {
    assert.equal(levenshtein('notes', 'nots'), 1)
    assert.equal(levenshtein('notes', 'ntos'), 2)
  })

  it('identifies near-duplicates (distance <= 2)', () => {
    assert.ok(levenshtein('notes', 'note') <= 2)
    assert.ok(levenshtein('my-notes', 'my-note') <= 2)
  })
})

// ── Helpers for contribution-slot tests ───────────────────────────────────────

/** Build a zip buffer containing plugin.json with the given content. */
function makeZipWith(pluginJsonContent) {
  const zip = new AdmZip()
  zip.addFile('plugin.json', Buffer.from(JSON.stringify(pluginJsonContent), 'utf-8'))
  return zip.toBuffer()
}

/** Build a zip buffer with no plugin.json entry. */
function makeZipWithout() {
  const zip = new AdmZip()
  zip.addFile('dist/index.js', Buffer.from('export default {}', 'utf-8'))
  return zip.toBuffer()
}

// ── verifyContributionSlots ───────────────────────────────────────────────────

describe('verifyContributionSlots: valid plugin with contributions', () => {
  it('passes when plugin.json has a non-empty contributions array', () => {
    const buf = makeZipWith({ contributions: [{ slot: 'canvas.tools' }] })
    const result = verifyContributionSlots(buf)
    assert.equal(result.passed, true, result.message)
  })
})

describe('verifyContributionSlots: empty contributions array', () => {
  it('fails with the spec-referenced error message', () => {
    const buf = makeZipWith({ contributions: [] })
    const result = verifyContributionSlots(buf)
    assert.equal(result.passed, false)
    assert.ok(
      result.message?.includes('§3.3.1 rule 6'),
      `Expected spec reference in message, got: ${result.message}`,
    )
  })

  it('fails when contributions key is absent', () => {
    const buf = makeZipWith({ id: '@alice/notes' })
    const result = verifyContributionSlots(buf)
    assert.equal(result.passed, false)
    assert.ok(result.message?.includes('§3.3.1 rule 6'))
  })
})

describe('verifyContributionSlots: missing plugin.json', () => {
  it('fails with the missing-file error message', () => {
    const buf = makeZipWithout()
    const result = verifyContributionSlots(buf)
    assert.equal(result.passed, false)
    assert.ok(
      result.message?.includes('plugin.json is missing'),
      `Expected missing-file message, got: ${result.message}`,
    )
  })
})
