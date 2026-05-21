#!/usr/bin/env node
/**
 * openpen-cli — OpenPen Plugin CLI
 *
 * Thin command dispatcher. Install/remove/list logic lives in
 * @openpen/plugin-manager so it can be shared with the in-app marketplace.
 *
 * Usage:
 *   npx openpen create @scope/name
 *   npx openpen plugin add <source> [--yes]
 *   npx openpen plugin install @scope/name [--yes]
 *   npx openpen plugin list
 *   npx openpen plugin remove @scope/name
 *   npx openpen pack
 *   npx openpen publish
 */

import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  installFromLocal,
  installFromGitHubReleaseUrl,
  installFromGitHubRepo,
  installFromCatalog,
  removePlugin,
  listInstalled,
  PLUGIN_ID_RE,
  CATALOG_OWNER,
  CATALOG_REPO,
} from '@openpen/plugin-manager'
import { promptInstallConfirm, extractYesFlag } from '../lib/confirm.js'

const PLUGINS_DIR = path.join(os.homedir(), '.openpen', 'plugins')

const [,, topCommand, subCommand, ...args] = process.argv

if (topCommand === 'create') {
  await cmdCreate(subCommand)
} else if (topCommand === 'plugin') {
  switch (subCommand) {
    case 'add': {
      const { yes, rest } = extractYesFlag(args)
      await cmdPluginAdd(rest[0], { yes })
      break
    }
    case 'install': {
      const { yes, rest } = extractYesFlag(args)
      await cmdPluginInstall(rest[0], { yes })
      break
    }
    case 'list':    await cmdPluginList(); break
    case 'remove':  await cmdPluginRemove(args[0]); break
    default:        printPluginHelp()
  }
} else if (topCommand === 'pack') {
  await cmdPack()
} else if (topCommand === 'publish') {
  await cmdPublish()
} else {
  printHelp()
}

async function ensureInstallConfirmed(pluginId, { yes }) {
  if (yes) return
  if (!process.stdin.isTTY) {
    console.error('Error: `openpen plugin install/add` requires an interactive terminal to confirm.')
    console.error('  Pass --yes (or -y) to bypass in CI / scripts after vetting the plugin source.')
    process.exit(1)
  }
  const confirmed = await promptInstallConfirm({
    input: process.stdin,
    output: process.stderr,
    pluginId,
  })
  if (!confirmed) {
    console.error('Aborted.')
    process.exit(1)
  }
}

// ── create ────────────────────────────────────────────────────────────────────

async function cmdCreate(pluginId) {
  if (!pluginId || !PLUGIN_ID_RE.test(pluginId)) {
    console.error('Usage: npx openpen create @scope/name')
    console.error('  Both scope and name must be lowercase letters, digits, or hyphens.')
    process.exit(1)
  }

  const [, scope, name] = PLUGIN_ID_RE.exec(pluginId)
  const destDir = path.join(process.cwd(), name)

  if (fs.existsSync(destDir)) {
    console.error(`Error: Directory already exists: ${destDir}`)
    process.exit(1)
  }

  // Best-effort GitHub auth check — warn but never block.
  checkGitHubAuthScope(scope)

  // Locate plugin-starter template (same monorepo; also works when installed via npm).
  const starterDir = findStarterDir()
  if (!starterDir) {
    console.error('Error: Could not locate plugin-starter template.')
    console.error('  If running outside the OpenPen repo, install the starter separately.')
    process.exit(1)
  }

  copyStarterTo(starterDir, destDir, pluginId, scope, name)

  console.log(`Created plugin scaffold in ./${name}/`)
  console.log('\nNext steps:')
  console.log(`  cd ${name}`)
  console.log('  npm install')
  console.log('  npm run build')
  console.log('  npm run pack')
}

function findStarterDir() {
  const cliRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
  // Published path: prepack copied the starter into the CLI tarball.
  const bundled = path.join(cliRoot, 'templates/plugin-starter')
  if (fs.existsSync(path.join(bundled, 'plugin.json'))) return bundled
  // Monorepo dev path: read directly from the workspace source.
  const monorepo = path.resolve(cliRoot, '../plugin-starter')
  if (fs.existsSync(path.join(monorepo, 'plugin.json'))) return monorepo
  return null
}

function copyStarterTo(starterDir, destDir, pluginId, scope, name) {
  fs.mkdirSync(destDir, { recursive: true })

  const skip = new Set(['node_modules', 'dist', '.git'])
  function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true })
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath)
      } else {
        let content = fs.readFileSync(srcPath, 'utf-8')
        // Replace placeholders in all text files
        content = content
          .replace(/@your-scope\/your-plugin-name/g, pluginId)
          .replace(/your-scope/g, scope)
          .replace(/your-plugin-name/g, name)
          .replace(/Your Plugin Name/g, toTitleCase(name))
          .replace(/your-github-username/g, scope)
        fs.writeFileSync(destPath, content)
      }
    }
  }

  copyDir(starterDir, destDir)
}

function toTitleCase(str) {
  return str.replace(/(^|-)(\w)/g, (_, sep, ch) => (sep ? ' ' : '') + ch.toUpperCase())
}

function checkGitHubAuthScope(expectedScope) {
  const result = spawnSync('gh', ['auth', 'status'], { encoding: 'utf-8' })
  if (result.error) {
    console.warn('Warning: gh CLI not found. Install https://cli.github.com for full auth integration.')
    return
  }
  if (result.status !== 0) {
    console.warn('Warning: Not authenticated with GitHub (`gh auth status` failed).')
    console.warn('  Your GitHub login must match the scope in the plugin id when publishing.')
    return
  }
  const loginMatch = result.stdout.match(/Logged in to github\.com account (\S+)/i)
    ?? result.stderr.match(/Logged in to github\.com account (\S+)/i)
  if (loginMatch && loginMatch[1].toLowerCase() !== expectedScope) {
    console.warn(`Warning: Your GitHub login is "${loginMatch[1]}" but the scope is "${expectedScope}".`)
    console.warn('  These must match when you run `openpen publish`. You can proceed with scaffolding now.')
  }
}

// ── plugin add ────────────────────────────────────────────────────────────────

async function cmdPluginAdd(source, { yes } = {}) {
  if (!source) {
    console.error('Usage: npx openpen plugin add <source> [--yes]')
    process.exit(1)
  }
  await ensureInstallConfirmed(source, { yes })
  fs.mkdirSync(PLUGINS_DIR, { recursive: true })
  const kind = detectSource(source)
  let entry
  try {
    switch (kind) {
      case 'local':
        entry = await installFromLocal(source, { pluginsDir: PLUGINS_DIR, onProgress: printProgress })
        break
      case 'github-release-url':
        console.log(`Downloading plugin from: ${source}`)
        entry = await installFromGitHubReleaseUrl(source, { pluginsDir: PLUGINS_DIR, onProgress: printProgress })
        break
      case 'github-repo':
        console.log(`Resolving latest release from: ${source}`)
        entry = await installFromGitHubRepo(source, { pluginsDir: PLUGINS_DIR, onProgress: printProgress })
        break
    }
    printInstallSuccess(entry)
  } catch (err) {
    console.error(`Error: ${err?.message ?? err}`)
    process.exit(1)
  }
}

// ── plugin install ────────────────────────────────────────────────────────────

async function cmdPluginInstall(pluginId, { yes } = {}) {
  if (!pluginId) {
    console.error('Usage: npx openpen plugin install @scope/name [--yes]')
    process.exit(1)
  }
  await ensureInstallConfirmed(pluginId, { yes })
  console.log(`Installing ${pluginId} from catalog...`)
  try {
    const entry = await installFromCatalog(pluginId, {
      pluginsDir: PLUGINS_DIR,
      onProgress: printProgress,
    })
    printInstallSuccess(entry)
  } catch (err) {
    console.error(`Error: ${err?.message ?? err}`)
    process.exit(1)
  }
}

// ── plugin list ───────────────────────────────────────────────────────────────

async function cmdPluginList() {
  const plugins = await listInstalled({ pluginsDir: PLUGINS_DIR })
  if (plugins.length === 0) {
    console.log('No plugins installed.')
    return
  }
  console.log(`Installed plugins (${plugins.length}):\n`)
  for (const p of plugins) {
    console.log(`  ${p.id}  v${p.version}`)
  }
}

// ── plugin remove ─────────────────────────────────────────────────────────────

async function cmdPluginRemove(pluginId) {
  if (!pluginId) {
    console.error('Usage: npx openpen plugin remove @scope/name')
    process.exit(1)
  }
  try {
    await removePlugin(pluginId, { pluginsDir: PLUGINS_DIR })
    console.log(`Plugin removed: ${pluginId}`)
    console.log('Restart OpenPen to deactivate the plugin.')
  } catch (err) {
    console.error(`Error: ${err?.message ?? err}`)
    process.exit(1)
  }
}

// ── pack ──────────────────────────────────────────────────────────────────────

async function cmdPack() {
  const cwd = process.cwd()
  const manifestPath = path.join(cwd, 'plugin.json')
  if (!fs.existsSync(manifestPath)) {
    console.error('Error: plugin.json not found. Run from your plugin project root.')
    process.exit(1)
  }
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  } catch {
    console.error('Error: plugin.json is not valid JSON.')
    process.exit(1)
  }
  if (!manifest.id || !PLUGIN_ID_RE.test(manifest.id)) {
    console.error(`Error: plugin.json "id" must use @scope/name format. Got: ${JSON.stringify(manifest.id)}`)
    process.exit(1)
  }
  if (!manifest.version || typeof manifest.version !== 'string') {
    console.error('Error: plugin.json must have a "version" string (e.g. "1.0.0").')
    process.exit(1)
  }
  if (!fs.existsSync(path.join(cwd, 'dist', 'renderer.js'))) {
    console.error('Error: dist/renderer.js not found. Run your build first (e.g. npx @openpen/build).')
    process.exit(1)
  }

  const [, scopePart, namePart] = PLUGIN_ID_RE.exec(manifest.id)
  const zipName = `${scopePart}-${namePart}-${manifest.version}.zip`
  const zipPath = path.join(cwd, zipName)

  await createZip(cwd, zipPath)

  const sha256 = createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex')

  console.log(`Created ${zipName}`)
  console.log(`sha256: ${sha256}`)
  console.log('\nNext steps:')
  console.log(`  1. Create a GitHub Release (tag: v${manifest.version})`)
  console.log(`  2. Attach ${zipName} to the release`)
  console.log('  3. Run: npx openpen publish')
}

// ── publish ───────────────────────────────────────────────────────────────────

async function cmdPublish() {
  const cwd = process.cwd()

  // Step 1: read and validate plugin.json
  const manifestPath = path.join(cwd, 'plugin.json')
  if (!fs.existsSync(manifestPath)) {
    console.error('Error: plugin.json not found. Run from your plugin project root.')
    process.exit(1)
  }
  let manifest
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  } catch {
    console.error('Error: plugin.json is not valid JSON.')
    process.exit(1)
  }
  if (!manifest.id || !PLUGIN_ID_RE.test(manifest.id)) {
    console.error(`Error: plugin.json "id" must use @scope/name format. Got: ${JSON.stringify(manifest.id)}`)
    process.exit(1)
  }

  const [, scopePart, namePart] = PLUGIN_ID_RE.exec(manifest.id)
  const version = manifest.version

  // Step 2: verify zip exists
  const zipName = `${scopePart}-${namePart}-${version}.zip`
  const zipPath = path.join(cwd, zipName)
  if (!fs.existsSync(zipPath)) {
    console.error(`Error: ${zipName} not found. Run \`npx openpen pack\` first.`)
    process.exit(1)
  }

  // Step 3: verify GitHub Release exists and has the zip asset
  const releaseTag = `v${version}`
  const releaseView = ghRun(['release', 'view', releaseTag, '--json', 'assets,tagName'])
  if (!releaseView.ok) {
    console.error(`Error: Release tag ${releaseTag} not found in this repo.`)
    console.error(`  Run: gh release create ${releaseTag} ./${zipName}`)
    process.exit(1)
  }
  let releaseData
  try {
    releaseData = JSON.parse(releaseView.stdout)
  } catch {
    console.error('Error: Could not parse gh release output.')
    process.exit(1)
  }
  const asset = releaseData.assets?.find((a) => a.name === zipName)
  if (!asset) {
    console.error(`Error: Release ${releaseTag} does not have asset "${zipName}".`)
    console.error(`  Attach it via: gh release upload ${releaseTag} ./${zipName}`)
    process.exit(1)
  }
  const releaseUrl = asset.url

  // Step 4: verify authenticated scope matches plugin scope
  const userResult = ghRun(['api', 'user', '--jq', '.login'])
  if (!userResult.ok) {
    console.error('Error: Not authenticated with GitHub. Run `gh auth login` first.')
    process.exit(1)
  }
  const authenticatedLogin = userResult.stdout.trim()
  if (authenticatedLogin.toLowerCase() !== scopePart.toLowerCase()) {
    console.error(`Error: Authenticated GitHub login "${authenticatedLogin}" does not match plugin scope "${scopePart}".`)
    console.error('  Your GitHub login must equal the scope in the plugin id.')
    process.exit(1)
  }

  // Steps 5–6: compute sha256 and fetch owner metadata
  const sha256 = createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex')

  const ownerResult = ghRun(['api', `users/${authenticatedLogin}`, '--jq', '[.id, .login, .type] | @json'])
  if (!ownerResult.ok) {
    console.error(`Error: Could not fetch owner info for "${authenticatedLogin}".`)
    process.exit(1)
  }
  const [ownerId, ownerLogin, ownerType] = JSON.parse(JSON.parse(ownerResult.stdout.trim()))

  // Step 7: detect Registration vs Update PR
  const catalogOwner = CATALOG_OWNER
  const catalogRepo = CATALOG_REPO
  const manifestApiPath = `repos/${catalogOwner}/${catalogRepo}/contents/plugins/${scopePart}/${namePart}/manifest.json`
  const existsResult = ghRun(['api', manifestApiPath, '--silent'])
  const isRegistration = !existsResult.ok

  // Step 8: fork catalog repo (no-op if already forked)
  ghRun(['repo', 'fork', `${catalogOwner}/${catalogRepo}`, '--clone=false'])

  // Step 9: write manifest to fork via GitHub API
  const catalogManifest = {
    id: manifest.id,
    scope: scopePart,
    name: namePart,
    ownerId,
    ownerLogin,
    ownerType,
    description: manifest.description ?? '',
    minAppVersion: manifest.minAppVersion ?? '1.0.0',
    repo: `https://github.com/${authenticatedLogin}/${namePart}`,
    latestVersion: version,
    releaseUrl,
    sha256,
    state: 'active',
    ...(isRegistration ? {} : {}),
    ...(manifest.forkOf ? { forkOf: manifest.forkOf } : {}),
  }
  const catalogManifestContent = Buffer.from(JSON.stringify(catalogManifest, null, 2) + '\n').toString('base64')

  const branchName = isRegistration
    ? `register/${scopePart}-${namePart}`
    : `update/${scopePart}-${namePart}-${version}`

  // Get default branch SHA to create branch from
  const repoInfoResult = ghRun(['api', `repos/${authenticatedLogin}/${catalogRepo}`, '--jq', '.default_branch'])
  const defaultBranch = repoInfoResult.ok ? repoInfoResult.stdout.trim() : 'main'
  const branchShaResult = ghRun([
    'api', `repos/${authenticatedLogin}/${catalogRepo}/git/ref/heads/${defaultBranch}`,
    '--jq', '.object.sha',
  ])
  if (!branchShaResult.ok) {
    console.error(`Error: Could not get branch SHA for ${authenticatedLogin}/${catalogRepo}.`)
    console.error('  Make sure the fork exists and you have access.')
    process.exit(1)
  }
  const baseSha = branchShaResult.stdout.trim()

  // Create branch on fork
  ghRun(['api', `repos/${authenticatedLogin}/${catalogRepo}/git/refs`,
    '--method', 'POST',
    '--field', `ref=refs/heads/${branchName}`,
    '--field', `sha=${baseSha}`,
  ])

  // Commit manifest file via API
  const filePath = `plugins/${scopePart}/${namePart}/manifest.json`
  const createFileArgs = [
    'api', `repos/${authenticatedLogin}/${catalogRepo}/contents/${filePath}`,
    '--method', 'PUT',
    '--field', `message=plugin: ${isRegistration ? 'register' : 'update'} ${manifest.id} v${version}`,
    '--field', `content=${catalogManifestContent}`,
    '--field', `branch=${branchName}`,
  ]

  // If updating, need the existing file SHA
  if (!isRegistration) {
    const existingFileResult = ghRun([
      'api', `repos/${authenticatedLogin}/${catalogRepo}/contents/${filePath}`,
      '--jq', '.sha',
    ])
    if (existingFileResult.ok) {
      createFileArgs.push('--field', `sha=${existingFileResult.stdout.trim()}`)
    }
  }

  const commitResult = ghRun(createFileArgs)
  if (!commitResult.ok) {
    console.error('Error: Failed to commit manifest to fork.')
    console.error(commitResult.stderr)
    process.exit(1)
  }

  // Step 10: open PR
  const prTitle = isRegistration
    ? `plugin: register ${manifest.id}`
    : `plugin: update ${manifest.id} v${version}`
  const prBody = isRegistration
    ? `Registration PR for \`${manifest.id}\` v${version}.\n\nSubmitted via \`openpen publish\`.`
    : `Update \`${manifest.id}\` to v${version}.\n\nSubmitted via \`openpen publish\`.`

  const prResult = ghRun([
    'pr', 'create',
    '--repo', `${catalogOwner}/${catalogRepo}`,
    '--head', `${authenticatedLogin}:${branchName}`,
    '--title', prTitle,
    '--body', prBody,
  ])

  if (!prResult.ok) {
    console.error('Error: Failed to open PR.')
    console.error(prResult.stderr)
    process.exit(1)
  }

  const prUrl = prResult.stdout.trim()
  console.log(isRegistration
    ? `Registration PR opened (awaiting maintainer review): ${prUrl}`
    : `Update PR opened (bot will auto-merge after validation): ${prUrl}`)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectSource(source) {
  if (/^https?:\/\/.*\.zip$/i.test(source)) return 'github-release-url'
  if (/^https?:\/\/github\.com\/[^/]+\/[^/]+\/?$/.test(source)) return 'github-repo'
  if (/^github:[^/]+\/[^/]+$/.test(source)) return 'github-repo'
  if (fs.existsSync(source)) return 'local'
  console.error(`Error: Unrecognized source: ${source}`)
  console.error('  Use a local path, a GitHub release zip URL (.zip), or a github.com repo URL.')
  process.exit(1)
}

function printProgress(event) {
  const label = { download: 'Downloading', verify: 'Verifying', extract: 'Extracting' }[event.stage]
  if (event.percent !== undefined) {
    process.stdout.write(`\r${label}... ${event.percent}%`)
    if (event.percent === 100) process.stdout.write('\n')
  } else {
    console.log(`${label}...`)
  }
}

function printInstallSuccess(entry) {
  console.log(`\nInstalled ${entry.id} v${entry.version}.`)
  console.log('Restart OpenPen to activate the plugin.')
}

async function createZip(cwd, zipPath) {
  const { default: archiver } = await import('archiver')
  const { createWriteStream } = await import('node:fs')
  await new Promise((resolve, reject) => {
    const output = createWriteStream(zipPath)
    const archive = archiver('zip', { zlib: { level: 6 } })
    output.on('close', resolve)
    archive.on('error', reject)
    archive.pipe(output)
    archive.file(path.join(cwd, 'plugin.json'), { name: 'plugin.json' })
    archive.directory(path.join(cwd, 'dist'), 'dist')
    const localesDir = path.join(cwd, 'locales')
    if (fs.existsSync(localesDir)) archive.directory(localesDir, 'locales')
    archive.finalize()
  })
}

/** Run a gh CLI command synchronously. Returns { ok, stdout, stderr }. */
function ghRun(args) {
  const result = spawnSync('gh', args, { encoding: 'utf-8' })
  return {
    ok: result.status === 0 && !result.error,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

// ── Help ──────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
openpen-cli — OpenPen Plugin CLI

Usage:
  npx openpen <command> [args]

Commands:
  create @scope/name              Scaffold a new plugin from the starter template
  plugin add <source> [--yes]     Install a plugin (local path, zip URL, or GitHub repo)
  plugin install @scope/name [--yes]
                                  Install a plugin from the catalog
  plugin list                     List installed plugins
  plugin remove @scope/name       Remove an installed plugin
  pack                            Create a distributable zip for the current plugin
  publish                         Open a catalog PR for the current plugin

Plugins are installed to: ${PLUGINS_DIR}
Restart OpenPen after installing or removing plugins.

\`plugin install\` and \`plugin add\` prompt before installing because plugins run
with full host access. Pass --yes (or -y) to bypass in CI / scripts after vetting
the plugin source.
`)
}

function printPluginHelp() {
  console.log(`
openpen plugin — manage installed OpenPen plugins

Usage:
  npx openpen plugin <subcommand> [args]

Subcommands:
  add <source> [--yes]      Install a plugin
                            source: local path | release zip URL | github.com repo URL
  install @scope/name [--yes]
                            Install from catalog
  list                      List installed plugins
  remove @scope/name        Remove a plugin by ID

Flags:
  --yes, -y                 Skip the security prompt (for CI / scripts).
`)
}
