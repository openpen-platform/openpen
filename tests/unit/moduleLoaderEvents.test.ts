import { describe, it, expect, beforeEach, vi } from 'vitest'
import { defineModule } from '@openpen/module-api'
import {
  loadModules,
  unsubscribeModuleEvents,
} from '../../src/core/runtime/module-loader'
import {
  resetModuleRegistry,
} from '../../src/core/runtime/module-registry'
import {
  resetContributionStore,
  getSlotEntries,
} from '../../src/core/runtime/contribution-store'
import { clearEventBus, emit } from '../../src/core/runtime/event-bus'

describe('module-loader — system.events wiring', () => {
  beforeEach(() => {
    resetModuleRegistry()
    resetContributionStore()
    clearEventBus()
  })

  it('subscribes event contributions to the bus', async () => {
    const handler = vi.fn()
    const m = defineModule({
      id: '@test/mod',
      contributes: {
        events: [{ event: 'tool-changed', handler }],
      },
    })
    await loadModules({ modules: [m], hostVersion: '1.0.0' })

    emit('tool-changed', { tool: 'freehand' })
    expect(handler).toHaveBeenCalledWith({ tool: 'freehand' })
  })

  it('also stores events in contribution-store for introspection', async () => {
    const handler = vi.fn()
    const m = defineModule({
      id: '@test/mod',
      contributes: { events: [{ event: 'e', handler }] },
    })
    await loadModules({ modules: [m], hostVersion: '1.0.0' })

    const entries = getSlotEntries('system.events').value
    expect(entries).toHaveLength(1)
    expect(entries[0].moduleId).toBe('@test/mod')
  })

  it('unsubscribeModuleEvents stops handlers for that module only', async () => {
    const a = vi.fn()
    const b = vi.fn()
    const modA = defineModule({
      id: '@test/a',
      contributes: { events: [{ event: 'shared', handler: a }] },
    })
    const modB = defineModule({
      id: '@test/b',
      contributes: { events: [{ event: 'shared', handler: b }] },
    })
    await loadModules({ modules: [modA, modB], hostVersion: '1.0.0' })

    unsubscribeModuleEvents('@test/a')
    emit('shared', null)
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledOnce()
  })

  it('unsubscribeModuleEvents is idempotent + safe for unknown modules', () => {
    expect(() => unsubscribeModuleEvents('@test/never-loaded')).not.toThrow()
  })

  it('does not subscribe malformed event entries', async () => {
    const m = defineModule({
      id: '@test/m',
      contributes: {
        events: [
          { event: 'ok', handler: vi.fn() },
          // @ts-expect-error testing runtime defence
          { event: 123, handler: vi.fn() },
          // @ts-expect-error testing runtime defence
          { event: 'bad', handler: 'not-a-function' },
        ] as never,
      },
    })
    expect(() =>
      loadModules({ modules: [m], hostVersion: '1.0.0' })
    ).not.toThrow()
  })
})
