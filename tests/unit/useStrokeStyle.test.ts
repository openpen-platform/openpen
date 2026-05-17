/**
 * initStrokeStyleFromSettings — host-boot seed for stroke style.
 *
 * Contract:
 *  - Reads persisted module defaults from the settings cache.
 *  - Updates the window-local refs and emits stroke-style-changed on the
 *    same-window event bus (so the overlay's useCanvas picks it up).
 *  - Never broadcasts via IPC — a per-window boot-time broadcast would
 *    let any window re-boot (settings open, multi-display overlay create)
 *    overwrite every other window's current stroke style.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  useStrokeStyle,
  initStrokeStyleFromSettings,
  resetStrokeStyleForTest,
} from '../../src/composables/useStrokeStyle'
import {
  setSettingsCache,
  resetSettingsCacheForTest,
} from '../../src/core/runtime/module-settings-cache'
import { on as eventBusOn, clearEventBus } from '../../src/core/runtime/event-bus'

function stubOpenPenApi() {
  const setStrokeStyle = vi.fn()
  ;(globalThis as unknown as { window: Window & typeof globalThis }).window = globalThis as unknown as Window & typeof globalThis
  ;(window as Window & typeof globalThis).openPenApi = { setStrokeStyle } as never
  return { setStrokeStyle }
}

beforeEach(() => {
  resetSettingsCacheForTest()
  resetStrokeStyleForTest()
  clearEventBus()
})

describe('initStrokeStyleFromSettings', () => {
  it('seeds colorRef from @openpen/color.defaultColor', () => {
    setSettingsCache('@openpen/color', { defaultColor: '#10B981' })

    initStrokeStyleFromSettings()

    const { color } = useStrokeStyle()
    expect(color.value).toBe('#10B981')
  })

  it('seeds lineWidthRef from @openpen/stroke-width.defaultWidth', () => {
    setSettingsCache('@openpen/stroke-width', { defaultWidth: 12 })

    initStrokeStyleFromSettings()

    const { lineWidth } = useStrokeStyle()
    expect(lineWidth.value).toBe(12)
  })

  it('emits stroke-style-changed on the same-window event bus (overlay useCanvas hook)', () => {
    setSettingsCache('@openpen/color', { defaultColor: '#10B981' })
    setSettingsCache('@openpen/stroke-width', { defaultWidth: 7 })
    const handler = vi.fn()
    eventBusOn('stroke-style-changed', handler)

    initStrokeStyleFromSettings()

    expect(handler).toHaveBeenCalledWith({ color: '#10B981' })
    expect(handler).toHaveBeenCalledWith({ lineWidth: 7 })
  })

  it('never broadcasts via IPC (local-only seed)', () => {
    const { setStrokeStyle } = stubOpenPenApi()
    setSettingsCache('@openpen/color', { defaultColor: '#10B981' })
    setSettingsCache('@openpen/stroke-width', { defaultWidth: 12 })

    initStrokeStyleFromSettings()

    expect(setStrokeStyle).not.toHaveBeenCalled()
  })

  it('is a no-op when no relevant settings are cached', () => {
    const handler = vi.fn()
    eventBusOn('stroke-style-changed', handler)

    initStrokeStyleFromSettings()

    const { color, lineWidth } = useStrokeStyle()
    expect(color.value).toBe('#818cf8')
    expect(lineWidth.value).toBe(4)
    expect(handler).not.toHaveBeenCalled()
  })

  it('ignores cache entries with wrong-typed defaults', () => {
    const handler = vi.fn()
    eventBusOn('stroke-style-changed', handler)
    setSettingsCache('@openpen/color', { defaultColor: 42 })
    setSettingsCache('@openpen/stroke-width', { defaultWidth: '8' })

    initStrokeStyleFromSettings()

    const { color, lineWidth } = useStrokeStyle()
    expect(color.value).toBe('#818cf8')
    expect(lineWidth.value).toBe(4)
    expect(handler).not.toHaveBeenCalled()
  })

  it('clamps out-of-range defaultWidth into the supported 1..20 band', () => {
    setSettingsCache('@openpen/stroke-width', { defaultWidth: 999 })

    initStrokeStyleFromSettings()

    const { lineWidth } = useStrokeStyle()
    expect(lineWidth.value).toBe(20)
  })
})
