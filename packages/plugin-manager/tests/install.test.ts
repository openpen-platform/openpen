import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { installFromLocal } from '../src/install.ts'

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
})
