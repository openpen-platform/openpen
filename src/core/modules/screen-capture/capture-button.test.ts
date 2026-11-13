import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'
import { setModuleContext, clearModuleContext } from '@openpen/module-api/host'
import type { ModuleSetupContext } from '@openpen/module-api'

vi.mock('@openpen/module-api/uikit', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>()
  const AppButtonDropdown = defineComponent({
    emits: ['main-click'],
    setup(_, { emit }) {
      return () => h('button', { 'data-testid': 'main', onClick: () => emit('main-click') })
    },
  })
  return { ...actual, AppButtonDropdown, useDialog: () => ({ confirm: vi.fn() }) }
})

const { default: CaptureButton } = await import('./CaptureButton.vue')

const MODULE_ID = '@openpen/screen-capture'
const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

async function clickCapture(search: string, result: unknown) {
  window.history.replaceState({}, '', `/${search}`)
  const notify = vi.fn()
  setModuleContext(MODULE_ID, { notify, t: (key: string) => key } as unknown as ModuleSetupContext)
  ;(window as unknown as { openPenApi: unknown }).openPenApi = {
    captureScreen: vi.fn(async () => result),
    openCapturePermissionSettings: vi.fn(),
  }
  const wrapper = mount(CaptureButton, { global: { plugins: [i18n] } })
  await wrapper.get('[data-testid="main"]').trigger('click')
  await flushPromises()
  return notify
}

describe('CaptureButton toast ownership', () => {
  beforeEach(() => clearModuleContext(MODULE_ID))
  afterEach(() => {
    clearModuleContext(MODULE_ID)
    window.history.replaceState({}, '', '/')
  })

  const unsupported = { ok: false, error: 'unsupported' }

  it('shows the toast itself inside an overlay window, where the Wayland control bar lives', async () => {
    const notify = await clickCapture('?window=overlay&displayId=1&role=overlay-bar', unsupported)
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'unsupported' }))
  })

  it('leaves the toast to the host in the control-bar window, which has no toast layer', async () => {
    const notify = await clickCapture('?displayId=1&role=panel', unsupported)
    expect(notify).not.toHaveBeenCalled()
  })
})
