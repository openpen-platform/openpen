import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { removePlugin } from '../src/remove.ts'
import { listInstalled } from '../src/list.ts'

function makeInstalledPlugin(
  pluginsDir: string,
  id: string,
  version = '1.0.0',
) {
  const [, scope, name] = /^@([^/]+)\/(.+)$/.exec(id)!
  const destDir = path.join(pluginsDir, `@${scope}`, name)
  fs.mkdirSync(path.join(destDir, 'dist'), { recursive: true })
  fs.writeFileSync(
    path.join(destDir, 'plugin.json'),
    JSON.stringify({ id, name: 'My Plugin', version }),
  )
  fs.writeFileSync(path.join(destDir, 'dist', 'renderer.js'), '// built')
  return destDir
}

describe('removePlugin', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-rm-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('removes an installed plugin directory', async () => {
    const pluginsDir = path.join(tmpDir, 'plugins')
    const destDir = makeInstalledPlugin(pluginsDir, '@alice/notes')

    await removePlugin('@alice/notes', { pluginsDir })
    expect(fs.existsSync(destDir)).toBe(false)
  })

  it('throws when plugin is not installed', async () => {
    const pluginsDir = path.join(tmpDir, 'plugins')
    await expect(removePlugin('@alice/ghost', { pluginsDir }))
      .rejects.toThrow(/not installed/)
  })
})

describe('listInstalled', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-list-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns an empty array when no plugins are installed', async () => {
    const pluginsDir = path.join(tmpDir, 'plugins')
    expect(await listInstalled({ pluginsDir })).toEqual([])
  })

  it('returns empty array when plugins dir does not exist', async () => {
    expect(await listInstalled({ pluginsDir: '/nonexistent/plugins' })).toEqual([])
  })

  it('returns one entry for a single installed plugin', async () => {
    const pluginsDir = path.join(tmpDir, 'plugins')
    makeInstalledPlugin(pluginsDir, '@alice/notes', '2.0.0')

    const result = await listInstalled({ pluginsDir })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('@alice/notes')
    expect(result[0].scope).toBe('alice')
    expect(result[0].name).toBe('notes')
    expect(result[0].version).toBe('2.0.0')
  })

  it('returns entries for two installed plugins across different scopes', async () => {
    const pluginsDir = path.join(tmpDir, 'plugins')
    makeInstalledPlugin(pluginsDir, '@alice/notes')
    makeInstalledPlugin(pluginsDir, '@bob/color-picker')

    const result = await listInstalled({ pluginsDir })
    expect(result).toHaveLength(2)
    const ids = result.map((e) => e.id).sort()
    expect(ids).toEqual(['@alice/notes', '@bob/color-picker'])
  })

  it('skips directories without plugin.json', async () => {
    const pluginsDir = path.join(tmpDir, 'plugins')
    fs.mkdirSync(path.join(pluginsDir, '@alice', 'ghost'), { recursive: true })

    const result = await listInstalled({ pluginsDir })
    expect(result).toHaveLength(0)
  })
})
