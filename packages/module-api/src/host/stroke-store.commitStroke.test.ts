/**
 * Proxy-layer tests for `commitStroke`.
 *
 * Verifies that the `@openpen/module-api/host` `commitStroke` proxy forwards
 * the call to the registered host's `commitStroke`, with the exact stroke
 * argument and without mutating it. Mirrors how the other store proxies
 * (pushCommand / removeStrokeById) delegate through the registry.
 *
 * This file owns the host registry for its lifetime: it registers a stub,
 * exercises the proxy, then restores a stub host in afterAll so downstream
 * test files (which rely on the global tests/setup.js registration) keep
 * resolving `_useHost()`.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'
import { readonly, ref } from 'vue'
import { registerHost, _resetHostRegistryForTest } from './registry'
import { commitStroke } from './stroke-store'
import type { ModuleHost } from './types'
import type { Stroke } from '../types/tool'

function makeStubHost(overrides: Partial<ModuleHost> = {}): ModuleHost {
  const noop = (): void => undefined
  const unsubscribe = (): void => undefined
  return {
    emit: noop,
    on: () => unsubscribe,
    getAllStrokes: () => [],
    removeStrokeById: () => false,
    pushCommand: noop,
    commitStroke: noop,
    hostCommands: {
      controlBar: { togglePin: noop },
      canvas: { clear: noop },
      history: { undo: noop, redo: noop },
      app: { toggleDrawingMode: noop, setDrawingMode: noop },
    },
    colorUtils: {
      resolveColorStyle: (_ctx, color) => (typeof color === 'string' ? color : color.from),
      hexToRgb: () => [0, 0, 0],
      rgbToHex: () => '#000000',
      hsvToRgb: () => [0, 0, 0],
      rgbToHsv: () => [0, 0, 0],
      hexToHsv: () => [0, 0, 0],
      hsvToHex: () => '#000000',
      isValidHex: () => false,
    },
    useStrokeStyle: () => ({
      color: readonly(ref('#000000' as string)),
      lineWidth: readonly(ref(1)),
      setColor: noop,
      setLineWidth: noop,
    }),
    usePopupAnchor: () => ({
      popupStyle: readonly(ref<Record<string, string>>({})),
      arrowDir: readonly(ref('up' as const)),
      arrowOffset: readonly(ref('50%')),
      placement: readonly(ref('below' as const)),
      updatePosition: noop,
    }),
    calculatePopupAnchor: () => ({
      placement: 'below',
      arrowDir: 'up',
      arrowOffset: '50%',
      popupStyle: {},
    }),
    usePassthroughGuard: noop,
    getSlotEntries: () => readonly(ref([])),
    ...overrides,
  }
}

function makeStroke(id: string): Stroke {
  return {
    id,
    tool: 'freehand',
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
    style: { color: '#ff0000', lineWidth: 4, lineCap: 'round', lineJoin: 'round' },
  }
}

describe('commitStroke proxy', () => {
  beforeEach(() => {
    _resetHostRegistryForTest()
  })

  afterAll(() => {
    _resetHostRegistryForTest()
    registerHost(makeStubHost())
  })

  it('forwards to the registered host.commitStroke with the same stroke', () => {
    const spy = vi.fn()
    registerHost(makeStubHost({ commitStroke: spy }))

    const stroke = makeStroke('proxy-1')
    commitStroke(stroke)

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy).toHaveBeenCalledWith(stroke)
    // Forwarded by reference — the proxy MUST NOT clone / wrap the argument.
    expect(spy.mock.calls[0][0]).toBe(stroke)
  })

  it('throws when called before a host is registered', () => {
    expect(() => commitStroke(makeStroke('x'))).toThrow(/host not registered/)
  })
})
