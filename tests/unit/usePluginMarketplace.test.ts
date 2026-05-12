import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { usePluginMarketplace, compareSemver } from '../../src/composables/usePluginMarketplace'

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCatalogEntry(id: string, latestVersion = '1.0.0', incompatible = false): CatalogEntry {
  const [, scope = 'alice', name = 'test'] = /^@([^/]+)\/(.+)$/.exec(id) ?? []
  return {
    id, scope, name, ownerId: 1, ownerLogin: scope, ownerType: 'User',
    description: 'A test plugin', minAppVersion: '1.0.0', repo: 'https://github.com/test/test',
    latestVersion, releaseUrl: 'https://example.com/plugin.zip', sha256: 'abc',
    state: 'active', registeredAt: '2026-01-01T00:00:00Z',
    ...(incompatible ? { incompatible: true } : {}),
  }
}

function makeManifest(id: string, version = '1.0.0'): ModuleManifest {
  return { id, name: id, version, rendererEntry: null }
}

function makeInspectResult(id: string, version: string, displayName = 'Test Plugin') {
  const [, scope = 'alice', name = 'test'] = /^@([^/]+)\/(.+)$/.exec(id) ?? []
  return { ok: true as const, info: { id, scope, name, version, displayName } }
}

function makeApi(overrides: Partial<typeof window.openPenApi> = {}): typeof window.openPenApi {
  return {
    fetchPluginCatalog: vi.fn().mockResolvedValue({
      ok: true, plugins: [makeCatalogEntry('@alice/todo')]
    }),
    installPlugin: vi.fn().mockResolvedValue({ ok: true, entry: { id: '@alice/todo', version: '1.0.0' } }),
    removePlugin: vi.fn().mockResolvedValue({ ok: true }),
    addPluginFromLocal: vi.fn().mockResolvedValue({ ok: true, entry: { id: '@alice/test', version: '0.1.0' } }),
    addPluginFromGitHubRepo: vi.fn().mockResolvedValue({ ok: true, entry: { id: '@alice/repo', version: '1.0.0' } }),
    onPluginInstallProgress: vi.fn().mockReturnValue(() => {}),
    pickPluginFolder: vi.fn().mockResolvedValue('/some/path'),
    getModuleManifests: vi.fn().mockResolvedValue([makeManifest('@alice/todo')]),
    inspectPluginSource: vi.fn().mockResolvedValue(makeInspectResult('@alice/test', '0.1.0')),
    ...overrides,
  } as unknown as typeof window.openPenApi
}

/** Mount a component that uses the composable and expose the result. */
function useMarketplaceWrapper() {
  let result: ReturnType<typeof usePluginMarketplace>
  const Wrapper = defineComponent({
    setup() {
      result = usePluginMarketplace()
      return () => h('div')
    },
  })
  const wrapper = mount(Wrapper, { global: {} })
  return { wrapper, get result() { return result! } }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('compareSemver', () => {
  it('returns -1 when a is less than b', () => {
    expect(compareSemver('1.0.0', '2.0.0')).toBe(-1)
    expect(compareSemver('1.2.3', '1.2.4')).toBe(-1)
    expect(compareSemver('0.9.0', '1.0.0')).toBe(-1)
  })

  it('returns 0 when a equals b', () => {
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
    expect(compareSemver('2.3.4', '2.3.4')).toBe(0)
  })

  it('returns 1 when a is greater than b', () => {
    expect(compareSemver('2.0.0', '1.0.0')).toBe(1)
    expect(compareSemver('1.2.4', '1.2.3')).toBe(1)
  })

  it('pre-release is less than the release version', () => {
    expect(compareSemver('1.0.0-alpha', '1.0.0')).toBe(-1)
    expect(compareSemver('1.0.0', '1.0.0-alpha')).toBe(1)
    expect(compareSemver('1.0.0-alpha', '1.0.0-beta')).toBe(-1)
  })
})

describe('usePluginMarketplace', () => {
  beforeEach(async () => {
    window.openPenApi = makeApi()
    const { resetMarketplaceForTest } = await import('../../src/composables/usePluginMarketplace')
    resetMarketplaceForTest()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetchCatalog success: populates catalog and clears error', async () => {
    const { result, wrapper } = useMarketplaceWrapper()
    await result.fetchCatalog()
    expect(result.catalog.value).toHaveLength(1)
    expect(result.catalog.value[0].id).toBe('@alice/todo')
    expect(result.error.value).toBeNull()
    wrapper.unmount()
  })

  it('fetchCatalog failure: sets error message', async () => {
    window.openPenApi = makeApi({
      fetchPluginCatalog: vi.fn().mockResolvedValue({ ok: false, error: 'Network error' }),
    })
    const { result, wrapper } = useMarketplaceWrapper()
    await result.fetchCatalog()
    expect(result.error.value).toBe('Network error')
    expect(result.catalog.value).toHaveLength(0)
    wrapper.unmount()
  })

  it('installFromCatalog success: transitions stages and sets completed', async () => {
    const { result, wrapper } = useMarketplaceWrapper()
    const installPromise = result.installFromCatalog('@alice/todo')
    // Stage should start as downloading
    expect(result.installStage.value).toBe('downloading')
    await installPromise
    expect(result.installStage.value).toBe('completed')
    expect(result.installError.value).toBeNull()
    wrapper.unmount()
  })

  it('installFromCatalog failure: sets failed stage with error message', async () => {
    window.openPenApi = makeApi({
      installPlugin: vi.fn().mockResolvedValue({ ok: false, error: 'sha256 mismatch' }),
      getModuleManifests: vi.fn().mockResolvedValue([]),
    })
    const { result, wrapper } = useMarketplaceWrapper()
    await result.installFromCatalog('@alice/todo')
    expect(result.installStage.value).toBe('failed')
    expect(result.installError.value).toBe('sha256 mismatch')
    wrapper.unmount()
  })

  it('onPluginInstallProgress events: update stage and percent', async () => {
    let progressCb: ((p: { stage: string; percent?: number }) => void) | null = null
    window.openPenApi = makeApi({
      onPluginInstallProgress: vi.fn().mockImplementation((cb) => {
        progressCb = cb
        return () => {}
      }),
      installPlugin: vi.fn().mockImplementation(() => new Promise(() => {})), // never resolves
      getModuleManifests: vi.fn().mockResolvedValue([]),
    })
    const { result, wrapper } = useMarketplaceWrapper()
    result.installFromCatalog('@alice/todo') // don't await — we control progress
    progressCb?.({ stage: 'download', percent: 45 })
    expect(result.installStage.value).toBe('downloading')
    expect(result.installPercent.value).toBe(45)
    progressCb?.({ stage: 'verify' })
    expect(result.installStage.value).toBe('verifying')
    wrapper.unmount()
  })

  it('removePlugin: calls API and returns ok result', async () => {
    const { result, wrapper } = useMarketplaceWrapper()
    const res = await result.removePlugin('@alice/todo')
    expect(res.ok).toBe(true)
    expect(window.openPenApi?.removePlugin).toHaveBeenCalledWith('@alice/todo')
    wrapper.unmount()
  })

  it('addFromLocal: calls API with sourcePath and returns ok result', async () => {
    const { result, wrapper } = useMarketplaceWrapper()
    const res = await result.addFromLocal('/Users/alice/my-plugin')
    expect(res.ok).toBe(true)
    expect(window.openPenApi?.addPluginFromLocal).toHaveBeenCalledWith('/Users/alice/my-plugin')
    wrapper.unmount()
  })

  // ── inspectLocal ─────────────────────────────────────────────────────────

  it('inspectLocal: returns fresh when id is not installed', async () => {
    window.openPenApi = makeApi({
      // getModuleManifests returns no manifests → installedVersions is empty
      getModuleManifests: vi.fn().mockResolvedValue([]),
      inspectPluginSource: vi.fn().mockResolvedValue(makeInspectResult('@alice/new-plugin', '1.0.0', 'New Plugin')),
    })
    const { result, wrapper } = useMarketplaceWrapper()
    const res = await result.inspectLocal('/some/path')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.result.kind).toBe('fresh')
      expect(res.result.next.id).toBe('@alice/new-plugin')
      expect(res.result.next.version).toBe('1.0.0')
      expect(res.result.current).toBeUndefined()
    }
    wrapper.unmount()
  })

  it('inspectLocal: returns upgrade when new version is greater', async () => {
    window.openPenApi = makeApi({
      getModuleManifests: vi.fn().mockResolvedValue([makeManifest('@alice/todo', '1.0.0')]),
      inspectPluginSource: vi.fn().mockResolvedValue(makeInspectResult('@alice/todo', '2.0.0', 'Todo Plugin')),
    })
    const { result, wrapper } = useMarketplaceWrapper()
    // Trigger fetch to populate installedVersions
    await result.fetchCatalog()
    const res = await result.inspectLocal('/some/path')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.result.kind).toBe('upgrade')
      expect(res.result.current).toBe('1.0.0')
    }
    wrapper.unmount()
  })

  it('inspectLocal: returns reinstall when versions are equal', async () => {
    window.openPenApi = makeApi({
      getModuleManifests: vi.fn().mockResolvedValue([makeManifest('@alice/todo', '1.0.0')]),
      inspectPluginSource: vi.fn().mockResolvedValue(makeInspectResult('@alice/todo', '1.0.0', 'Todo Plugin')),
    })
    const { result, wrapper } = useMarketplaceWrapper()
    await result.fetchCatalog()
    const res = await result.inspectLocal('/some/path')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.result.kind).toBe('reinstall')
      expect(res.result.current).toBe('1.0.0')
    }
    wrapper.unmount()
  })

  it('inspectLocal: returns downgrade when new version is lesser', async () => {
    window.openPenApi = makeApi({
      getModuleManifests: vi.fn().mockResolvedValue([makeManifest('@alice/todo', '2.0.0')]),
      inspectPluginSource: vi.fn().mockResolvedValue(makeInspectResult('@alice/todo', '1.0.0', 'Todo Plugin')),
    })
    const { result, wrapper } = useMarketplaceWrapper()
    await result.fetchCatalog()
    const res = await result.inspectLocal('/some/path')
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.result.kind).toBe('downgrade')
      expect(res.result.current).toBe('2.0.0')
      expect(res.result.next.version).toBe('1.0.0')
    }
    wrapper.unmount()
  })

  it('inspectLocal: returns ok: false on API error', async () => {
    window.openPenApi = makeApi({
      getModuleManifests: vi.fn().mockResolvedValue([]),
      inspectPluginSource: vi.fn().mockResolvedValue({ ok: false, error: 'plugin.json missing' }),
    })
    const { result, wrapper } = useMarketplaceWrapper()
    const res = await result.inspectLocal('/bad/path')
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe('plugin.json missing')
    }
    wrapper.unmount()
  })
})
