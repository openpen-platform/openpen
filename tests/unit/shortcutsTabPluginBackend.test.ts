/**
 * Settings shortcuts tab: when the desktop offers no way to deliver plugin
 * shortcuts (Wayland backend 'none'), the plugin shortcut group says so; on a
 * working backend no such note appears. Only presence is asserted, not wording.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { sanitizeIdForI18n } from '@openpen/module-api'
import en from '../../src/i18n/en'
import ShortcutsTab from '../../src/components/settings/ShortcutsTab.vue'
import { registerContribution, resetContributionStore } from '../../src/core/runtime/contribution-store'

// The plugin group title is looked up as `<sanitized module id>.name` (a dotted path into
// nested messages); supply it so the raw module id (which contains '@') is never compiled
// as a fallback message.
const nameKey = `${sanitizeIdForI18n('@acme/arrow')}.name`
const nameMessages = nameKey
  .split('.')
  .reverse()
  .reduce<unknown>((inner, segment) => ({ [segment]: inner }), 'Arrow') as Record<string, unknown>
const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en: { ...en, ...nameMessages } },
})

function stubOpenPenApi(backend: string | null): void {
  const noopUnsub = (): (() => void) => () => undefined
  ;(window as unknown as { openPenApi: unknown }).openPenApi = {
    platform: 'linux',
    getShortcuts: async () => ({}),
    onShortcutsUpdated: noopUnsub,
    getModuleShortcuts: async () => ({}),
    onModuleShortcutsUpdated: noopUnsub,
    getShortcutConflicts: async () => [],
    onShortcutConflictsUpdated: noopUnsub,
    getPluginShortcutBackend: async () => backend,
  }
}

describe('ShortcutsTab plugin shortcut backend note', () => {
  beforeEach(() => {
    resetContributionStore()
    registerContribution('system.shortcuts', '@acme/arrow', {
      id: 'pick',
      keys: 'CommandOrControl+Alt+T',
      scope: 'global',
      handler: () => undefined,
      label: 'Pick arrow',
    })
  })

  afterEach(() => {
    delete (window as unknown as { openPenApi?: unknown }).openPenApi
    resetContributionStore()
  })

  it('AC-12 the unsupported note appears for the none backend and is absent for a working backend', async () => {
    stubOpenPenApi('none')
    const unsupported = mount(ShortcutsTab, { global: { plugins: [i18n] } })
    await flushPromises()
    const note = unsupported.find('[data-testid="shortcuts-plugin-unsupported"]')
    expect(note.exists()).toBe(true)
    // The note carries the English message stored under the agreed key path.
    const expectedText = ['pluginShortcutsUnsupported'].reduce<unknown>(
      (node, key) => (node as Record<string, unknown> | undefined)?.[key],
      en,
    )
    expect(typeof expectedText).toBe('string')
    expect((expectedText as string).length).toBeGreaterThan(0)
    expect(note.text()).toBe(expectedText)
    unsupported.unmount()

    stubOpenPenApi('portal')
    const supported = mount(ShortcutsTab, { global: { plugins: [i18n] } })
    await flushPromises()
    expect(supported.find('[data-testid="shortcuts-plugin-unsupported"]').exists()).toBe(false)
    supported.unmount()
  })

  it('AC-12 regression: the unsupported note still appears when the loaded plugin shortcuts have no label', async () => {
    resetContributionStore()
    registerContribution('system.shortcuts', '@acme/arrow', {
      id: 'hidden',
      keys: 'CommandOrControl+Alt+H',
      scope: 'global',
      handler: () => undefined,
    })
    stubOpenPenApi('none')

    const wrapper = mount(ShortcutsTab, { global: { plugins: [i18n] } })
    await flushPromises()

    expect(wrapper.find('[data-testid="shortcuts-plugin-unsupported"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
