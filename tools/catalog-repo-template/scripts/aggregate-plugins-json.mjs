#!/usr/bin/env node
/**
 * aggregate-plugins-json.mjs
 *
 * Walks plugins/<scope>/<name>/manifest.json files and writes plugins.json
 * at the repo root. Run by the aggregate-plugins-json.yml workflow after
 * every merge to main that touches the plugins/ tree.
 *
 * Self-contained: uses only node:fs, node:path, node:https. No npm install required.
 *
 * Usage:
 *   node scripts/aggregate-plugins-json.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import https from 'node:https'

const PLUGINS_DIR = path.join(process.cwd(), 'plugins')
const OUTPUT_PATH = path.join(process.cwd(), 'plugins.json')

const HOST_RELEASES_API = 'https://api.github.com/repos/openpen-platform/openpen/releases/latest'

// ── Semver helpers ──────────────────────────────────────────────────────────

/**
 * Parse a semver string into [major, minor, patch] integers.
 * Returns null for non-conforming inputs.
 * @param {string} v
 * @returns {[number, number, number] | null}
 */
function parseSemver(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v)
  if (!m) return null
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)]
}

/**
 * Compare two semver strings.
 * Returns -1 when a < b, 0 when a == b, 1 when a > b.
 * Returns 0 on parse failure (treat as equal to avoid false incompatible flags).
 * @param {string} a
 * @param {string} b
 * @returns {-1 | 0 | 1}
 */
export function compareSemver(a, b) {
  const pa = parseSemver(a)
  const pb = parseSemver(b)
  if (!pa || !pb) return 0
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1
    if (pa[i] > pb[i]) return 1
  }
  return 0
}

// ── GitHub API fetch ────────────────────────────────────────────────────────

/**
 * Fetch the latest stable host version from GitHub Releases API.
 * Strips the leading 'v' from tag_name.
 * Returns null on any error (network, rate limit, parse failure).
 * @param {{ hostLatestVersion?: string }} [opts] - inject for testing
 * @returns {Promise<string | null>}
 */
export async function fetchHostLatestVersion(opts) {
  if (opts?.hostLatestVersion !== undefined) return opts.hostLatestVersion

  return new Promise((resolve) => {
    const req = https.get(
      HOST_RELEASES_API,
      { headers: { 'User-Agent': 'openpen-catalog-aggregator', Accept: 'application/vnd.github+json' } },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
            const tag = typeof body.tag_name === 'string' ? body.tag_name : null
            if (!tag) { resolve(null); return }
            resolve(tag.startsWith('v') ? tag.slice(1) : tag)
          } catch {
            resolve(null)
          }
        })
      }
    )
    req.on('error', () => resolve(null))
    req.setTimeout(10000, () => { req.destroy(); resolve(null) })
  })
}

// ── Manifest collection ─────────────────────────────────────────────────────

function collectManifests() {
  const plugins = []

  if (!fs.existsSync(PLUGINS_DIR)) return plugins

  for (const scopeEntry of fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
    if (!scopeEntry.isDirectory()) continue
    const scopeDir = path.join(PLUGINS_DIR, scopeEntry.name)

    for (const nameEntry of fs.readdirSync(scopeDir, { withFileTypes: true })) {
      if (!nameEntry.isDirectory()) continue
      const manifestPath = path.join(scopeDir, nameEntry.name, 'manifest.json')
      if (!fs.existsSync(manifestPath)) continue

      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
        if (!manifest.id || !manifest.state) continue
        // Exclude tombstoned entries from the public index so they cannot be installed.
        if (manifest.state === 'tombstoned') continue
        plugins.push(manifest)
      } catch (err) {
        console.warn(`Skipping malformed manifest: ${manifestPath} (${err.message})`)
      }
    }
  }

  // Sort deterministically by id for stable diffs.
  plugins.sort((a, b) => a.id.localeCompare(b.id))
  return plugins
}

/**
 * Enrich a plugin list with `incompatible: true` for entries whose
 * minAppVersion exceeds the host's latest stable release.
 *
 * When hostLatestVersion is null (API failure) no incompatible flags are set
 * and a warning is emitted — callers must not block aggregation on this.
 *
 * @param {Array<Record<string, unknown>>} plugins
 * @param {string | null} hostLatestVersion
 * @returns {Array<Record<string, unknown>>}
 */
export function enrichWithIncompatible(plugins, hostLatestVersion) {
  if (hostLatestVersion === null) return plugins

  return plugins.map((p) => {
    const minApp = typeof p.minAppVersion === 'string' ? p.minAppVersion : null
    if (!minApp) return p
    const incompatible = compareSemver(minApp, hostLatestVersion) > 0
    if (!incompatible) return p
    return { ...p, incompatible: true }
  })
}

// ── Main ────────────────────────────────────────────────────────────────────

const plugins = collectManifests()

let hostLatestVersion = null
try {
  hostLatestVersion = await fetchHostLatestVersion()
  if (hostLatestVersion) {
    console.log(`Host latest stable version: ${hostLatestVersion}`)
  } else {
    console.warn('Could not fetch host latest version from GitHub API — skipping incompatible enrichment.')
  }
} catch (err) {
  console.warn(`GitHub API fetch failed: ${err.message} — skipping incompatible enrichment.`)
}

const enriched = enrichWithIncompatible(plugins, hostLatestVersion)

const output = {
  schemaVersion: 2,
  updatedAt: new Date().toISOString(),
  plugins: enriched,
}

fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n')
console.log(`Wrote plugins.json with ${enriched.length} plugin(s).`)
