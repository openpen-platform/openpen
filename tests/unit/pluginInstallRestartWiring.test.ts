/**
 * The install-progress dialog's "Restart now" button only emits `restart`;
 * each panel that hosts the dialog must wire that emit to
 * window.openPenApi.relaunchApp(). The browse and installed panels shipped
 * with handlers that merely closed the dialog, so the button did nothing —
 * these tests pin the wiring in every host panel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { createI18n } from 'vue-i18n'
import en from '../../src/i18n/en'
import PluginsBrowsePanel from '../../src/components/settings/plugins/PluginsBrowsePanel.vue'
import PluginsInstalledPanel from '../../src/components/settings/plugins/PluginsInstalledPanel.vue'
import PluginInstallProgressDialog from '../../src/components/settings/plugins/PluginInstallProgressDialog.vue'

vi.mock('../../src/composables/usePluginMarketplace', () => ({
  usePluginMarketplace: () => ({
    catalog: ref([]),
    loading: ref(false),
    error: ref(null),
    installingId: ref(null),
    installPercent: ref(100),
    installStage: ref('done'),
    installError: ref(null),
    installedIds: ref([]),
    installedVersions: ref({}),
    operationKind: ref(null),
    fetchCatalog: vi.fn(),
    installFromCatalog: vi.fn(),
    removePlugin: vi.fn(),
    addFromLocal: vi.fn(),
    addFromGitHubRepo: vi.fn(),
    inspectLocal: vi.fn(),
    markFailed: vi.fn(),
    resetInstallState: vi.fn(),
  }),
}))

const i18n = createI18n({ locale: 'en', messages: { en }, legacy: false })

function mountPanel(component: unknown) {
  return mount(component as never, {
    global: {
      plugins: [i18n],
      stubs: {
        PluginCard: true,
        PluginDetailDialog: true,
        PluginInstallProgressDialog: true,
        PluginRemoveConfirmDialog: true,
        PluginUpgradeConfirmDialog: true,
        PluginActionConfirmDialog: true,
        PluginAddCustomDialog: true,
      },
    },
  })
}

describe('install-progress restart wiring', () => {
  beforeEach(() => {
    ;(window as { openPenApi?: unknown }).openPenApi = { relaunchApp: vi.fn() }
  })

  it('browse panel: restart emit relaunches the app', () => {
    const wrapper = mountPanel(PluginsBrowsePanel)
    const dialog = wrapper.findComponent(PluginInstallProgressDialog)
    expect(dialog.exists()).toBe(true)

    dialog.vm.$emit('restart')

    const api = (window as { openPenApi: { relaunchApp: ReturnType<typeof vi.fn> } }).openPenApi
    expect(api.relaunchApp).toHaveBeenCalledTimes(1)
  })

  it('installed panel: restart emit relaunches the app', () => {
    const wrapper = mountPanel(PluginsInstalledPanel)
    const dialog = wrapper.findComponent(PluginInstallProgressDialog)
    expect(dialog.exists()).toBe(true)

    dialog.vm.$emit('restart')

    const api = (window as { openPenApi: { relaunchApp: ReturnType<typeof vi.fn> } }).openPenApi
    expect(api.relaunchApp).toHaveBeenCalledTimes(1)
  })
})
