/**
 * Marketplace card and detail dialog with listing fields: icon, close-up
 * cover, screenshots, demo GIF and Chinese descriptions.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../src/i18n/en'
import zhHant from '../../src/i18n/zh-Hant'
import zhHans from '../../src/i18n/zh-Hans'
import PluginCard from '../../src/components/settings/plugins/PluginCard.vue'
import PluginDetailDialog from '../../src/components/settings/plugins/PluginDetailDialog.vue'
import { resetListingImagesForTest } from '../../src/services/marketplace-listing'

const RAW = 'https://raw.githubusercontent.com/openpen-platform/openpen-arrow/v1.2.0'

function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: '@openpen/arrow', scope: 'openpen', name: 'arrow', ownerId: 1,
    ownerLogin: 'openpen-platform', ownerType: 'Organization',
    description: 'Draws straight arrows.', minAppVersion: '1.0.0',
    repo: 'https://github.com/openpen-platform/openpen-arrow', latestVersion: '1.2.0',
    releaseUrl: 'https://github.com/openpen-platform/openpen-arrow/releases/download/v1.2.0/a.zip',
    sha256: 'a'.repeat(64), state: 'active', registeredAt: '2026-01-01T00:00:00Z',
    icon: `${RAW}/icon.png`,
    screenshots: [
      { src: `${RAW}/cover.png`, alt: 'Arrow cover.' },
      { src: `${RAW}/demo.gif`, alt: 'Arrow demo.' },
      { src: `${RAW}/second.png`, alt: 'Arrow panel.' },
    ],
    descriptionLocalized: { 'zh-Hant': '畫直線箭頭。' },
    ...overrides,
  }
}

const MIME: Record<string, string> = { icon: 'image/png', 0: 'image/png', 1: 'image/gif', 2: 'image/png' }
let api: { getPluginListingImage: ReturnType<typeof vi.fn> }

function i18nFor(locale: string) {
  return createI18n({ locale, messages: { en, 'zh-Hant': zhHant, 'zh-Hans': zhHans }, legacy: false })
}

function mountCard(e: CatalogEntry, locale = 'en') {
  return mount(PluginCard, { props: { entry: e }, global: { plugins: [i18nFor(locale)] } })
}

function mountDialog(e: CatalogEntry, locale = 'en') {
  return mount(PluginDetailDialog, {
    props: { open: true, entry: e, installedVersion: null },
    global: { plugins: [i18nFor(locale)], stubs: { teleport: true } },
    attachTo: document.body,
  })
}

beforeEach(() => {
  resetListingImagesForTest()
  let n = 0
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn((b: Blob) => `blob:test/${b.type}/${n++}`) }))
  api = {
    getPluginListingImage: vi.fn(async (_id: string, slot: string | number) =>
      ({ ok: true, mime: MIME[String(slot)], data: new Uint8Array([1, 2, 3]) })),
  }
  ;(window as { openPenApi?: unknown }).openPenApi = api
  document.documentElement.removeAttribute('data-reduced-motion')
})

afterEach(() => {
  delete (window as { openPenApi?: unknown }).openPenApi
  document.documentElement.removeAttribute('data-reduced-motion')
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('marketplace card', () => {
  it('shows the plugin icon and its cover (first screenshot) from bytes main returned', async () => {
    const w = mountCard(entry())
    await flushPromises()
    expect(w.get('[data-testid="plugin-listing-icon"]').attributes('src')).toMatch(/^blob:test\/image\/png/)
    const cover = w.get('[data-testid="plugin-listing-shot"]')
    expect(cover.attributes('src')).toMatch(/^blob:/)
    expect(cover.attributes('alt')).toBe('Arrow cover.')
    expect(api.getPluginListingImage).toHaveBeenCalledWith('@openpen/arrow', 'icon')
    expect(api.getPluginListingImage).toHaveBeenCalledWith('@openpen/arrow', 0)
  })

  it('shows the Chinese description when the UI is Traditional Chinese', async () => {
    const card = mountCard(entry(), 'zh-Hant')
    expect(card.get('[data-testid="plugin-card-desc"]').text()).toBe('畫直線箭頭。')
    const dialog = mountDialog(entry(), 'zh-Hant')
    expect(dialog.get('[data-testid="plugin-detail-desc"]').text()).toBe('畫直線箭頭。')
  })

  it('falls back to English when the entry has no translation for the UI language', async () => {
    const card = mountCard(entry(), 'zh-Hans')
    expect(card.get('[data-testid="plugin-card-desc"]').text()).toBe('Draws straight arrows.')
  })

  it('shows placeholders when the images cannot be loaded, and everything else as usual', async () => {
    api.getPluginListingImage.mockResolvedValue({ ok: false, error: 'HTTP 404 fetching image' })
    const w = mountCard(entry())
    await flushPromises()
    expect(w.find('[data-testid="plugin-listing-icon"]').exists()).toBe(false)
    expect(w.get('[data-testid="plugin-listing-icon-placeholder"]').attributes('data-status')).toBe('failed')
    expect(w.get('[data-testid="plugin-listing-shot-placeholder"]').attributes('data-status')).toBe('failed')
    expect(w.text()).toContain('arrow')
    expect(w.text()).toContain('Draws straight arrows.')
    expect(w.find('[data-testid="plugin-install-btn"]').exists()).toBe(true)
  })

  it('falls back to the placeholder when the browser cannot decode an image main passed', async () => {
    const w = mountCard(entry())
    await flushPromises()
    await w.get('[data-testid="plugin-listing-shot"]').trigger('error')
    expect(w.get('[data-testid="plugin-listing-shot-placeholder"]').attributes('data-status')).toBe('failed')
  })

  it('shows markup in a description as text, never as elements', async () => {
    const hostile = '<img src=x onerror="window.__pwned=1"><b>bold</b>'
    const w = mountCard(entry({ description: hostile, descriptionLocalized: { 'zh-Hant': hostile } }), 'zh-Hant')
    await flushPromises()
    const desc = w.get('[data-testid="plugin-card-desc"]')
    expect(desc.text()).toBe(hostile)
    expect(desc.element.children).toHaveLength(0)
    expect((window as { __pwned?: number }).__pwned).toBeUndefined()
  })
})

describe('marketplace detail dialog', () => {
  it('plays the demo GIF on top and lists every other screenshot below', async () => {
    const w = mountDialog(entry())
    await flushPromises()
    const hero = w.get('[data-testid="plugin-detail-hero"]')
    expect(hero.element.tagName).toBe('IMG')
    expect(hero.attributes('src')).toMatch(/^blob:test\/image\/gif/)
    expect(hero.attributes('alt')).toBe('Arrow demo.')
    const thumbs = w.findAll('[data-testid="plugin-detail-thumb"]')
    expect(thumbs.map((t) => t.attributes('aria-label'))).toEqual(['Screenshot 1', 'Screenshot 3'])
    // A thumbnail moves into the top slot when clicked.
    await thumbs[1].trigger('click')
    await flushPromises()
    expect(w.get('[data-testid="plugin-detail-hero"]').attributes('alt')).toBe('Arrow panel.')
  })

  it('with reduce motion on, shows the still cover on top and the GIF as a still thumbnail', async () => {
    document.documentElement.setAttribute('data-reduced-motion', 'true')
    const w = mountDialog(entry())
    await flushPromises()
    expect(w.get('[data-testid="plugin-detail-hero"]').attributes('alt')).toBe('Arrow cover.')
    const gifThumb = w.findAll('[data-testid="plugin-detail-thumb"]')[0]
    expect(gifThumb.attributes('aria-label')).toBe('Screenshot 2')
    const still = gifThumb.get('[data-testid="plugin-listing-shot"]')
    expect(still.element.tagName).toBe('CANVAS')
    expect(still.attributes('data-still')).toBe('true')
  })
})
