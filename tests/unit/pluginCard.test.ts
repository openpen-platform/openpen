import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PluginCard from '../../src/components/settings/plugins/PluginCard.vue'
import { createI18n } from 'vue-i18n'
import en from '../../src/i18n/en'

const i18n = createI18n({ locale: 'en', messages: { en }, legacy: false })

function makeEntry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    id: '@alice/todo', scope: 'alice', name: 'Todo Overlay', ownerId: 1,
    ownerLogin: 'alice', ownerType: 'User', description: 'A todo plugin.',
    minAppVersion: '1.0.0', repo: 'https://github.com/alice/todo',
    latestVersion: '1.2.0', releaseUrl: 'https://example.com/alice-todo-1.2.0.zip',
    sha256: 'abc', state: 'active', registeredAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function mountCard(props: InstanceType<typeof PluginCard>['$props']) {
  return mount(PluginCard, {
    props,
    global: { plugins: [i18n] },
  })
}

describe('PluginCard (browse mode)', () => {
  it('not installed: shows Install button and no installed badge', () => {
    const wrapper = mountCard({ entry: makeEntry(), installedVersion: null })
    expect(wrapper.find('[data-testid="plugin-install-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="plugin-installed-badge"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Todo Overlay')
    expect(wrapper.text()).toContain('@alice/todo')
  })

  it('installed: shows installed badge, no active Install button', () => {
    const wrapper = mountCard({ entry: makeEntry(), installedVersion: '1.2.0' })
    expect(wrapper.find('[data-testid="plugin-installed-badge"]').exists()).toBe(true)
    const installBtn = wrapper.find('[data-testid="plugin-install-btn"]:not([disabled])')
    expect(installBtn.exists()).toBe(false)
  })

  it('update available: shows update badge with new version', () => {
    const wrapper = mountCard({
      entry: makeEntry({ latestVersion: '1.3.0' }),
      installedVersion: '1.2.0',
    })
    expect(wrapper.find('[data-testid="plugin-update-badge"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('1.3.0')
  })

  it('incompatible: Install button disabled, incompatible state applied', () => {
    const wrapper = mountCard({
      entry: makeEntry(),
      installedVersion: null,
      incompatible: true,
    })
    const installBtn = wrapper.find('[data-testid="plugin-install-btn"]')
    expect(installBtn.attributes('disabled')).toBeDefined()
    expect(wrapper.find('[aria-disabled="true"]').exists()).toBe(true)
  })

  it('emits install event when Install button clicked', async () => {
    const wrapper = mountCard({ entry: makeEntry(), installedVersion: null })
    await wrapper.find('[data-testid="plugin-install-btn"]').trigger('click')
    expect(wrapper.emitted('install')).toBeTruthy()
    expect(wrapper.emitted('install')![0]).toEqual(['@alice/todo', '1.2.0'])
  })
})
