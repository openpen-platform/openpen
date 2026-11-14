import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, ref, nextTick } from 'vue'
import { createI18n } from 'vue-i18n'
import PluginRemoveConfirmDialog from '../../src/components/settings/plugins/PluginRemoveConfirmDialog.vue'
import PluginActionConfirmDialog from '../../src/components/settings/plugins/PluginActionConfirmDialog.vue'

const i18n = createI18n({ legacy: false, locale: 'en', missingWarn: false, fallbackWarn: false, messages: { en: {} } })

interface HostVm { open: boolean }

// The opener button sits behind the dialog, like the Add source button does.
const Host = defineComponent({
  setup(_, { expose }) {
    const open = ref(false)
    expose({ open })
    return () => [
      h('button', { id: 'opener' }, 'open'),
      h('button', { id: 'behind' }, 'behind'),
      h(PluginRemoveConfirmDialog, {
        open: open.value, pluginId: 'a', pluginName: 'A',
        'onUpdate:open': (v: boolean) => { open.value = v },
      }),
    ]
  },
})

let wrapper: VueWrapper | null = null
afterEach(() => { wrapper?.unmount(); wrapper = null; document.body.innerHTML = '' })

const flush = () => new Promise<void>((r) => setTimeout(r, 10))

async function openFromOpener() {
  wrapper = mount(Host, { global: { plugins: [i18n] }, attachTo: document.body })
  const opener = document.getElementById('opener') as HTMLButtonElement
  opener.focus()
  ;(wrapper.vm as unknown as HostVm).open = true
  await nextTick()
  await flush()
  return opener
}

describe('plugin dialogs: focus handling', () => {
  it('moves focus into the dialog and exposes dialog semantics', async () => {
    await openFromOpener()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog).not.toBeNull()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    const labelId = dialog.getAttribute('aria-labelledby')!
    expect(document.getElementById(labelId)?.textContent).toBeTruthy()
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('keeps Tab inside the dialog (last -> first)', async () => {
    await openFromOpener()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    const buttons = dialog.querySelectorAll('button')
    const last = buttons[buttons.length - 1] as HTMLButtonElement
    last.focus()
    last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
    await flush()
    expect(document.activeElement).toBe(buttons[0])
  })

  it('pulls focus back when something behind the dialog takes it', async () => {
    await openFromOpener()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    ;(document.getElementById('behind') as HTMLButtonElement).focus()
    await flush()
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('returns focus to the opener after close', async () => {
    const opener = await openFromOpener()
    ;(wrapper!.vm as unknown as HostVm).open = false
    await nextTick()
    await flush()
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('still closes on Escape although the dialog carries role="dialog"', async () => {
    await openFromOpener()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await nextTick()
    expect((wrapper!.vm as unknown as HostVm).open).toBe(false)
  })

  it('confirm dialog sets role, aria-modal and a resolvable label', async () => {
    const w = mount(PluginActionConfirmDialog, {
      props: { open: true, severity: 'warn', title: 'T', body: 'B', confirmLabel: 'OK' },
      global: { plugins: [i18n] }, attachTo: document.body,
    })
    await nextTick()
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)).not.toBeNull()
    w.unmount()
  })

  describe('chained dialogs (one closes while the next opens in the same tick)', () => {
    interface ChainVm { a: boolean; b: boolean }
    const Chain = defineComponent({
      setup(_, { expose }) {
        const a = ref(false)
        const b = ref(false)
        expose({ a, b })
        return () => [
          h('section', { id: 'region' }, [h('button', { id: 'opener' }, 'open')]),
          h(PluginRemoveConfirmDialog, {
            open: a.value, pluginId: 'a', pluginName: 'A',
            'onUpdate:open': (v: boolean) => { a.value = v },
            onConfirm: () => { a.value = false; b.value = true },
          }),
          h(PluginActionConfirmDialog, {
            open: b.value, severity: 'warn', title: 'T', body: 'B', confirmLabel: 'OK',
            'onUpdate:open': (v: boolean) => { b.value = v },
          }),
        ]
      },
    })

    async function openChain() {
      wrapper = mount(Chain, { global: { plugins: [i18n] }, attachTo: document.body })
      const opener = document.getElementById('opener') as HTMLButtonElement
      opener.focus()
      const vm = wrapper.vm as unknown as ChainVm
      vm.a = true
      await nextTick()
      await flush()
      return { opener, vm }
    }

    async function chainToSecond() {
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement
      const confirm = dialog.querySelectorAll('button')[1] as HTMLButtonElement
      confirm.focus()
      confirm.click()
      await nextTick()
      await flush()
    }

    it('returns focus to the original opener after the second dialog closes', async () => {
      const { opener, vm } = await openChain()
      await chainToSecond()
      expect(vm.b).toBe(true)
      expect(document.querySelector('[role="dialog"]')).not.toBeNull()
      vm.b = false
      await nextTick()
      await flush()
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      expect(document.activeElement).toBe(opener)
    })

    it('falls back to the opener region when the opener itself is gone', async () => {
      const { opener, vm } = await openChain()
      await chainToSecond()
      opener.remove()
      vm.b = false
      await nextTick()
      await flush()
      expect(document.activeElement).toBe(document.getElementById('region'))
    })
  })
})
