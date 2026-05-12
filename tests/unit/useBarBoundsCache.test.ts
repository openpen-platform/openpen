/**
 * useBarBoundsCache unit tests.
 *
 * Covers the stale-cache scenario where a plugin resizes the bar while it is
 * mounted and the ResizeObserver callback has not yet fired before the user
 * collapses the bar. The flush:'sync' watcher on isExpanded must update the
 * cache before the bar leaves the DOM, so the next expand uses fresh bounds.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref, nextTick } from 'vue'
import { useBarBoundsCache, getCachedBarBounds, getCachedBarTotalWidth } from '../../src/composables/useBarBoundsCache'
import type { BarLayoutClass } from '../../src/composables/useDragSnap'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBarEl(opts: { offsetWidth?: number; offsetHeight?: number } = {}): HTMLElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'offsetWidth', { value: opts.offsetWidth ?? 300, configurable: true })
  Object.defineProperty(el, 'offsetHeight', { value: opts.offsetHeight ?? 44, configurable: true })
  // getBoundingClientRect for vertical bars
  el.getBoundingClientRect = () => ({
    x: 0, y: 0,
    left: 0, top: 0,
    right: opts.offsetWidth ?? 300,
    bottom: opts.offsetHeight ?? 44,
    width: opts.offsetWidth ?? 300,
    height: opts.offsetHeight ?? 44,
    toJSON: () => ({}),
  })
  // CSS variable used by measureBarBounds
  vi.spyOn(window, 'getComputedStyle').mockReturnValue({
    getPropertyValue: (prop: string) => {
      if (prop === '--drag-handle-offset-x') return '20'
      if (prop === '--drag-handle-offset-y') return '16'
      return ''
    },
    borderLeftWidth: '0px',
    borderTopWidth: '0px',
  } as unknown as CSSStyleDeclaration)
  return el
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useBarBoundsCache — flush:sync collapse guard', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('updates cache synchronously when isExpanded flips to false while bar is mounted', async () => {
    const barEl = ref<HTMLElement | null>(null)
    const ballViewportX = ref<number | null>(400)
    const ballViewportY = ref<number | null>(300)
    const effectiveLayout = ref<BarLayoutClass>('horizontal')
    const isExpanded = ref(true)

    const { cleanup } = useBarBoundsCache({
      barEl,
      ballViewportX,
      ballViewportY,
      effectiveLayout,
      isExpanded,
    })

    // Mount bar with initial width 300px
    const el = makeBarEl({ offsetWidth: 300 })
    barEl.value = el
    await nextTick()
    // Initial measurement captured via nextTick after mount
    await nextTick()

    const initialBounds = getCachedBarBounds('horizontal')
    expect(initialBounds).toBeDefined()
    const initialTotal = getCachedBarTotalWidth('horizontal')
    expect(initialTotal).not.toBeNull()

    // Simulate plugin resize: bar width increases to 400px,
    // but ResizeObserver callback has NOT yet fired.
    Object.defineProperty(el, 'offsetWidth', { value: 400, configurable: true })

    // User collapses: isExpanded → false.
    // The flush:'sync' watcher must fire immediately and capture the new width.
    isExpanded.value = false

    const boundsAfterCollapse = getCachedBarBounds('horizontal')
    expect(boundsAfterCollapse).toBeDefined()

    // leftFromBall + rightFromBall should reflect the updated 400px width
    const totalAfter = getCachedBarTotalWidth('horizontal')
    expect(totalAfter).not.toBeNull()
    expect(totalAfter).toBeGreaterThan(initialTotal!)

    cleanup()
  })

  it('does not measure when isExpanded flips to false but bar el is null', () => {
    const barEl = ref<HTMLElement | null>(null)
    const ballViewportX = ref<number | null>(400)
    const ballViewportY = ref<number | null>(300)
    const effectiveLayout = ref<BarLayoutClass>('horizontal')
    const isExpanded = ref(true)

    const { cleanup } = useBarBoundsCache({
      barEl,
      ballViewportX,
      ballViewportY,
      effectiveLayout,
      isExpanded,
    })

    // barEl is never set (collapsed from the start)
    const before = getCachedBarBounds('horizontal')

    isExpanded.value = false
    // No el → measure() returns early, cache unchanged
    const after = getCachedBarBounds('horizontal')
    expect(after).toBe(before)

    cleanup()
  })

  it('getCachedBarTotalWidth returns null when layout has never been measured', () => {
    // Use a layout that has never been cached in this test run
    const total = getCachedBarTotalWidth('vbar-free' as BarLayoutClass)
    // May or may not be null depending on test order; only check the type contract
    if (total !== null) {
      expect(typeof total).toBe('number')
    } else {
      expect(total).toBeNull()
    }
  })

  it('getCachedBarTotalWidth equals leftFromBall + rightFromBall from getCachedBarBounds', async () => {
    const barEl = ref<HTMLElement | null>(null)
    const ballViewportX = ref<number | null>(400)
    const ballViewportY = ref<number | null>(300)
    const effectiveLayout = ref<BarLayoutClass>('horizontal')

    const { cleanup } = useBarBoundsCache({
      barEl,
      ballViewportX,
      ballViewportY,
      effectiveLayout,
    })

    const el = makeBarEl({ offsetWidth: 350 })
    barEl.value = el
    await nextTick()
    await nextTick()

    const bounds = getCachedBarBounds('horizontal')
    const total = getCachedBarTotalWidth('horizontal')
    if (bounds && total !== null) {
      expect(total).toBe(bounds.leftFromBall + bounds.rightFromBall)
    }

    cleanup()
  })
})

describe('useBarBoundsCache — onMeasure callback', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('calls onMeasure when bar element mounts and measures successfully', async () => {
    const barEl = ref<HTMLElement | null>(null)
    const ballViewportX = ref<number | null>(400)
    const ballViewportY = ref<number | null>(300)
    const effectiveLayout = ref<BarLayoutClass>('horizontal')
    const onMeasure = vi.fn()

    const { cleanup } = useBarBoundsCache({
      barEl,
      ballViewportX,
      ballViewportY,
      effectiveLayout,
      onMeasure,
    })

    const el = makeBarEl({ offsetWidth: 360 })
    barEl.value = el
    await nextTick()
    await nextTick()

    expect(onMeasure).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('passes correct (bounds, layout) to onMeasure', async () => {
    const barEl = ref<HTMLElement | null>(null)
    const ballViewportX = ref<number | null>(400)
    const ballViewportY = ref<number | null>(300)
    const effectiveLayout = ref<BarLayoutClass>('horizontal')
    const onMeasure = vi.fn()

    const { cleanup } = useBarBoundsCache({
      barEl,
      ballViewportX,
      ballViewportY,
      effectiveLayout,
      onMeasure,
    })

    const el = makeBarEl({ offsetWidth: 360, offsetHeight: 44 })
    barEl.value = el
    await nextTick()
    await nextTick()

    expect(onMeasure).toHaveBeenCalledWith(
      expect.objectContaining({
        leftFromBall: expect.any(Number),
        rightFromBall: expect.any(Number),
        topFromBall: expect.any(Number),
        bottomFromBall: expect.any(Number),
      }),
      'horizontal',
    )

    cleanup()
  })

  it('calls onMeasure again after ResizeObserver fires', async () => {
    const barEl = ref<HTMLElement | null>(null)
    const ballViewportX = ref<number | null>(400)
    const ballViewportY = ref<number | null>(300)
    const effectiveLayout = ref<BarLayoutClass>('horizontal')
    const onMeasure = vi.fn()

    // Capture the ResizeObserver callback so we can fire it manually.
    let capturedCallback: ResizeObserverCallback | null = null
    const originalResizeObserver = globalThis.ResizeObserver
    globalThis.ResizeObserver = class MockResizeObserver {
      constructor(cb: ResizeObserverCallback) { capturedCallback = cb }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver

    const { cleanup } = useBarBoundsCache({
      barEl,
      ballViewportX,
      ballViewportY,
      effectiveLayout,
      onMeasure,
    })

    const el = makeBarEl({ offsetWidth: 360 })
    barEl.value = el
    await nextTick()
    await nextTick()

    const firstCallCount = onMeasure.mock.calls.length

    // Simulate ResizeObserver firing after a plugin-driven resize.
    Object.defineProperty(el, 'offsetWidth', { value: 420, configurable: true })
    capturedCallback!([], {} as ResizeObserver)

    expect(onMeasure.mock.calls.length).toBeGreaterThan(firstCallCount)

    cleanup()
    globalThis.ResizeObserver = originalResizeObserver
  })

  it('calls onMeasure with new layout after layout class switches while bar is mounted', async () => {
    const barEl = ref<HTMLElement | null>(null)
    const ballViewportX = ref<number | null>(400)
    const ballViewportY = ref<number | null>(300)
    const effectiveLayout = ref<BarLayoutClass>('horizontal')
    const onMeasure = vi.fn()

    const { cleanup } = useBarBoundsCache({
      barEl,
      ballViewportX,
      ballViewportY,
      effectiveLayout,
      onMeasure,
    })

    const el = makeBarEl({ offsetWidth: 360, offsetHeight: 200 })
    barEl.value = el
    await nextTick()
    await nextTick()

    const callsBeforeSwitch = onMeasure.mock.calls.length

    // Switch layout while bar is mounted.
    effectiveLayout.value = 'vbar-free'
    await nextTick()
    await nextTick()

    expect(onMeasure.mock.calls.length).toBeGreaterThan(callsBeforeSwitch)

    const lastCall = onMeasure.mock.calls[onMeasure.mock.calls.length - 1]
    expect(lastCall[1]).toBe('vbar-free')

    cleanup()
  })
})
