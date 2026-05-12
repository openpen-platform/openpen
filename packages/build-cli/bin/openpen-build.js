#!/usr/bin/env node
/**
 * @openpen/build CLI.
 *
 *   npx @openpen/build           # one-shot build → dist/renderer.js
 *   npx @openpen/build --watch   # rebuild on change
 *   npx @openpen/build --check   # type-check only (tsc --noEmit) if tsconfig present
 *   npx @openpen/build pack      # bundle dist/ + plugin.json into a distributable zip
 *
 * The plugin author's repo only needs a `plugin.json` + `src/index.ts`.
 * Zero Vite config; the preset (src/vite-preset.js) handles externals,
 * formats, sourcemaps, and the renderer.js output filename.
 */

import { build } from 'vite'
import path from 'node:path'
import fs from 'node:fs'
import { createWriteStream } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { buildPluginConfig } from '../src/vite-preset.js'

const PLUGIN_ID_RE = /^@([a-z0-9][a-z0-9-]{0,38})\/([a-z0-9][a-z0-9-]{0,38})$/

const args = process.argv.slice(2)
const subCommand = args[0]
const watch = args.includes('--watch') || args.includes('-w')
const check = args.includes('--check')

const cwd = process.cwd()
const manifestPath = path.join(cwd, 'plugin.json')
const entryPath = path.join(cwd, 'src/index.ts')

function fail(message, code = 1) {
  console.error(`[openpen-build] ${message}`)
  process.exit(code)
}

// ── pack sub-command ───────────────────────────────────────────────────────────

if (subCommand === 'pack') {
  if (!fs.existsSync(manifestPath)) {
    fail(`plugin.json not found in ${cwd}. Run from your plugin's project root.`)
  }

  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  } catch {
    fail('plugin.json is not valid JSON.')
  }

  if (!manifest.id || !PLUGIN_ID_RE.test(manifest.id)) {
    fail(`plugin.json "id" must use @scope/name format (e.g. @alice/my-plugin). Got: ${JSON.stringify(manifest.id)}`)
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    fail('plugin.json must have a "version" string (semver, e.g. "1.0.0").')
  }

  const distRenderer = path.join(cwd, 'dist', 'renderer.js')
  if (!fs.existsSync(distRenderer)) {
    fail('dist/renderer.js not found.\n  Plugin not built. Run npx @openpen/build first.')
  }

  const [, scopePart, namePart] = PLUGIN_ID_RE.exec(manifest.id) ?? []
  const zipName = `${scopePart}-${namePart}-${manifest.version}.zip`
  const zipPath = path.join(cwd, zipName)

  const { default: archiver } = await import('archiver')
  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 6 } })
    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)
    archive.file(manifestPath, { name: 'plugin.json' })
    archive.directory(path.join(cwd, 'dist'), 'dist')
    const localesDir = path.join(cwd, 'locales')
    if (fs.existsSync(localesDir)) archive.directory(localesDir, 'locales')
    archive.finalize()
  })

  const { createHash } = await import('node:crypto')
  const hash = createHash('sha256')
  hash.update(fs.readFileSync(zipPath))
  const sha256 = hash.digest('hex')

  console.log(`[openpen-build] Created ${zipName}`)
  console.log(`sha256: ${sha256}`)
  console.log('\nNext steps:')
  console.log('  1. Create a GitHub Release (tag: v' + manifest.version + ')')
  console.log(`  2. Attach ${zipName} to the release`)
  process.exit(0)
}

// ── build / check (default) ───────────────────────────────────────────────────

if (!fs.existsSync(manifestPath)) {
  fail(`plugin.json not found in ${cwd}. Run from your plugin's project root.`)
}
if (!fs.existsSync(entryPath)) {
  fail(`src/index.ts not found. The default entry path is required.`)
}

if (check) {
  const tsconfigPath = path.join(cwd, 'tsconfig.json')
  if (!fs.existsSync(tsconfigPath)) {
    fail('--check requires a tsconfig.json in the plugin root.', 1)
  }
  const result = spawnSync('npx', ['tsc', '--noEmit', '-p', tsconfigPath], {
    stdio: 'inherit',
    shell: false,
  })
  process.exit(result.status ?? 0)
}

console.log(`[openpen-build] ${watch ? 'watching' : 'building'} ${path.basename(cwd)}…`)

try {
  await build(buildPluginConfig({ cwd, watch }))
  if (!watch) console.log('[openpen-build] done → dist/renderer.js')
} catch (err) {
  fail(err?.message ?? String(err))
}
