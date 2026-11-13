/**
 * Public `activateTool` (from `@openpen/module-api`) against the real
 * host implementation registered by tests/setup.js.
 *
 * Observable surface: the renderer-local `tool-changed` event and the
 * `setActiveTool` IPC call on `window.openPenApi`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { activateTool } from '@openpen/module-api'
import { registerContribution, resetContributionStore } from '../../src/core/runtime/contribution-store'
import { on as eventBusOn } from '../../src/core/runtime/event-bus'

describe('activateTool', () => {
  const setActiveTool = vi.fn()
  let toolChanged: unknown[]
  let off: () => void

  beforeEach(() => {
    resetContributionStore()
    setActiveTool.mockClear()
    ;(window as unknown as { openPenApi: unknown }).openPenApi = { setActiveTool }
    toolChanged = []
    off = eventBusOn('tool-changed', (payload) => { toolChanged.push(payload) })
    registerContribution('canvas.tools', '@acme/arrow', {
      id: 'arrow',
      onPointerDown: () => undefined,
    })
  })

  afterEach(() => {
    off()
    delete (window as unknown as { openPenApi?: unknown }).openPenApi
    resetContributionStore()
  })

  it('AC-13 activating a registered tool emits a local tool-changed event and sends setActiveTool', () => {
    activateTool('arrow')

    expect(toolChanged).toEqual([{ tool: 'arrow' }])
    expect(setActiveTool).toHaveBeenCalledTimes(1)
    expect(setActiveTool).toHaveBeenCalledWith({ tool: 'arrow' })
  })

  it('AC-13 activating an unknown tool id emits no event and sends no IPC', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    activateTool('does-not-exist')

    expect(toolChanged).toEqual([])
    expect(setActiveTool).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
