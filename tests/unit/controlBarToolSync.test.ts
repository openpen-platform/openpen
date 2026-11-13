/**
 * ControlBar tool sync: when the main process relays a tool change that
 * originated in another window (for example a plugin shortcut handled in the
 * overlay), the control bar must publish it on the renderer-local
 * `tool-changed` event so every button re-evaluates its active state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../src/i18n/en'
import ControlBar from '../../src/components/ControlBar.vue'
import { on as eventBusOn } from '../../src/core/runtime/event-bus'

vi.mock('../../src/services/config-bridge', () => ({
  getAppConfig: () => ({
    interaction: { drag: { thresholdPx: 4, snapDurationMs: 250, dragEndDelayMs: 50 } },
  }),
}))

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })

describe('ControlBar tool sync', () => {
  let relayedToolChange: ((config: { tool: string }) => void) | null
  let toolChanged: unknown[]
  let off: () => void

  beforeEach(() => {
    relayedToolChange = null
    const api = new Proxy(
      {
        platform: 'darwin',
        getDiagnosticsState: () => Promise.resolve({ events: [] }),
        onToolConfigChanged: (cb: (config: { tool: string }) => void) => {
          relayedToolChange = cb
          return () => { relayedToolChange = null }
        },
      } as Record<string, unknown>,
      {
        get: (target, prop: string) => (prop in target ? target[prop] : vi.fn()),
      },
    )
    ;(window as unknown as { openPenApi: unknown }).openPenApi = api
    toolChanged = []
    off = eventBusOn('tool-changed', (payload) => { toolChanged.push(payload) })
  })

  afterEach(() => {
    off()
    delete (window as unknown as { openPenApi?: unknown }).openPenApi
  })

  it('AC-1 a tool change relayed from another window is re-published as a local tool-changed event', async () => {
    const wrapper = mount(ControlBar, { global: { plugins: [i18n] }, attachTo: document.body })
    await flushPromises()
    expect(relayedToolChange).toBeTypeOf('function')
    toolChanged.length = 0

    relayedToolChange!({ tool: 'arrow' })
    relayedToolChange!({ tool: 'freehand' })

    expect(toolChanged).toEqual([{ tool: 'arrow' }, { tool: 'freehand' }])
    wrapper.unmount()
  })
})
