#!/usr/bin/env node
/**
 * validate-manifest.mjs
 *
 * Validates one or more catalog manifest.json files submitted in a PR.
 * Run by catalog-bot.yml.
 *
 * Requires: node:fs, node:https, node:crypto, node:path, adm-zip.
 * Run `npm install` in the catalog repo root before invoking.
 *
 * Usage:
 *   node validate-manifest.mjs \
 *     --files "plugins/alice/notes/manifest.json" \
 *     --pr-author "alice" \
 *     --is-registration "true" \
 *     --base-ref "main"
 *
 * Prints a JSON result object to stdout:
 *   { passed: boolean, checks: Array<{ name, passed, message? }> }
 */

import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'
import crypto from 'node:crypto'
import AdmZip from 'adm-zip'

const PLUGIN_ID_RE = /^@([a-z0-9][a-z0-9-]{0,38})\/([a-z0-9][a-z0-9-]{0,38})$/
const RESERVED_SCOPES = ['openpen', 'core']
const SEMVER_RE = /^\d+\.\d+\.\d+$/

// ── Argument parsing ──────────────────────────────────────────────────────────

const argv = process.argv.slice(2)
function getArg(flag) {
  const idx = argv.indexOf(flag)
  return idx >= 0 ? argv[idx + 1] : null
}

const filesArg = getArg('--files') ?? ''
const prAuthor = getArg('--pr-author') ?? ''
const isRegistration = getArg('--is-registration') === 'true'
const baseRef = getArg('--base-ref') ?? 'main'

const files = filesArg.split(/\s+/).filter(Boolean)

// ── Validate each file ────────────────────────────────────────────────────────

async function validateFile(filePath) {
  const checks = []
  let manifest

  // Load and parse
  try {
    manifest = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch (err) {
    checks.push({ name: 'manifest-parseable', passed: false, message: err.message })
    return { passed: false, checks }
  }
  checks.push({ name: 'manifest-parseable', passed: true })

  // Schema check
  const required = ['id', 'scope', 'name', 'ownerId', 'ownerLogin', 'ownerType',
    'description', 'minAppVersion', 'repo', 'latestVersion', 'releaseUrl', 'sha256', 'state']
  const missing = required.filter((k) => manifest[k] === undefined || manifest[k] === null)
  if (missing.length > 0) {
    checks.push({ name: 'schema-complete', passed: false, message: `Missing fields: ${missing.join(', ')}` })
    return { passed: false, checks }
  }
  checks.push({ name: 'schema-complete', passed: true })

  // Id format
  if (!PLUGIN_ID_RE.test(manifest.id)) {
    checks.push({ name: 'id-format', passed: false, message: `"${manifest.id}" does not match @scope/name regex` })
    return { passed: false, checks }
  }
  checks.push({ name: 'id-format', passed: true })

  // Reserved scope guard
  const [, scopePart] = PLUGIN_ID_RE.exec(manifest.id)
  if (RESERVED_SCOPES.includes(scopePart)) {
    checks.push({ name: 'reserved-scope', passed: false, message: `scope "@${scopePart}" is reserved for official OpenPen modules` })
    return { passed: false, checks }
  }
  checks.push({ name: 'reserved-scope', passed: true })

  // Scope matches PR author (check 1 of registration acceptance)
  const scopeMatchesAuthor = scopePart.toLowerCase() === prAuthor.toLowerCase()
  checks.push({
    name: 'scope-matches-submitter',
    passed: scopeMatchesAuthor,
    message: scopeMatchesAuthor ? undefined : `scope "${scopePart}" != PR author "${prAuthor}"`,
  })
  if (!scopeMatchesAuthor) return { passed: false, checks }

  // minAppVersion semver
  const validSemver = SEMVER_RE.test(manifest.minAppVersion)
  checks.push({ name: 'min-app-version-semver', passed: validSemver, message: validSemver ? undefined : `"${manifest.minAppVersion}" is not x.y.z semver` })

  // Typosquat check within scope (Levenshtein <= 2, registration only)
  if (isRegistration) {
    const existing = collectExistingNamesInScope(scopePart, filePath)
    const namePart = manifest.name
    const dupes = existing.filter((n) => n !== namePart && levenshtein(n, namePart) <= 2)
    checks.push({
      name: 'intra-scope-typosquat',
      passed: dupes.length === 0,
      message: dupes.length > 0 ? `Too similar to existing: ${dupes.join(', ')} (Levenshtein <= 2)` : undefined,
    })
  }

  // Release zip reachable + sha256 matches
  const integrityResult = await verifyReleaseIntegrity(manifest.releaseUrl, manifest.sha256)
  checks.push({ name: 'release-integrity', passed: integrityResult.passed, message: integrityResult.message })
  if (!integrityResult.passed) return { passed: false, checks }

  // plugin.json must declare at least one contribution slot
  const contributionsResult = verifyContributionSlots(integrityResult.zipBuffer)
  checks.push({ name: 'plugin-json-contributions', ...contributionsResult })

  const passed = checks.every((c) => c.passed)
  return { passed, checks }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function collectExistingNamesInScope(scope, currentFile) {
  const scopeDir = path.join('plugins', scope)
  if (!fs.existsSync(scopeDir)) return []
  const names = []
  for (const entry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const mPath = path.join(scopeDir, entry.name, 'manifest.json')
    if (mPath === currentFile) continue
    try {
      const m = JSON.parse(fs.readFileSync(mPath, 'utf-8'))
      if (m.name) names.push(m.name)
    } catch { /* skip */ }
  }
  return names
}

function levenshtein(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1])
    }
  }
  return dp[m][n]
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'openpen-catalog-bot' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(httpsGet(res.headers.location))
        return
      }
      const chunks = []
      res.on('data', (c) => chunks.push(c))
      res.on('end', () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks) }))
    })
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(new Error('Request timeout')) })
  })
}

async function verifyReleaseIntegrity(releaseUrl, expectedSha256) {
  try {
    const { statusCode, body } = await httpsGet(releaseUrl)
    if (statusCode !== 200) {
      return { passed: false, message: `Release URL returned HTTP ${statusCode}: ${releaseUrl}` }
    }
    const actual = crypto.createHash('sha256').update(body).digest('hex')
    if (actual !== expectedSha256) {
      return { passed: false, message: `sha256 mismatch — expected ${expectedSha256}, got ${actual}` }
    }
    return { passed: true, zipBuffer: body }
  } catch (err) {
    return { passed: false, message: `Failed to fetch release URL: ${err.message}` }
  }
}

/**
 * Extracts plugin.json from a zip buffer and verifies it declares ≥1 contribution slot.
 * @param {Buffer} zipBuffer
 * @returns {{ passed: boolean, message?: string }}
 */
export function verifyContributionSlots(zipBuffer) {
  let zip
  try {
    zip = new AdmZip(zipBuffer)
  } catch {
    return { passed: false, message: 'Release zip could not be parsed' }
  }

  const entry = zip.getEntry('plugin.json')
  if (!entry) {
    return {
      passed: false,
      message: 'plugin.json is missing from the release zip',
    }
  }

  let pluginJson
  try {
    pluginJson = JSON.parse(entry.getData().toString('utf-8'))
  } catch {
    return { passed: false, message: 'plugin.json in the release zip is not valid JSON' }
  }

  if (!Array.isArray(pluginJson.contributions) || pluginJson.contributions.length === 0) {
    return {
      passed: false,
      message: 'Plugin must declare at least one contribution slot in `plugin.json` (per `plugin-spec.md` §3.3.1 rule 6)',
    }
  }

  return { passed: true }
}

// ── Main ──────────────────────────────────────────────────────────────────────
// Guard prevents side effects when this module is imported by tests.

if (import.meta.url === `file://${process.argv[1]}`) {
  const allChecks = []
  let allPassed = true

  for (const file of files) {
    const result = await validateFile(file)
    allChecks.push(...result.checks.map((c) => ({ ...c, file })))
    if (!result.passed) allPassed = false
  }

  const output = { passed: allPassed, checks: allChecks }
  process.stdout.write(JSON.stringify(output, null, 2) + '\n')
  process.exit(allPassed ? 0 : 1)
}
