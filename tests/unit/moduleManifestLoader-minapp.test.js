import { describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'

const handlers = new Map()
const virtualHome = '/virtual-openpen-test-home'

vi.mock('electron', () => ({
  app: { getVersion: () => '1.6.0', getPath: () => virtualHome },
  ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
}))
vi.mock('../../electron/plugin-meta-manager.js', () => ({
  ensurePluginInstalledAt: vi.fn(),
  getPluginInstalledAt: () => null,
}))
vi.mock('../../electron/settings-store.js', () => ({
  getSettings: () => ({ disabledModules: [] }),
}))
vi.mock('node:fs', () => ({
  default: {
    existsSync: () => true,
    readdirSync(directory) {
      const dir = name => ({ name, isDirectory: () => true })
      if (directory === root) return [dir('@vendor')]
      if (directory === join(root, '@vendor')) return [dir('future'), dir('compatible')]
      throw new Error(`Unexpected fixture folder: ${directory}`)
    },
    readFileSync(filename) {
      const manifest = manifests.get(filename)
      if (!manifest) throw new Error(`Unexpected fixture file: ${filename}`)
      return JSON.stringify(manifest)
    },
  },
}))

const root = join(process.env.HOME ?? virtualHome, '.openpen', 'plugins')
const manifests = new Map([
  ['future', '1.7.0'],
  ['compatible', '1.6.0'],
].map(([name, minAppVersion]) => [join(root, '@vendor', name, 'plugin.json'), {
  id: `@vendor/${name}`, name, version: '1.0.0', renderer: 'renderer.js', minAppVersion,
}]))

describe('plugin manifest loading', () => {
  it('AC-11 skips a plugin requiring a newer host and still publishes the compatible plugin', async () => {
    const { initModuleManifestLoader } = await import('../../electron/module-manifest-loader.js')
    await initModuleManifestLoader()

    const published = await handlers.get('module:get-manifests')()
    expect(published.map(({ id }) => id)).toEqual(['@vendor/compatible'])
  })
})
