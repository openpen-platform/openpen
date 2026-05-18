import path from 'node:path'
import fs from 'node:fs'
import os from 'node:os'
import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { createHash } from 'node:crypto'
import type { InstallOptions, PluginEntry } from './types.js'
import { PLUGIN_ID_RE, pluginsDirFor } from './id.js'

// unzipper ships CommonJS; import via dynamic import and grab the default.
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const unzipper: any = (await import('unzipper')).default

// ── Shared helpers ────────────────────────────────────────────────────────────

function defaultPluginsDir(opts?: InstallOptions): string {
  return opts?.pluginsDir ?? path.join(os.homedir(), '.openpen', 'plugins')
}

function readManifest(dir: string): Record<string, unknown> | null {
  const p = path.join(dir, 'plugin.json')
  if (!fs.existsSync(p)) return null
  try {
    const json = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>
    if (!json.id || !json.name || !json.version) return null
    return json
  } catch {
    return null
  }
}

function validateManifest(dir: string): Record<string, unknown> {
  const manifest = readManifest(dir)
  if (!manifest) {
    throw new Error('plugin.json is missing or does not contain required fields (id, name, version).')
  }
  const id = manifest.id as string
  if (!PLUGIN_ID_RE.test(id)) {
    throw new Error(`plugin.json "id" must use @scope/name format. Got: ${JSON.stringify(id)}`)
  }
  if (!fs.existsSync(path.join(dir, 'dist', 'renderer.js'))) {
    throw new Error(
      'dist/renderer.js not found. Plugin is not built.' +
      ' Run your build first (e.g. npx @openpen/build).'
    )
  }
  return manifest
}

function computeSha256(filePath: string): string {
  const hash = createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

/**
 * Copy plugin artifacts (plugin.json + dist/ + locales/) to the install dir.
 * Backs up any existing installation; restores on failure.
 */
function copyPlugin(
  sourceDir: string,
  destDir: string,
): void {
  const backupDir = `${destDir}.bak`

  // Rotate existing install to backup
  if (fs.existsSync(destDir)) {
    if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true })
    fs.renameSync(destDir, backupDir)
  }

  try {
    fs.mkdirSync(destDir, { recursive: true })
    fs.copyFileSync(path.join(sourceDir, 'plugin.json'), path.join(destDir, 'plugin.json'))
    fs.cpSync(path.join(sourceDir, 'dist'), path.join(destDir, 'dist'), { recursive: true })
    const locales = path.join(sourceDir, 'locales')
    if (fs.existsSync(locales)) {
      fs.cpSync(locales, path.join(destDir, 'locales'), { recursive: true })
    }
    // Success — clean up backup
    if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true })
  } catch (err) {
    // Restore backup on failure
    if (fs.existsSync(destDir)) fs.rmSync(destDir, { recursive: true })
    if (fs.existsSync(backupDir)) fs.renameSync(backupDir, destDir)
    throw err
  }
}

function makeEntry(manifest: Record<string, unknown>): PluginEntry {
  const { scope, name } = parseIdParts(manifest.id as string)
  return {
    id: manifest.id as string,
    scope,
    name,
    version: manifest.version as string,
    installedAt: new Date().toISOString(),
  }
}

function parseIdParts(id: string): { scope: string; name: string } {
  const m = PLUGIN_ID_RE.exec(id)!
  return { scope: m[1], name: m[2] }
}

async function downloadToFile(
  url: string,
  destPath: string,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'openpen-cli' },
    signal,
  })
  if (!res.ok || !res.body) {
    throw new Error(`Download failed with HTTP ${res.status}: ${url}`)
  }
  const fileStream = createWriteStream(destPath)
  // res.body is a Web ReadableStream in newer Node; cast to any so pipeline accepts it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await pipeline(res.body as any, fileStream)
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  await fs.createReadStream(zipPath)
    .pipe(unzipper.Extract({ path: destDir }))
    .promise()
}

function isZipPath(p: string): boolean {
  return /\.zip$/i.test(p)
}

/**
 * Resolve a local source path into a directory that contains plugin.json.
 *
 * - Directory in → returns it unchanged (and a no-op cleanup).
 * - .zip file in → extracts to an ephemeral tempdir and returns that path
 *   plus a cleanup function the caller MUST invoke in `finally`.
 *
 * Some plugin zips wrap their contents in a single top-level folder
 * (matches `openpen pack` output: dist/ + plugin.json at the archive root,
 * but third-party tooling may add a wrapper). If the extracted tempdir does
 * not contain plugin.json at its root but does contain exactly one subdir
 * that does, transparently descend into that subdir.
 */
async function resolveLocalSource(
  sourcePath: string,
): Promise<{ dir: string; cleanup: () => void }> {
  const resolved = path.resolve(sourcePath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Path does not exist: ${resolved}`)
  }
  const stat = fs.statSync(resolved)

  if (stat.isDirectory()) {
    return { dir: resolved, cleanup: () => { /* no-op */ } }
  }

  if (!stat.isFile() || !isZipPath(resolved)) {
    throw new Error(
      `Local plugin source must be a directory or a .zip file. Got: ${resolved}`,
    )
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-local-'))
  const cleanup = () => fs.rmSync(tmpDir, { recursive: true, force: true })

  try {
    await extractZip(resolved, tmpDir)
  } catch (err) {
    cleanup()
    throw new Error(
      `Failed to extract zip: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  let dir = tmpDir
  if (!fs.existsSync(path.join(dir, 'plugin.json'))) {
    // Ignore dotfiles plus macOS Finder's `__MACOSX/` sidecar so the
    // unwrap heuristic still recognises an otherwise-single-folder zip.
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.name.startsWith('.') && e.name !== '__MACOSX')
    if (
      entries.length === 1 &&
      entries[0].isDirectory() &&
      fs.existsSync(path.join(dir, entries[0].name, 'plugin.json'))
    ) {
      dir = path.join(dir, entries[0].name)
    }
  }

  return { dir, cleanup }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface InspectedPluginSource {
  id: string
  scope: string
  name: string
  version: string
  /** Human-readable display name from plugin.json `name` field. */
  displayName: string
  description?: string
}

/**
 * Read plugin.json from a local source and return metadata without copying
 * any files. Source may be a directory or a .zip file (the zip is extracted
 * to a tempdir only to read plugin.json, then cleaned up).
 */
export async function inspectLocalSource(sourcePath: string): Promise<InspectedPluginSource> {
  const { dir, cleanup } = await resolveLocalSource(sourcePath)
  try {
    const manifest = readManifest(dir)
    if (!manifest) {
      throw new Error('plugin.json is missing or does not contain required fields (id, name, version).')
    }
    const id = manifest.id as string
    if (!PLUGIN_ID_RE.test(id)) {
      throw new Error(`plugin.json "id" must use @scope/name format. Got: ${JSON.stringify(id)}`)
    }
    const { scope, name } = parseIdParts(id)
    const changelog = Array.isArray(manifest.changelog)
      ? (manifest.changelog as unknown[]).filter((s): s is string => typeof s === 'string')
      : undefined
    return {
      id,
      scope,
      name,
      version: manifest.version as string,
      displayName: manifest.name as string,
      description: typeof manifest.description === 'string' ? manifest.description : undefined,
      ...(changelog && changelog.length > 0 ? { changelog } : {}),
    }
  } finally {
    cleanup()
  }
}

/**
 * Install a plugin from a local source. Source may be a built plugin
 * directory, or a .zip file produced by `openpen pack`. Both paths converge
 * on the same validate → copy flow.
 */
export async function installFromLocal(
  sourcePath: string,
  opts?: InstallOptions,
): Promise<PluginEntry> {
  opts?.onProgress?.({ stage: 'extract' })

  const { dir, cleanup } = await resolveLocalSource(sourcePath)
  try {
    const manifest = validateManifest(dir)
    const pluginsDir = defaultPluginsDir(opts)
    fs.mkdirSync(pluginsDir, { recursive: true })

    const destDir = pluginsDirFor(manifest.id as string, pluginsDir)
    copyPlugin(dir, destDir)

    return makeEntry(manifest)
  } finally {
    cleanup()
  }
}

/**
 * Install a plugin from a direct GitHub release zip URL.
 *
 * Downloads the zip, extracts it to a temp dir, validates its contents,
 * then copies to the install location.
 */
export async function installFromGitHubReleaseUrl(
  url: string,
  opts?: InstallOptions,
): Promise<PluginEntry> {
  if (!/^https?:\/\/.*\.zip$/i.test(url)) {
    throw new Error(`Expected a direct zip URL ending in .zip, got: ${url}`)
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-'))
  try {
    const zipPath = path.join(tmpDir, 'plugin.zip')

    opts?.onProgress?.({ stage: 'download', percent: 0 })
    await downloadToFile(url, zipPath, opts?.signal)
    opts?.onProgress?.({ stage: 'download', percent: 100 })

    opts?.onProgress?.({ stage: 'extract' })
    const extractDir = path.join(tmpDir, 'extracted')
    fs.mkdirSync(extractDir)
    await extractZip(zipPath, extractDir)

    const manifest = validateManifest(extractDir)
    const pluginsDir = defaultPluginsDir(opts)
    fs.mkdirSync(pluginsDir, { recursive: true })

    const destDir = pluginsDirFor(manifest.id as string, pluginsDir)
    copyPlugin(extractDir, destDir)

    return makeEntry(manifest)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}

/**
 * Install a plugin from a GitHub repo URL by resolving its latest release zip.
 *
 * The repo must have at least one published GitHub Release with a .zip asset.
 * Prefer `installFromGitHubReleaseUrl` when you already have the exact zip URL.
 */
export async function installFromGitHubRepo(
  repoUrl: string,
  opts?: InstallOptions,
): Promise<PluginEntry> {
  const httpsUrl = repoUrl.startsWith('github:')
    ? `https://github.com/${repoUrl.slice(7)}`
    : repoUrl
  const normalised = httpsUrl.replace(/\/$/, '')
  const match = normalised.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/)
  if (!match) {
    throw new Error(`Could not parse GitHub repo URL: ${httpsUrl}`)
  }
  const [, owner, repo] = match
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`

  const res = await fetch(apiUrl, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'openpen-cli' },
    signal: opts?.signal,
  })
  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status} for ${apiUrl}`)
  }
  const release = await res.json() as { assets?: Array<{ name: string; browser_download_url: string }> }
  const zipAsset = release.assets?.find((a) => a.name.endsWith('.zip'))
  if (!zipAsset) {
    throw new Error(
      `No .zip asset found in the latest release of ${normalised}.\n` +
      '  Provide a direct release zip URL instead:\n' +
      '  npx openpen plugin add https://github.com/.../releases/download/v1.0.0/scope-name-1.0.0.zip'
    )
  }
  return installFromGitHubReleaseUrl(zipAsset.browser_download_url, opts)
}

/**
 * Install a plugin by id from the central catalog.
 *
 * Fetches plugins.json, locates the entry, verifies sha256,
 * then delegates to installFromGitHubReleaseUrl.
 */
export async function installFromCatalog(
  id: string,
  opts?: InstallOptions & { catalogUrl?: string },
): Promise<PluginEntry> {
  const { CATALOG_URL_DEFAULT } = await import('./config.js')
  const catalogUrl = opts?.catalogUrl ?? CATALOG_URL_DEFAULT

  opts?.onProgress?.({ stage: 'download', percent: 0 })
  const res = await fetch(catalogUrl, {
    headers: { 'User-Agent': 'openpen-cli' },
    signal: opts?.signal,
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch catalog from ${catalogUrl}: HTTP ${res.status}`)
  }

  const catalog = await res.json() as import('./types.js').CatalogIndex
  const entry = catalog.plugins?.find((p) => p.id === id)
  if (!entry) {
    throw new Error(`Plugin "${id}" not found in catalog.`)
  }
  if (entry.state === 'tombstoned') {
    throw new Error(
      `Plugin "${id}" has been permanently removed from the catalog for security reasons.` +
      ' Installation is blocked.'
    )
  }
  if (entry.state === 'yanked') {
    throw new Error(
      `Plugin "${id}" has been yanked from the catalog. ` +
      'Use a direct zip URL to install a specific version if you still need it.'
    )
  }

  // Download the zip to a temp file so we can verify sha256 before extracting.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-'))
  try {
    const zipPath = path.join(tmpDir, 'plugin.zip')

    opts?.onProgress?.({ stage: 'download', percent: 0 })
    await downloadToFile(entry.releaseUrl, zipPath, opts?.signal)
    opts?.onProgress?.({ stage: 'download', percent: 100 })

    opts?.onProgress?.({ stage: 'verify' })
    const actual = computeSha256(zipPath)
    if (actual !== entry.sha256) {
      // Remove the suspicious zip — do not leave it on disk.
      fs.rmSync(zipPath, { force: true })
      throw new Error(
        `sha256 mismatch for "${id}".\n` +
        `  expected: ${entry.sha256}\n` +
        `  actual:   ${actual}\n` +
        '  The downloaded file may have been tampered with. Do not install. Report to the plugin author.'
      )
    }

    opts?.onProgress?.({ stage: 'extract' })
    const extractDir = path.join(tmpDir, 'extracted')
    fs.mkdirSync(extractDir)
    await extractZip(zipPath, extractDir)

    const manifest = validateManifest(extractDir)
    const pluginsDir = defaultPluginsDir(opts)
    fs.mkdirSync(pluginsDir, { recursive: true })

    const destDir = pluginsDirFor(manifest.id as string, pluginsDir)
    copyPlugin(extractDir, destDir)

    return makeEntry(manifest)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
}
