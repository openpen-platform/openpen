import { onUnmounted, readonly, ref, unref, watch } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import { getAppConfig } from '../services/config-bridge'

type SnapEdge = 'left' | 'right' | 'top' | 'bottom' | null
type Placement = 'below' | 'above' | 'left' | 'right'
type ArrowDir = 'up' | 'down' | 'left' | 'right'
type RefOrComputed<T> = Ref<T> | ComputedRef<T>

const DEFAULT_POPUP_WIDTH = 160
const DEFAULT_POPUP_HEIGHT = 96

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function toPx(value: number): string {
  return `${Math.round(value * 1000) / 1000}px`
}

function toArrowDir(placement: Placement): ArrowDir {
  if (placement === 'below') return 'up'
  if (placement === 'above') return 'down'
  if (placement === 'right') return 'left'
  return 'right'
}

function preferredPlacements(snapEdge: SnapEdge): [Placement, Placement] {
  // Vertical snap (left/right) tries right → left; horizontal (top/bottom/null) tries below → above.
  if (snapEdge === 'left' || snapEdge === 'right') return ['right', 'left']
  return ['below', 'above']
}

interface AvailableSpace {
  above: number
  below: number
  left: number
  right: number
}

function mainAxisFit(placement: Placement, space: AvailableSpace, pw: number, ph: number, gap: number): number {
  if (placement === 'below') return space.below - (ph + gap)
  if (placement === 'above') return space.above - (ph + gap)
  if (placement === 'right') return space.right - (pw + gap)
  return space.left - (pw + gap)
}

interface CalculatePopupAnchorOptions {
  triggerRect: { top: number; left: number; right: number; bottom: number; width: number; height: number }
  anchorRect?: { top: number; left: number; right: number; bottom: number; width: number; height: number }
  wrapperRect: { top: number; left: number; right: number; bottom: number; width: number; height: number }
  snapEdge: SnapEdge
  popupHeight?: number
  popupWidth?: number
  gap?: number
  arrowInset?: number
  safeMargin?: number
  availableSpace?: AvailableSpace
}

/**
 * Pure geometry helper: given rects and context, returns the optimal popup
 * placement, arrow direction, arrow offset, and absolute `popupStyle`.
 *
 * @param options.triggerRect  - Bounding rect of the trigger element.
 * @param options.anchorRect   - Optional alternative rect used as the placement
 *   anchor (defaults to `triggerRect` when omitted).
 * @param options.wrapperRect  - Bounding rect of the scrolling/position container.
 * @param options.snapEdge     - Current snap edge; drives preferred placement axis.
 * @param options.popupHeight  - Expected popup height in px (default 96).
 * @param options.popupWidth   - Expected popup width in px (default 160).
 * @param options.gap          - Gap between anchor and popup in px (default 12).
 * @param options.arrowInset   - Min px from popup edge to arrow tip (default 16).
 * @param options.safeMargin   - Min px from viewport edge (default 8).
 * @param options.availableSpace - Override available space; when provided the
 *   default viewport-rect measurement is skipped (useful for desktop-aware
 *   space derived from workArea IPC calls).
 *
 * @returns `{ placement, arrowDir, arrowOffset, popupStyle }` — all values are
 *   safe to bind directly to template refs and `:style`.
 */
export function calculatePopupAnchor({
  triggerRect,
  anchorRect,
  wrapperRect,
  snapEdge,
  popupHeight = DEFAULT_POPUP_HEIGHT,
  popupWidth = DEFAULT_POPUP_WIDTH,
  gap = 12,
  arrowInset = 16,
  safeMargin = 8,
  availableSpace,
}: CalculatePopupAnchorOptions) {
  const placementRect = anchorRect ?? triggerRect
  const triggerCenterX = triggerRect.left - wrapperRect.left + triggerRect.width / 2
  const triggerCenterY = triggerRect.top - wrapperRect.top + triggerRect.height / 2

  const viewportRect = {
    width: typeof window !== 'undefined' ? window.innerWidth : wrapperRect.width,
    height: typeof window !== 'undefined' ? window.innerHeight : wrapperRect.height,
  }

  const localSpace: AvailableSpace = {
    below: viewportRect.height - placementRect.bottom - safeMargin,
    above: placementRect.top - safeMargin,
    right: viewportRect.width - placementRect.right - safeMargin,
    left: placementRect.left - safeMargin,
  }
  const resolvedSpace = availableSpace ?? localSpace

  const order = preferredPlacements(snapEdge ?? null)
  const first = order[0]
  const second = order[1]
  const firstFit = mainAxisFit(first, resolvedSpace, popupWidth, popupHeight, gap)
  const placement: Placement = firstFit >= 0 ? first : second

  const minLeft = safeMargin - wrapperRect.left
  const maxLeft = viewportRect.width - wrapperRect.left - popupWidth - safeMargin
  const minTop = safeMargin - wrapperRect.top
  const maxTop = viewportRect.height - wrapperRect.top - popupHeight - safeMargin
  const clampMinLeft = Math.min(minLeft, maxLeft)
  const clampMaxLeft = Math.max(minLeft, maxLeft)
  const clampMinTop = Math.min(minTop, maxTop)
  const clampMaxTop = Math.max(minTop, maxTop)

  let top: number
  let left: number
  let arrowOffset: string

  if (placement === 'below' || placement === 'above') {
    const unclampedLeft = triggerCenterX - popupWidth / 2
    left = clamp(unclampedLeft, clampMinLeft, clampMaxLeft)
    top =
      placement === 'below'
        ? placementRect.bottom - wrapperRect.top + gap
        : placementRect.top - wrapperRect.top - popupHeight - gap
    top = clamp(top, clampMinTop, clampMaxTop)
    arrowOffset = toPx(clamp(triggerCenterX - left, arrowInset, popupWidth - arrowInset))
  } else {
    left =
      placement === 'right'
        ? placementRect.right - wrapperRect.left + gap
        : placementRect.left - wrapperRect.left - popupWidth - gap
    left = clamp(left, clampMinLeft, clampMaxLeft)
    const unclampedTop = triggerCenterY - popupHeight / 2
    top = clamp(unclampedTop, clampMinTop, clampMaxTop)
    arrowOffset = toPx(clamp(triggerCenterY - top, arrowInset, popupHeight - arrowInset))
  }

  return {
    placement,
    arrowDir: toArrowDir(placement),
    arrowOffset,
    popupStyle: { position: 'absolute', top: toPx(top), left: toPx(left) },
  }
}

interface UsePopupAnchorOptions {
  triggerEl: RefOrComputed<HTMLElement | null>
  anchorEl?: RefOrComputed<HTMLElement | null>
  wrapperEl: RefOrComputed<HTMLElement | null>
  snapEdge: RefOrComputed<SnapEdge>
  popupEl?: RefOrComputed<HTMLElement | null>
  popupHeight: number | RefOrComputed<number>
  popupWidth: number | RefOrComputed<number>
  gap?: number
  safeMargin?: number
  arrowInset?: number
}

export function usePopupAnchor({
  triggerEl,
  anchorEl,
  wrapperEl,
  snapEdge,
  popupEl,
  popupHeight,
  popupWidth,
  gap,
  safeMargin,
  arrowInset,
}: UsePopupAnchorOptions) {
  const popupCfg = getAppConfig().ui?.popup ?? {}
  const resolvedGap = gap ?? popupCfg.gapPx
  const resolvedSafeMargin = safeMargin ?? popupCfg.safeMarginPx
  const resolvedArrowInset = arrowInset ?? popupCfg.arrowInsetPx

  const popupStyle = ref<Record<string, string>>({})
  const arrowDir = ref<ArrowDir>('up')
  const arrowOffset = ref('50%')
  const placement = ref<Placement>('below')
  let latestRequestId = 0
  let resizeObserver: ResizeObserver | null = null

  function findWorkAreaForPoint(x: number, y: number, displays: DisplayInfo[]): DisplayArea | null {
    for (const d of displays || []) {
      const workArea = d.workArea || d.bounds
      if (!workArea) continue
      if (
        x >= workArea.x &&
        x <= workArea.x + workArea.width &&
        y >= workArea.y &&
        y <= workArea.y + workArea.height
      ) {
        return workArea
      }
    }
    return displays?.[0]?.workArea || displays?.[0]?.bounds || null
  }

  async function resolveDesktopAvailableSpace(triggerRect: DOMRect): Promise<AvailableSpace | null> {
    const api = window.openPenApi
    if (!api?.getWindowPosition || !api?.getDisplayInfo) return null
    try {
      const [winPos, displays] = await Promise.all([api.getWindowPosition(), api.getDisplayInfo()])
      if (!winPos || !Array.isArray(displays) || displays.length === 0) return null

      const triggerScreenRect = {
        left: winPos.x + triggerRect.left,
        right: winPos.x + triggerRect.right,
        top: winPos.y + triggerRect.top,
        bottom: winPos.y + triggerRect.bottom,
      }
      const centerX = (triggerScreenRect.left + triggerScreenRect.right) / 2
      const centerY = (triggerScreenRect.top + triggerScreenRect.bottom) / 2
      const workArea = findWorkAreaForPoint(centerX, centerY, displays)
      if (!workArea) return null

      return {
        below: workArea.y + workArea.height - triggerScreenRect.bottom - resolvedSafeMargin,
        above: triggerScreenRect.top - workArea.y - resolvedSafeMargin,
        right: workArea.x + workArea.width - triggerScreenRect.right - resolvedSafeMargin,
        left: triggerScreenRect.left - workArea.x - resolvedSafeMargin,
      }
    } catch {
      return null
    }
  }

  async function updatePosition(): Promise<void> {
    const requestId = ++latestRequestId
    const trigger = unref(triggerEl)
    const anchor = unref(anchorEl) || trigger
    const wrapper = unref(wrapperEl)
    if (!trigger || !anchor || !wrapper) { popupStyle.value = {}; return }

    const triggerRect = trigger.getBoundingClientRect()
    const anchorRect = anchor.getBoundingClientRect()
    const wrapperRect = wrapper.getBoundingClientRect()
    const popup = unref(popupEl)
    const measuredWidth = popup?.offsetWidth || popup?.getBoundingClientRect?.()?.width
    const measuredHeight = popup?.offsetHeight || popup?.getBoundingClientRect?.()?.height
    const desktopSpace = await resolveDesktopAvailableSpace(anchorRect as DOMRect)
    if (requestId !== latestRequestId) return

    const result = calculatePopupAnchor({
      triggerRect,
      anchorRect,
      wrapperRect,
      snapEdge: unref(snapEdge) ?? null,
      popupHeight: measuredHeight || unref(popupHeight),
      popupWidth: measuredWidth || unref(popupWidth),
      gap: resolvedGap,
      arrowInset: resolvedArrowInset,
      safeMargin: resolvedSafeMargin,
      availableSpace: desktopSpace ?? undefined,
    })

    popupStyle.value = result.popupStyle
    arrowDir.value = result.arrowDir
    arrowOffset.value = result.arrowOffset
    placement.value = result.placement
  }

  function resetResizeObserver(): void {
    resizeObserver?.disconnect()
    resizeObserver = null
    if (typeof window === 'undefined' || typeof window.ResizeObserver === 'undefined') return

    const targets = [unref(triggerEl), unref(wrapperEl), unref(popupEl)]
      .concat(unref(anchorEl) ? [unref(anchorEl)] : [])
      .filter((t): t is HTMLElement => t != null)
      .filter((t, i, arr) => arr.indexOf(t) === i)
    if (targets.length === 0) return

    resizeObserver = new window.ResizeObserver(() => { updatePosition() })
    for (const target of targets) resizeObserver.observe(target)
  }

  watch(
    [
      () => unref(triggerEl), () => unref(anchorEl), () => unref(wrapperEl),
      () => unref(snapEdge), () => unref(popupEl),
      () => unref(popupHeight), () => unref(popupWidth),
    ],
    updatePosition,
    { flush: 'post' }
  )

  watch(
    [() => unref(triggerEl), () => unref(anchorEl), () => unref(wrapperEl), () => unref(popupEl)],
    resetResizeObserver,
    { flush: 'post', immediate: true }
  )

  onUnmounted(() => { resizeObserver?.disconnect() })

  return {
    popupStyle: readonly(popupStyle),
    arrowDir: readonly(arrowDir),
    arrowOffset: readonly(arrowOffset),
    placement: readonly(placement),
    updatePosition,
  }
}
