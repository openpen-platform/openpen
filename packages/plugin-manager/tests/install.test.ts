import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import archiver from 'archiver'
import { installFromLocal, inspectLocalSource } from '../src/install.ts'

// ── helpers ───────────────────────────────────────────────────────────────────

function makePluginDir(
  base: string,
  overrides: Record<string, unknown> = {},
): string {
  const pluginDir = path.join(base, 'my-plugin-src')
  fs.mkdirSync(path.join(pluginDir, 'dist'), { recursive: true })

  const manifest = {
    id: '@alice/notes',
    name: 'Notes',
    version: '1.0.0',
    renderer: 'dist/renderer.js',
    ...overrides,
  }
  fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest))
  fs.writeFileSync(path.join(pluginDir, 'dist', 'renderer.js'), '// built')

  return pluginDir
}

// ── installFromLocal ──────────────────────────────────────────────────────────

describe('installFromLocal', () => {
  let tmpBase: string
  let installRoot: string

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-test-'))
    installRoot = path.join(tmpBase, 'plugins')
  })

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true, force: true })
  })

  it('copies plugin.json and dist/ to install dir', async () => {
    const srcDir = makePluginDir(tmpBase)
    const entry = await installFromLocal(srcDir, { pluginsDir: installRoot })

    expect(entry.id).toBe('@alice/notes')
    expect(entry.scope).toBe('alice')
    expect(entry.name).toBe('notes')
    expect(entry.version).toBe('1.0.0')

    const destDir = path.join(installRoot, '@alice', 'notes')
    expect(fs.existsSync(path.join(destDir, 'plugin.json'))).toBe(true)
    expect(fs.existsSync(path.join(destDir, 'dist', 'renderer.js'))).toBe(true)
  })

  it('copies locales/ when present', async () => {
    const srcDir = makePluginDir(tmpBase)
    const localesDir = path.join(srcDir, 'locales')
    fs.mkdirSync(localesDir)
    fs.writeFileSync(path.join(localesDir, 'en.json'), '{"greeting":"Hello"}')

    await installFromLocal(srcDir, { pluginsDir: installRoot })

    const destLocales = path.join(installRoot, '@alice', 'notes', 'locales', 'en.json')
    expect(fs.existsSync(destLocales)).toBe(true)
  })

  it('throws when dist/renderer.js is missing', async () => {
    const srcDir = makePluginDir(tmpBase)
    fs.rmSync(path.join(srcDir, 'dist', 'renderer.js'))

    await expect(installFromLocal(srcDir, { pluginsDir: installRoot }))
      .rejects.toThrow(/dist\/renderer\.js not found/)
  })

  it('throws when plugin.json has an invalid id', async () => {
    const srcDir = makePluginDir(tmpBase, { id: 'bare-name' })

    await expect(installFromLocal(srcDir, { pluginsDir: installRoot }))
      .rejects.toThrow(/@scope\/name/)
  })

  it('throws when source path does not exist', async () => {
    await expect(installFromLocal('/nonexistent/path', { pluginsDir: installRoot }))
      .rejects.toThrow(/does not exist/)
  })

  it('overwrites existing install (backup-restore pattern)', async () => {
    const srcDir = makePluginDir(tmpBase)

    // First install
    await installFromLocal(srcDir, { pluginsDir: installRoot })
    const destDir = path.join(installRoot, '@alice', 'notes')
    fs.writeFileSync(path.join(destDir, 'stale-sentinel.txt'), 'old')

    // Second install should replace the directory
    await installFromLocal(srcDir, { pluginsDir: installRoot })
    expect(fs.existsSync(path.join(destDir, 'stale-sentinel.txt'))).toBe(false)
    expect(fs.existsSync(path.join(destDir, 'plugin.json'))).toBe(true)
  })

  it('invokes onProgress callback with extract stage', async () => {
    const srcDir = makePluginDir(tmpBase)
    const stages: string[] = []

    await installFromLocal(srcDir, {
      pluginsDir: installRoot,
      onProgress: (e) => stages.push(e.stage),
    })

    expect(stages).toContain('extract')
  })

  it('installs from a .zip source (flat layout)', async () => {
    const srcDir = makePluginDir(tmpBase)
    const zipPath = path.join(tmpBase, 'flat-plugin.zip')
    await zipDirectory(srcDir, zipPath, { wrapInTopFolder: false })

    const entry = await installFromLocal(zipPath, { pluginsDir: installRoot })

    expect(entry.id).toBe('@alice/notes')
    expect(entry.version).toBe('1.0.0')
    const destDir = path.join(installRoot, '@alice', 'notes')
    expect(fs.existsSync(path.join(destDir, 'plugin.json'))).toBe(true)
    expect(fs.existsSync(path.join(destDir, 'dist', 'renderer.js'))).toBe(true)
  })

  it('installs from a .zip source wrapped in a single top-level folder', async () => {
    const srcDir = makePluginDir(tmpBase)
    const zipPath = path.join(tmpBase, 'wrapped-plugin.zip')
    await zipDirectory(srcDir, zipPath, { wrapInTopFolder: true })

    const entry = await installFromLocal(zipPath, { pluginsDir: installRoot })

    expect(entry.id).toBe('@alice/notes')
    const destDir = path.join(installRoot, '@alice', 'notes')
    expect(fs.existsSync(path.join(destDir, 'dist', 'renderer.js'))).toBe(true)
  })

  it('installs from a .zip that contains a sibling __MACOSX/ resource fork', async () => {
    const srcDir = makePluginDir(tmpBase)
    const zipPath = path.join(tmpBase, 'macosx-plugin.zip')
    await zipDirectoryWithMacOsxSidecar(srcDir, zipPath)

    const entry = await installFromLocal(zipPath, { pluginsDir: installRoot })

    expect(entry.id).toBe('@alice/notes')
    const destDir = path.join(installRoot, '@alice', 'notes')
    expect(fs.existsSync(path.join(destDir, 'dist', 'renderer.js'))).toBe(true)
  })

  it('throws on .zip with missing plugin.json', async () => {
    const emptyDir = path.join(tmpBase, 'empty')
    fs.mkdirSync(path.join(emptyDir, 'dist'), { recursive: true })
    fs.writeFileSync(path.join(emptyDir, 'dist', 'renderer.js'), '// built')
    const zipPath = path.join(tmpBase, 'no-manifest.zip')
    await zipDirectory(emptyDir, zipPath, { wrapInTopFolder: false })

    await expect(installFromLocal(zipPath, { pluginsDir: installRoot }))
      .rejects.toThrow(/plugin\.json is missing/)
  })

  it('throws on non-zip file source', async () => {
    const stray = path.join(tmpBase, 'stray.txt')
    fs.writeFileSync(stray, 'not a zip')

    await expect(installFromLocal(stray, { pluginsDir: installRoot }))
      .rejects.toThrow(/directory or a \.zip file/)
  })
})

// ── inspectLocalSource ────────────────────────────────────────────────────────

describe('inspectLocalSource', () => {
  let tmpBase: string

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true, force: true })
  })

  it('reads manifest from a directory', async () => {
    const srcDir = makePluginDir(tmpBase)
    const info = await inspectLocalSource(srcDir)
    expect(info.id).toBe('@alice/notes')
    expect(info.version).toBe('1.0.0')
    expect(info.displayName).toBe('Notes')
  })

  it('reads manifest from a .zip source', async () => {
    const srcDir = makePluginDir(tmpBase)
    const zipPath = path.join(tmpBase, 'inspect.zip')
    await zipDirectory(srcDir, zipPath, { wrapInTopFolder: false })

    const info = await inspectLocalSource(zipPath)
    expect(info.id).toBe('@alice/notes')
    expect(info.version).toBe('1.0.0')
  })
})

// ── zip helper ────────────────────────────────────────────────────────────────

async function zipDirectory(
  srcDir: string,
  outPath: string,
  opts: { wrapInTopFolder: boolean },
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outPath)
    const archive = archiver('zip', { zlib: { level: 0 } })
    output.on('close', () => resolve())
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(srcDir, opts.wrapInTopFolder ? path.basename(srcDir) : false)
    void archive.finalize()
  })
}

async function zipDirectoryWithMacOsxSidecar(srcDir: string, outPath: string): Promise<void> {
  const topName = path.basename(srcDir)
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(outPath)
    const archive = archiver('zip', { zlib: { level: 0 } })
    output.on('close', () => resolve())
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(srcDir, topName)
    archive.append('mac resource fork stub', { name: `__MACOSX/${topName}/._plugin.json` })
    void archive.finalize()
  })
}
