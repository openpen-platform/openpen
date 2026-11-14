/**
 * Community plugins in the marketplace: hidden unless the setting is on,
 * labelled as not officially reviewed, and confirmed before install.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../src/i18n/en'
import PluginCard from '../../src/components/settings/plugins/PluginCard.vue'
import PluginDetailDialog from '../../src/components/settings/plugins/PluginDetailDialog.vue'
import PluginsBrowsePanel from '../../src/components/settings/plugins/PluginsBrowsePanel.vue'
import { usePluginMarketplace, resetMarketplaceForTest } from '../../src/composables/usePluginMarketplace'

const i18n = createI18n({ locale: 'en', messages: { en }, legacy: false })

function entry(id: string, overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  const [, scope = 'alice', name = 'x'] = /^@([^/]+)\/(.+)$/.exec(id) ?? []
  return {
    id, scope, name, ownerId: 1, ownerLogin: scope, ownerType: 'User',
    description: 'desc', minAppVersion: '1.0.0', repo: 'https://github.com/a/b',
    latestVersion: '1.0.0', releaseUrl: 'https://example.com/p.zip', sha256: 'abc',
    state: 'active', registeredAt: '2026-01-01T00:00:00Z', ...overrides,
  }
}

const OFFICIAL = entry('@openpen/arrow', { name: 'arrow' })
const COMMUNITY = entry('@alice/ruler', { name: 'ruler', tier: 'community', reviewed: false })

type SettingsCb = (s: { showCommunityPlugins?: boolean }) => void
let settingsCb: SettingsCb | null
let api: Record<string, ReturnType<typeof vi.fn>>

function installApi(showCommunityPlugins = false) {
  settingsCb = null
  api = {
    getSettings: vi.fn(async () => ({ showCommunityPlugins })),
    onSettingsUpdated: vi.fn((cb: SettingsCb) => { settingsCb = cb; return () => { settingsCb = null } }),
    getModuleManifests: vi.fn(async () => []),
    fetchPluginCatalog: vi.fn(async () => ({ ok: true, plugins: [OFFICIAL] })),
    fetchCommunityPluginCatalog: vi.fn(async () => ({ ok: true, plugins: [COMMUNITY] })),
    installPlugin: vi.fn(async () => ({ ok: true, entry: { id: OFFICIAL.id, version: '1.0.0' } })),
    installCommunityPlugin: vi.fn(async () => ({ ok: true, entry: { id: COMMUNITY.id, version: '1.0.0' } })),
    onPluginInstallProgress: vi.fn(() => () => {}),
    openMarketplacePolicy: vi.fn(),
    relaunchApp: vi.fn(),
  }
  ;(window as { openPenApi?: unknown }).openPenApi = api
}

beforeEach(() => {
  resetMarketplaceForTest()
})

afterEach(() => {
  delete (window as { openPenApi?: unknown }).openPenApi
  resetMarketplaceForTest()
})

describe('marketplace listing', () => {
  it('lists only official plugins by default and never asks for the community catalog', async () => {
    installApi(false)
    const m = usePluginMarketplace()
    const unwatch = await m.watchCommunitySetting()
    await m.fetchCatalog()
    expect(m.listing.value.map((p) => p.id)).toEqual(['@openpen/arrow'])
    expect(api.fetchCommunityPluginCatalog).not.toHaveBeenCalled()
    unwatch()
  })

  it('lists community plugins after the setting is turned on, tagged as unreviewed', async () => {
    installApi(false)
    const m = usePluginMarketplace()
    const unwatch = await m.watchCommunitySetting()
    await m.fetchCatalog()
    settingsCb?.({ showCommunityPlugins: true })
    await flushPromises()
    expect(m.listing.value.map((p) => p.id)).toEqual(['@openpen/arrow', '@alice/ruler'])
    const community = m.listing.value.find((p) => p.id === '@alice/ruler')
    expect(community?.tier).toBe('community')
    expect(community?.reviewed).toBe(false)
    unwatch()
  })

  it('tags community entries locally even if the payload omits the flags', async () => {
    installApi(true)
    api.fetchCommunityPluginCatalog.mockResolvedValue({ ok: true, plugins: [entry('@bob/pen', { reviewed: true })] })
    const m = usePluginMarketplace()
    const unwatch = await m.watchCommunitySetting()
    const bob = m.listing.value.find((p) => p.id === '@bob/pen')
    expect(bob?.tier).toBe('community')
    expect(bob?.reviewed).toBe(false)
    unwatch()
  })

  it('hides community plugins again when the setting is turned off', async () => {
    installApi(true)
    const m = usePluginMarketplace()
    const unwatch = await m.watchCommunitySetting()
    await m.fetchCatalog()
    expect(m.listing.value.some((p) => p.tier === 'community')).toBe(true)
    settingsCb?.({ showCommunityPlugins: false })
    await flushPromises()
    expect(m.listing.value.map((p) => p.id)).toEqual(['@openpen/arrow'])
    unwatch()
  })

  it('keeps already-installed plugins when the setting is turned off', async () => {
    installApi(true)
    api.getModuleManifests.mockResolvedValue([{ id: '@alice/ruler', name: 'ruler', version: '1.0.0', rendererEntry: null }])
    const m = usePluginMarketplace()
    const unwatch = await m.watchCommunitySetting()
    await m.fetchCatalog()
    expect(m.installedVersions.value['@alice/ruler']).toBe('1.0.0')
    settingsCb?.({ showCommunityPlugins: false })
    await flushPromises()
    expect(m.listing.value.some((p) => p.id === '@alice/ruler')).toBe(false)
    expect(m.installedVersions.value['@alice/ruler']).toBe('1.0.0')
    unwatch()
  })

  it('shows a community load failure without hiding the official list', async () => {
    installApi(true)
    api.fetchCommunityPluginCatalog.mockResolvedValue({ ok: false, error: 'HTTP 404' })
    const m = usePluginMarketplace()
    const unwatch = await m.watchCommunitySetting()
    await m.fetchCatalog()
    expect(m.communityError.value).toBe('HTTP 404')
    expect(m.listing.value.map((p) => p.id)).toEqual(['@openpen/arrow'])
    unwatch()
  })

  it('asks for the community catalog once when a full fetch follows the setting read', async () => {
    installApi(true)
    const m = usePluginMarketplace()
    const unwatch = await m.watchCommunitySetting({ fetchNow: false })
    await m.fetchCatalog()
    expect(api.fetchCommunityPluginCatalog).toHaveBeenCalledTimes(1)
    unwatch()
  })

  it('ignores a stale community response after the setting was toggled off and on', async () => {
    installApi(false)
    const stale = entry('@old/stale', { tier: 'community' })
    const fresh = entry('@new/fresh', { tier: 'community' })
    let releaseFirst: (v: unknown) => void = () => {}
    api.fetchCommunityPluginCatalog
      .mockImplementationOnce(() => new Promise((resolve) => { releaseFirst = resolve }))
      .mockResolvedValueOnce({ ok: true, plugins: [fresh] })
    const m = usePluginMarketplace()
    const unwatch = await m.watchCommunitySetting()
    settingsCb?.({ showCommunityPlugins: true })
    settingsCb?.({ showCommunityPlugins: false })
    settingsCb?.({ showCommunityPlugins: true })
    await flushPromises()
    releaseFirst({ ok: true, plugins: [stale] })
    await flushPromises()
    expect(m.listing.value.map((p) => p.id)).toEqual(['@new/fresh'])
    unwatch()
  })

  it('routes a community install through the community channel only', async () => {
    installApi(true)
    const m = usePluginMarketplace()
    await m.installFromCatalog('@alice/ruler', { community: true })
    expect(api.installCommunityPlugin).toHaveBeenCalledWith('@alice/ruler')
    expect(api.installPlugin).not.toHaveBeenCalled()
  })
})

describe('community labelling', () => {
  it('card: a community entry shows no unreviewed label and looks like an official card', () => {
    const community = mount(PluginCard, { props: { entry: COMMUNITY }, global: { plugins: [i18n] } })
    const official = mount(PluginCard, { props: { entry: OFFICIAL }, global: { plugins: [i18n] } })
    expect(community.find('[data-testid="plugin-unreviewed-badge"]').exists()).toBe(false)
    expect(community.text()).not.toMatch(/not officially reviewed/i)
    // Same set of elements as an official card (the install button included).
    expect(community.findAll('span').length).toBe(official.findAll('span').length)
    expect(community.find('[data-testid="plugin-install-btn"]').exists()).toBe(true)
  })

  it('detail dialog: a community entry shows no unreviewed notice and keeps the install action', () => {
    const mountDetail = (e: CatalogEntry) => mount(PluginDetailDialog, {
      props: { open: true, entry: e, installedVersion: null },
      global: { plugins: [i18n], stubs: { teleport: true } },
    })
    const community = mountDetail(COMMUNITY)
    expect(community.find('[data-testid="plugin-detail-unreviewed"]').exists()).toBe(false)
    expect(community.text()).not.toMatch(/not (been )?officially reviewed/i)
    expect(community.text()).toContain(COMMUNITY.description)
    expect(community.text()).toContain(en.pluginInstall)
  })
})

describe('browse panel install flow', () => {
  async function mountPanel(showCommunityPlugins: boolean) {
    installApi(showCommunityPlugins)
    const wrapper = mount(PluginsBrowsePanel, {
      global: {
        plugins: [i18n],
        directives: { 'auto-animate': {} },
        stubs: { teleport: true, PluginInstallProgressDialog: true, PluginDetailDialog: true },
      },
    })
    await flushPromises()
    return wrapper
  }

  function cardFor(wrapper: ReturnType<typeof mount>, id: string) {
    return wrapper.findAllComponents(PluginCard).find((c) => c.props('entry').id === id)
  }

  it('shows only official cards while the setting is off', async () => {
    const wrapper = await mountPanel(false)
    expect(wrapper.findAllComponents(PluginCard).map((c) => c.props('entry').id)).toEqual(['@openpen/arrow'])
  })

  it('official install starts at once, with no confirmation', async () => {
    const wrapper = await mountPanel(true)
    await cardFor(wrapper, '@openpen/arrow')!.find('[data-testid="plugin-install-btn"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="plugin-action-confirm-dialog"]').exists()).toBe(false)
    expect(api.installPlugin).toHaveBeenCalledWith('@openpen/arrow')
  })

  it('community install waits for confirmation, then uses the community channel', async () => {
    const wrapper = await mountPanel(true)
    await cardFor(wrapper, '@alice/ruler')!.find('[data-testid="plugin-install-btn"]').trigger('click')
    await flushPromises()
    expect(api.installCommunityPlugin).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="plugin-action-confirm-dialog"]').text()).toContain('not been reviewed')

    await wrapper.find('[data-testid="plugin-action-confirm-btn"]').trigger('click')
    await flushPromises()
    expect(api.installCommunityPlugin).toHaveBeenCalledWith('@alice/ruler')
    expect(api.installPlugin).not.toHaveBeenCalled()
  })

  it('cancelling the confirmation installs nothing', async () => {
    const wrapper = await mountPanel(true)
    await cardFor(wrapper, '@alice/ruler')!.find('[data-testid="plugin-install-btn"]').trigger('click')
    await flushPromises()
    await wrapper.find('[data-testid="plugin-action-confirm-dialog"] button').trigger('click')
    await flushPromises()
    expect(api.installCommunityPlugin).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="plugin-action-confirm-dialog"]').exists()).toBe(false)
  })
})
