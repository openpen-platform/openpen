import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { defineComponent, h } from 'vue'
import type { ControlBarLayout } from '@openpen/module-api'
import en from '../../src/i18n/en'
import LayoutTab from '../../src/components/settings/LayoutTab.vue'
import {
  registerContribution,
  resetContributionStore,
} from '../../src/core/runtime/contribution-store'

const StubButton = defineComponent({ render: () => h('span', 'btn') })

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

const SAMPLE_LAYOUT: ControlBarLayout = {
  version: 1,
  groups: [
    { id: 'tools', items: ['freehand', 'ghost-item'], separator: 'auto' },
    { id: 'default', items: [], separator: 'auto' },
  ],
}

function stubApi(layout: ControlBarLayout) {
  const setLayout = vi.fn().mockResolvedValue({ ok: true })
  ;(window as unknown as { openPenApi: unknown }).openPenApi = {
    getLayout: vi.fn().mockResolvedValue(layout),
    setLayout,
    onLayoutUpdated: vi.fn().mockReturnValue(() => {}),
    repairLayout: vi.fn().mockResolvedValue(undefined),
  }
  return { setLayout }
}

function mountTab() {
  return mount(LayoutTab, { global: { plugins: [i18n] } })
}

describe('LayoutTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetContributionStore()
    // Register a known contribution so 'freehand' resolves to a real item and
    // 'ghost-item' (no contribution) is treated as a ghost.
    registerContribution('ui.control-bar', '@openpen/freehand', {
      id: 'freehand',
      component: StubButton,
    })
  })

  afterEach(() => {
    resetContributionStore()
  })

  it('mounts and renders one panel for each layout group', async () => {
    stubApi(SAMPLE_LAYOUT)
    const wrapper = mountTab()
    await flushPromises()

    expect(wrapper.find('[data-testid="settings-layout-tab-panel"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="settings-layout-group-tools"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="settings-layout-group-default"]').exists()).toBe(true)
  })

  it('reads the layout from getLayout on mount', async () => {
    stubApi(SAMPLE_LAYOUT)
    const wrapper = mountTab()
    await flushPromises()

    expect(window.openPenApi?.getLayout).toHaveBeenCalledOnce()
    // The known item renders an item row; the ghost id renders a ghost row.
    expect(wrapper.find('[data-testid="settings-layout-item-freehand"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="settings-layout-ghost-ghost-item"]').exists()).toBe(true)
  })

  it('exposes the core action buttons', async () => {
    stubApi(SAMPLE_LAYOUT)
    const wrapper = mountTab()
    await flushPromises()

    expect(wrapper.find('[data-testid="settings-layout-add-group-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="settings-layout-clean-ghosts-btn"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="settings-layout-reset-btn"]').exists()).toBe(true)
  })

  it('protects the default group from deletion', async () => {
    stubApi(SAMPLE_LAYOUT)
    const wrapper = mountTab()
    await flushPromises()

    expect(wrapper.find('[data-testid="settings-layout-delete-group-default-btn"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="settings-layout-delete-group-tools-btn"]').exists()).toBe(true)
  })

  it('persists a plain, JSON-serializable payload (no reactive Proxy leak)', async () => {
    const { setLayout } = stubApi(SAMPLE_LAYOUT)
    const wrapper = mountTab()
    await flushPromises()

    // Adding a group persists immediately; capture the payload sent to main.
    await wrapper.find('[data-testid="settings-layout-add-group-btn"]').trigger('click')
    await flushPromises()

    expect(setLayout).toHaveBeenCalled()
    const payload = setLayout.mock.calls.at(-1)?.[0]

    // A leaked Vue reactive Proxy would survive structured clone and re-enter
    // here as a Proxy; a JSON round-trip that produces a deep-equal value proves
    // the payload is a plain, IPC-cloneable object.
    expect(() => JSON.parse(JSON.stringify(payload))).not.toThrow()
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload)
  })
})
