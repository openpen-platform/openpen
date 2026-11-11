/**
 * Marketplace Report entry and policy link.
 *
 * The renderer wiring is mounted against a fake `window.openPenApi` whose
 * send-style calls are forwarded to the real main-process listeners from
 * `registerMarketplaceLinkHandlers`, so each test covers click → IPC payload
 * → URL handed to openExternal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../src/i18n/en'
import zhHant from '../../src/i18n/zh-Hant'
import zhHans from '../../src/i18n/zh-Hans'
import ja from '../../src/i18n/ja'
import PluginDetailDialog from '../../src/components/settings/plugins/PluginDetailDialog.vue'
import PluginsBrowsePanel from '../../src/components/settings/plugins/PluginsBrowsePanel.vue'
import { PLUGIN } from '../../electron/ipc-channels.js'
import {
  registerMarketplaceLinkHandlers,
  buildReportUrl,
  CATALOG_ISSUES_URL,
  SECURITY_POLICY_URL,
} from '../../electron/marketplace-links.js'
import { initI18n, setLocale } from '../../electron/i18n/index.js'
import mainEn from '../../electron/i18n/en.js'
import mainZhHant from '../../electron/i18n/zh-Hant.js'
import mainZhHans from '../../electron/i18n/zh-Hans.js'
import mainJa from '../../electron/i18n/ja.js'

function makeEntry(): CatalogEntry {
  return {
    id: '@alice/todo', scope: 'alice', name: 'Todo Overlay', ownerId: 1,
    ownerLogin: 'alice', ownerType: 'User', description: 'A todo plugin.',
    minAppVersion: '1.0.0', repo: 'https://github.com/alice/todo',
    latestVersion: '1.2.0', releaseUrl: 'https://example.com/alice-todo-1.2.0.zip',
    sha256: 'abc', state: 'active', registeredAt: '2026-01-01T00:00:00Z',
  }
}

let listeners: Map<string, (event: unknown, payload: unknown) => void>
let openExternal: ReturnType<typeof vi.fn>

function makeI18n(locale: string) {
  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messages: { en, 'zh-Hant': zhHant, 'zh-Hans': zhHans, ja },
  })
}

beforeEach(async () => {
  await initI18n('en')
  listeners = new Map()
  openExternal = vi.fn()
  registerMarketplaceLinkHandlers({
    ipcMain: {
      on: (channel: string, fn: (event: unknown, payload: unknown) => void) => { listeners.set(channel, fn) },
      removeAllListeners: (channel: string) => { listeners.delete(channel) },
    } as never,
    openExternal,
    channels: PLUGIN,
  })
  const send = (channel: string) => (payload: unknown) => listeners.get(channel)?.({}, payload)
  window.openPenApi = {
    openPluginReport: (id: string, version: string) => send(PLUGIN.OPEN_REPORT)({ id, version }),
    openMarketplacePolicy: (locale: string) => send(PLUGIN.OPEN_POLICY)({ locale }),
    fetchPluginCatalog: vi.fn().mockResolvedValue({ ok: true, plugins: [makeEntry()] }),
    getModuleManifests: vi.fn().mockResolvedValue([]),
    onPluginInstallProgress: vi.fn().mockReturnValue(() => {}),
  } as unknown as typeof window.openPenApi
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('Report entry in the plugin detail dialog', () => {
  it('opens a catalog issue pre-filled with the plugin id and version', async () => {
    mount(PluginDetailDialog, {
      props: { open: true, entry: makeEntry(), installedVersion: null },
      global: { plugins: [makeI18n('en')] },
      attachTo: document.body,
    })
    const btn = document.querySelector<HTMLButtonElement>('[data-testid="plugin-detail-report-btn"]')
    expect(btn?.textContent).toContain('Report')
    btn!.click()

    expect(openExternal).toHaveBeenCalledTimes(1)
    const url = new URL(openExternal.mock.calls[0][0])
    expect(`${url.origin}${url.pathname}`).toBe(`${CATALOG_ISSUES_URL}/new`)
    expect(url.searchParams.get('title')).toBe('Report: @alice/todo')
    const body = url.searchParams.get('body')!
    expect(body.split('\n')[0]).toBe(`> ${mainEn['marketplace.report.securityNotice']} ${SECURITY_POLICY_URL}`)
    expect(body).toContain('Plugin: @alice/todo')
    expect(body).toContain('Version: 1.2.0')
  })

  it('ignores a report request whose plugin id is not @scope/name', () => {
    window.openPenApi!.openPluginReport('javascript:alert(1)', '1.0.0')
    window.openPenApi!.openPluginReport('@alice/todo/../../x', '1.0.0')
    expect(openExternal).not.toHaveBeenCalled()
  })
})

describe('Marketplace policy link in the browse panel', () => {
  it('opens the policy page in the current UI locale', async () => {
    const wrapper = mount(PluginsBrowsePanel, {
      global: { plugins: [makeI18n('zh-Hant')], directives: { autoAnimate: {} } },
    })
    await flushPromises()
    const link = wrapper.get('[data-testid="plugin-browse-policy-link"]')
    expect(link.text()).toBe(zhHant.pluginMarketplacePolicy)
    await link.trigger('click')

    expect(openExternal).toHaveBeenCalledWith('https://openpen.pages.dev/docs/zh-Hant/marketplace/policy')
  })

  it('falls back to the English policy page for an unsupported locale', () => {
    window.openPenApi!.openMarketplacePolicy('fr')
    window.openPenApi!.openMarketplacePolicy('__proto__')
    expect(openExternal.mock.calls).toEqual([
      ['https://openpen.pages.dev/docs/marketplace/policy'],
      ['https://openpen.pages.dev/docs/marketplace/policy'],
    ])
  })
})

describe('Report and policy strings', () => {
  it('are translated in en, zh-Hant, zh-Hans and ja, including the report form', () => {
    const keys = ['pluginReport', 'pluginReportHint', 'pluginMarketplacePolicy'] as const
    for (const bundle of [en, zhHant, zhHans, ja]) {
      for (const key of keys) expect(bundle[key], key).toBeTruthy()
    }
    for (const bundle of [zhHant, zhHans, ja]) {
      expect(bundle.pluginReport).not.toBe(en.pluginReport)
      expect(bundle.pluginReportHint).not.toBe(en.pluginReportHint)
      // The link sits under the marketplace sub-tab, so it must use the same translated noun.
      expect(bundle.pluginMarketplacePolicy).not.toMatch(/marketplace/i)
      expect(bundle.pluginMarketplacePolicy).toContain(bundle.pluginsSubtabMarketplace)
    }
    // The report form opens pre-filled in the active UI language, security notice first.
    const mainBundles = { en: mainEn, 'zh-Hant': mainZhHant, 'zh-Hans': mainZhHans, ja: mainJa }
    for (const [locale, bundle] of Object.entries(mainBundles)) {
      setLocale(locale)
      const body = new URL(buildReportUrl('@alice/todo', '1.2.0')!).searchParams.get('body')!
      expect(body.split('\n')[0], locale).toBe(`> ${bundle['marketplace.report.securityNotice']} ${SECURITY_POLICY_URL}`)
      expect(body, locale).toContain(bundle['marketplace.report.prompt'])
      if (locale !== 'en') {
        expect(bundle['marketplace.report.securityNotice'], locale).not.toBe(mainEn['marketplace.report.securityNotice'])
        expect(bundle['marketplace.report.prompt'], locale).not.toBe(mainEn['marketplace.report.prompt'])
      }
    }
    // zh-Hans uses the neutral word for "feedback", not the one for "denounce" (U+4E3E U+62A5).
    expect(zhHans.pluginReport).not.toMatch(/\u4e3e\u62a5/)
  })
})
