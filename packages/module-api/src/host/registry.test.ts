/**
 * Unit tests for the host runtime registry.
 *
 * The registry is the seam through which OpenPen's renderer injects its
 * `ModuleHost` implementation. These tests cover the fail-fast contract:
 * single-registration, error before registration, idempotent test reset.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { readonly, ref } from 'vue'
import { registerHost, _useHost, _resetHostRegistryForTest } from './registry'
import type { ModuleHost } from './types'

function makeStubHost(): ModuleHost {
  const noop = (): void => undefined
  const unsubscribe = (): void => undefined
  return {
    emit: noop,
    on: () => unsubscribe,
    getAllStrokes: () => [],
    removeStrokeById: () => false,
    pushCommand: noop,
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
  }
}

describe('host registry', () => {
  beforeEach(() => {
    _resetHostRegistryForTest()
  })

  // Restore a registered host so downstream test files (which assume the
  // global tests/setup.js registration is still active) keep passing.
  afterAll(() => {
    _resetHostRegistryForTest()
    registerHost(makeStubHost())
  })

  it('throws when _useHost is called before registerHost', () => {
    expect(() => _useHost()).toThrow(/host not registered/)
  })

  it('throw message points at the bootstrap location (src/main.ts)', () => {
    expect(() => _useHost()).toThrow(/src\/main\.ts/)
  })

  it('returns the registered implementation after registerHost', () => {
    const host = makeStubHost()
    registerHost(host)
    expect(_useHost()).toBe(host)
  })

  it('throws when registerHost is called twice', () => {
    registerHost(makeStubHost())
    expect(() => registerHost(makeStubHost())).toThrow(/more than once/)
  })

  it('_resetHostRegistryForTest restores the unregistered state', () => {
    registerHost(makeStubHost())
    _resetHostRegistryForTest()
    expect(() => _useHost()).toThrow(/host not registered/)
  })

  it('after reset, a fresh registerHost succeeds and the new impl is used', () => {
    const first = makeStubHost()
    registerHost(first)
    expect(_useHost()).toBe(first)

    _resetHostRegistryForTest()

    const second = makeStubHost()
    registerHost(second)
    expect(_useHost()).toBe(second)
    expect(_useHost()).not.toBe(first)
  })
})
