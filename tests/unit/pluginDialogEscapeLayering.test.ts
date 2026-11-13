import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { createI18n } from 'vue-i18n'
import PluginDetailDialog from '../../src/components/settings/plugins/PluginDetailDialog.vue'
import PluginActionConfirmDialog from '../../src/components/settings/plugins/PluginActionConfirmDialog.vue'
import PluginRemoveConfirmDialog from '../../src/components/settings/plugins/PluginRemoveConfirmDialog.vue'

const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })

const entry = {
  id: '@scope/demo',
  name: 'Demo',
  ownerLogin: 'owner',
  description: 'desc',
  latestVersion: '1.0.0',
  minAppVersion: '0.1.0',
} as never

interface HostVm { detailOpen: boolean; confirmOpen: boolean; removeOpen: boolean }

// Mirrors the settings window: the detail dialog and the confirm dialogs are
// siblings, and a confirm dialog opens above the detail dialog.
const Host = defineComponent({
  setup(_, { expose }) {
    const detailOpen = ref(true)
    const confirmOpen = ref(true)
    const removeOpen = ref(false)
    expose({ detailOpen, confirmOpen, removeOpen })
    return () => [
      h(PluginDetailDialog, {
        open: detailOpen.value, entry, installedVersion: null,
        'onUpdate:open': (v: boolean) => { detailOpen.value = v },
      }),
      h(PluginActionConfirmDialog, {
        open: confirmOpen.value, severity: 'warn', title: 'T', body: 'B', confirmLabel: 'OK',
        'onUpdate:open': (v: boolean) => { confirmOpen.value = v },
      }),
      h(PluginRemoveConfirmDialog, {
        open: removeOpen.value, pluginId: 'a', pluginName: 'A',
        'onUpdate:open': (v: boolean) => { removeOpen.value = v },
      }),
    ]
  },
})

let wrapper: VueWrapper | null = null
afterEach(() => { wrapper?.unmount(); wrapper = null })

function setup(): HostVm {
  wrapper = mount(Host, { global: { plugins: [i18n] }, attachTo: document.body })
  return wrapper.vm as unknown as HostVm
}

async function pressEscape() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await wrapper!.vm.$nextTick()
}

describe('plugin dialogs: Escape closes only the top layer', () => {
  it('closes the confirm dialog first and keeps the detail dialog open', async () => {
    const vm = setup()
    await pressEscape()
    expect(vm.confirmOpen).toBe(false)
    expect(vm.detailOpen).toBe(true)
  })

  it('closes the detail dialog on the next Escape', async () => {
    const vm = setup()
    await pressEscape()
    await pressEscape()
    expect(vm.confirmOpen).toBe(false)
    expect(vm.detailOpen).toBe(false)
  })

  it('closes the detail dialog on Escape when it is the only layer', async () => {
    const vm = setup()
    vm.confirmOpen = false
    await wrapper!.vm.$nextTick()
    await pressEscape()
    expect(vm.detailOpen).toBe(false)
  })

  it('follows open order, not mount order: a dialog opened later closes first', async () => {
    const vm = setup()
    vm.confirmOpen = false
    await wrapper!.vm.$nextTick()
    vm.removeOpen = true
    await wrapper!.vm.$nextTick()
    await pressEscape()
    expect(vm.removeOpen).toBe(false)
    expect(vm.detailOpen).toBe(true)
  })
})
