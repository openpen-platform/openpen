/**
 * Settings shortcuts tab: resetting a built-in shortcut whose default key is
 * held by another app must tell the user; a successful reset restores the
 * default and clears any earlier notice.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../src/i18n/en'
import ShortcutsTab from '../../src/components/settings/ShortcutsTab.vue'
import { DEFAULT_SHORTCUTS } from '../../src/types/settings'
import { resetContributionStore } from '../../src/core/runtime/contribution-store'

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

function stubOpenPenApi(resetResults: Array<{ ok: boolean; error?: string }>): void {
  const noopUnsub = (): (() => void) => () => undefined
  ;(window as unknown as { openPenApi: unknown }).openPenApi = {
    platform: 'win32',
    getShortcuts: async () => ({ ...DEFAULT_SHORTCUTS, undo: 'CommandOrControl+Alt+U' }),
    onShortcutsUpdated: noopUnsub,
    getModuleShortcuts: async () => ({}),
    onModuleShortcutsUpdated: noopUnsub,
    getShortcutConflicts: async () => [],
    onShortcutConflictsUpdated: noopUnsub,
    getPluginShortcutBackend: async () => null,
    resetShortcut: async () => resetResults.shift() ?? { ok: true },
  }
}

async function mountTab() {
  const wrapper = mount(ShortcutsTab, { global: { plugins: [i18n] } })
  await flushPromises()
  return wrapper
}

function resetButtons(wrapper: Awaited<ReturnType<typeof mountTab>>) {
  return wrapper.findAll(`button[aria-label="${en.shortcutReset}"]`)
}

describe('ShortcutsTab reset of a built-in shortcut', () => {
  afterEach(() => {
    delete (window as unknown as { openPenApi?: unknown }).openPenApi
    resetContributionStore()
  })

  it('AC-1 a failed reset shows the already-in-use notice', async () => {
    stubOpenPenApi([{ ok: false, error: 'taken' }])
    const wrapper = await mountTab()
    expect(wrapper.text()).not.toContain(en.shortcutConflict)

    const buttons = resetButtons(wrapper)
    expect(buttons).toHaveLength(1)
    await buttons[0].trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain(en.shortcutConflict)
  })

  it('AC-2 a successful reset clears the notice and restores the default', async () => {
    stubOpenPenApi([{ ok: false, error: 'taken' }, { ok: true }])
    const wrapper = await mountTab()

    await resetButtons(wrapper)[0].trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain(en.shortcutConflict)

    await resetButtons(wrapper)[0].trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain(en.shortcutConflict)
    expect(resetButtons(wrapper)).toHaveLength(0)
  })
})
