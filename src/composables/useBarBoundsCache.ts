/**
 * useBarBoundsCache — captures real bar DOM measurements and caches them by layout class.
 *
 * Bar size is dynamic: plugins add and remove buttons at runtime, making any
 * hardcoded estimate incorrect after the first plugin change. This composable
 * measures the bar element's actual bounding rect whenever it mounts or resizes,
 * stores the result per layout class, and exposes the cache so callers can use
 * real measurements instead of estimates.
 *
 * Cache lifetime: module-scoped — survives bar v-if unmounts so the cached
 * measurement for a layout that was previously mounted is still available on
 * re-expand without waiting for the bar to mount again.
 *
 * Measurement strategy (transform-invariant per axis):
 *
 *   Horizontal bar (enter animation = XY scale from 0.85):
 *     Left/right bounds: layout-space (offsetWidth + --drag-handle-offset-x).
 *     getBoundingClientRect() would return a scaled-down width during the enter
 *     animation and produce a wrong rightFromBall (~499 instead of ~587),
 *     causing under-clamping on the next expand.
 *     Top/bottom bounds: offsetHeight / 2 — the bar is vertically centered on the
 *     ball via CSS transform(-50%), so the Y extent is symmetric regardless of
 *     where the drag handle sits within the bar.
 *
 *   Vertical bars (enter animation = scaleY only — X dimension is unaffected):
 *     Left/right bounds: getBoundingClientRect() — correct since scaleY does not
 *     distort the X axis. This also captures the CSS translate offset (±8 px for
 *     vbar-right / vbar-left) that layout-space cannot see.
 *     Top/bottom bounds: layout-space (offsetHeight + --drag-handle-offset-y) —
 *     avoids scaleY=0 distortion on the Y axis during enter animation.
 */

import { watch, nextTick, type Ref } from 'vue'
import { type BarBounds, type BarLayoutClass } from './useDragSnap'

// ── Module-scoped cache — survives bar unmounts ───────────────────────────────

type BarBoundsCache = Partial<Record<BarLayoutClass, BarBounds>>

const cache: BarBoundsCache = {}

/** Read a cached measurement for a layout class. Returns undefined if never measured. */
export function getCachedBarBounds(layout: BarLayoutClass): BarBounds | undefined {
  return cache[layout]
}

/**
 * Total bar width from the last successful measurement (leftFromBall + rightFromBall).
 * Used by callers to detect whether the cache may be stale relative to the DOM.
 * Returns null if the layout has never been measured.
 */
export function getCachedBarTotalWidth(layout: BarLayoutClass): number | null {
  const b = cache[layout]
  if (!b) return null
  return b.leftFromBall + b.rightFromBall
}

// ── Measurement helpers ───────────────────────────────────────────────────────

/**
 * Compute ball-relative bar bounds using a transform-invariant strategy per axis.
 *
 * For the horizontal bar, the enter animation scales the element (scale 0.85 → 1)
 * in both X and Y. Using getBoundingClientRect() during this animation would give
 * an incorrect (shrunk) width. We therefore derive the horizontal extent from the
 * layout-space offsetWidth and the --drag-handle-offset-x CSS variable. The vertical
 * extent is offsetHeight/2 because the bar is centered on the ball via CSS transform(-50%).
 *
 * For vertical bars, the enter animation scales only in Y (scaleY 0 → 1), so
 * getBoundingClientRect() correctly captures the X extent (including the ±8 px
 * CSS translate offset that differentiates vbar-left/right). The Y extent is
 * computed from offsetHeight and --drag-handle-offset-y to avoid scaleY distortion.
 *
 * @param el The bar DOM element.
 * @param ballViewportX Ball center X in viewport coordinates (needed for vbar X bounds).
 * @param ballViewportY Ball center Y in viewport coordinates (unused; kept for interface symmetry).
 * @param layout The bar's current effective layout class.
 */
function measureBarBounds(
  el: HTMLElement,
  ballViewportX: number,
  ballViewportY: number,
  layout: BarLayoutClass,
): BarBounds | null {
  if (el.offsetWidth === 0 && el.offsetHeight === 0) return null

  const style = getComputedStyle(el)
  const dragOffsetX = parseFloat(style.getPropertyValue('--drag-handle-offset-x')) || 20
  const dragOffsetY = parseFloat(style.getPropertyValue('--drag-handle-offset-y')) || 16

  if (layout === 'horizontal') {
    // Horizontal bar: use layout-space for X (immune to XY scale animation).
    // Y bounds: the bar is vertically centered on the ball via CSS transform(-50%),
    // so top and bottom extents are both h/2 regardless of where the drag handle sits.
    const w = el.offsetWidth
    const h = el.offsetHeight
    if (w === 0) return null
    return {
      leftFromBall:   dragOffsetX,
      rightFromBall:  w - dragOffsetX,
      topFromBall:    h / 2,
      bottomFromBall: h / 2,
    }
  }

  // Vertical bars (vbar-left, vbar-right, vbar-free):
  // X axis: getBoundingClientRect captures the ±8 px translate offset; scaleY does not affect X.
  // Y axis: layout-space to avoid scaleY distortion during enter animation.
  const rect = el.getBoundingClientRect()
  if (rect.width === 0) return null
  const h = el.offsetHeight
  return {
    leftFromBall:   ballViewportX - rect.left,
    rightFromBall:  rect.right - ballViewportX,
    topFromBall:    dragOffsetY,
    bottomFromBall: h - dragOffsetY,
  }
}

// ── Composable ────────────────────────────────────────────────────────────────

export interface UseBarBoundsCacheOptions {
  /** Ref to the mounted bar DOM element (null when collapsed via v-if). */
  barEl: Ref<HTMLElement | null>
  /** Reactive ball viewport X — used for vbar left/right bound computation. */
  ballViewportX: Ref<number | null>
  /** Reactive ball viewport Y — used for vbar top/bottom bound computation. */
  ballViewportY: Ref<number | null>
  /** Current effective bar layout class — cache key for the measurement. */
  effectiveLayout: Ref<BarLayoutClass>
  /**
   * Optional expanded state ref. When provided, a sync watcher fires a final
   * measurement the moment isExpanded flips to false while the bar element is
   * still mounted. This closes the race where a plugin-driven resize fires a
   * ResizeObserver that is scheduled after the collapse v-if, so the callback
   * never executes and the cache is never updated.
   */
  isExpanded?: Ref<boolean>
  /**
   * Called whenever the bar element measures successfully.
   * The first call after each expand reports real bounds, replacing the
   * previous estimate-based positioning intent path. Subsequent calls
   * (from ResizeObserver after a plugin-driven resize) allow callers to
   * re-send positioning intent and reclamp.
   */
  onMeasure?: (bounds: BarBounds, layout: BarLayoutClass) => void
}

export function useBarBoundsCache({
  barEl,
  ballViewportX,
  ballViewportY,
  effectiveLayout,
  isExpanded,
  onMeasure,
}: UseBarBoundsCacheOptions): { cleanup: () => void } {
  let resizeObserver: ResizeObserver | null = null

  function measure(): void {
    const el = barEl.value
    const vx = ballViewportX.value
    const vy = ballViewportY.value
    if (!el || vx === null || vy === null) return

    const layout = effectiveLayout.value
    const bounds = measureBarBounds(el, vx, vy, layout)
    if (bounds) {
      cache[layout] = bounds
      onMeasure?.(bounds, layout)
    }
  }

  function connectResizeObserver(): void {
    resizeObserver?.disconnect()
    resizeObserver = null

    const el = barEl.value
    if (!el || typeof ResizeObserver === 'undefined') return

    resizeObserver = new ResizeObserver(() => {
      measure()
    })
    resizeObserver.observe(el)
  }

  function disconnectResizeObserver(): void {
    resizeObserver?.disconnect()
    resizeObserver = null
  }

  // Watch barEl: measure and wire ResizeObserver when bar mounts, tear down when it unmounts.
  const stopBarElWatch = watch(barEl, (el) => {
    if (el) {
      // For the horizontal bar, measure after one tick so the layout-space values
      // (offsetWidth, --drag-handle-offset-x) reflect the settled state rather than
      // the initial scale=0.85 enter-from frame.
      // For vertical bars, nextTick also ensures --drag-handle-offset-y is updated
      // by updateDragHandleOffset (which runs in the same tick via watch(isExpanded)).
      void nextTick(measure)
      connectResizeObserver()
    } else {
      // Bar unmounted (v-if=false). Cache entry survives for re-expand.
      disconnectResizeObserver()
    }
  })

  // When the layout changes while the bar is mounted (horizontal ↔ vertical switch),
  // re-measure on the next tick so the new layout class gets its own cache entry.
  const stopLayoutWatch = watch(effectiveLayout, () => {
    if (barEl.value) {
      void nextTick(measure)
    }
  })

  // When the ball viewport position changes while the bar is mounted, re-measure
  // for vertical bars (their X bounds depend on ball position via getBoundingClientRect).
  // Horizontal bars use layout-space so ball position doesn't affect their bounds.
  const stopPosWatch = watch([ballViewportX, ballViewportY], () => {
    if (barEl.value && effectiveLayout.value !== 'horizontal') {
      measure()
    }
  })

  // Flush any pending resize before the bar leaves the DOM. The ResizeObserver
  // callback is a rendering-pipeline task; if a plugin resizes the bar and the
  // user collapses before the callback fires, the observer is disconnected while
  // still pending and the cache retains the pre-resize measurement. flush:'sync'
  // ensures this watcher runs inside the same synchronous call that sets
  // isExpanded=false, while barEl still points to the mounted element.
  const stopExpandedWatch = isExpanded
    ? watch(
        isExpanded,
        (expanded) => {
          if (!expanded && barEl.value) {
            measure()
          }
        },
        { flush: 'sync' },
      )
    : null

  function cleanup(): void {
    disconnectResizeObserver()
    stopBarElWatch()
    stopLayoutWatch()
    stopPosWatch()
    stopExpandedWatch?.()
  }

  return { cleanup }
}
