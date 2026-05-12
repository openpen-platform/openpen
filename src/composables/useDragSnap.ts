/**
 * useDragSnap — floating-ball drag + edge snap.
 *
 * Thin intent emitter. All position arithmetic happens in the main-process
 * PositioningEngine. This composable is responsible for:
 *   - Tracking drag state flags (isPointerDragging, hasDragMotion, wasDragged).
 *   - Emitting drag-start / drag-move / drag-end intents to the engine.
 *   - Reflecting snapEdge from the engine's drag-end intent response so the
 *     control bar can render the correct visual class immediately.
 *
 * Drag detection uses screen coordinate delta (the window is stationary during drag).
 *   mousedown → send drag-start intent; capture initial ball screen position from response.
 *   mousemove → emit drag-move intents (RAF-throttled) with ball = initialBall + screenDelta.
 *   mouseup → after DRAG_END_DELAY ms, emit drag-end intent; engine resolves
 *             snap target and broadcasts the resulting state.
 */

import { ref, readonly, watch, type Ref } from 'vue'
import { getAppConfig } from '../services/config-bridge'
import {
  findDisplay,
} from '../../shared/positioning-math.js'

/** No-op in prod; in dev, prints with the [DragSnap] prefix. */
const debug = (...args: unknown[]): void => {
  if (import.meta.env.DEV) console.log('[DragSnap]', ...args)
}

/**
 * Bar extent expressed as distances from ball center (all values positive).
 *
 * The bar is anchored on the drag handle (which aligns with the ball center),
 * not centered on the ball. This makes the bar asymmetric on both axes:
 * horizontal bar extends ~20 px left and ~580 px right of the ball;
 * vertical bar extends ~16 px above and ~380 px below.
 *
 * Expressing bounds relative to the ball center lets clampToWorkArea use a
 * single axis-uniform formula regardless of layout orientation.
 */
export interface BarBounds {
  /** Distance from bar's left edge to ball center (bar left is to the left of ball). */
  leftFromBall: number
  /** Distance from bar's right edge to ball center (bar right is to the right of ball). */
  rightFromBall: number
  /** Distance from bar's top edge to ball center (bar top is above ball). */
  topFromBall: number
  /** Distance from bar's bottom edge to ball center (bar bottom is below ball). */
  bottomFromBall: number
}

/**
 * Bar bounds from an element's bounding rect and ball viewport position.
 * Returns null for zero-size elements.
 *
 * @param el Bar DOM element.
 * @param ballViewportX Ball center X in viewport (workArea-relative) coordinates.
 * @param ballViewportY Ball center Y in viewport (workArea-relative) coordinates.
 */
export function barBoundsFromEl(el: HTMLElement, ballViewportX: number, ballViewportY: number): BarBounds | null {
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return {
    leftFromBall:   ballViewportX - rect.left,
    rightFromBall:  (rect.left + rect.width)  - ballViewportX,
    topFromBall:    ballViewportY - rect.top,
    bottomFromBall: (rect.top + rect.height)  - ballViewportY,
  }
}

/** Effective bar layout class resolved from snap state + barLayout setting. */
export type BarLayoutClass = 'horizontal' | 'vbar-left' | 'vbar-right' | 'vbar-free'

export interface UseDragSnapOptions {
  barEl: Ref<HTMLElement | null>
  enableDragAutoSnap: Ref<boolean>
  /** Current effective bar layout — passed to drag-end intent so engine can apply correct axis clamping. */
  barLayoutClass: Ref<BarLayoutClass>
}

export function useDragSnap({ barEl, enableDragAutoSnap, barLayoutClass }: UseDragSnapOptions) {
  const appConfig = getAppConfig()
  const DRAG_THRESHOLD: number = appConfig.interaction.drag.thresholdPx
  const DRAG_END_DELAY: number = appConfig.interaction.drag.dragEndDelayMs

  // snapEdge is sourced from engine state. It is updated via the drag-end intent
  // response for immediate visual feedback, and also by the POSITIONING.STATE_CHANGED
  // broadcast that arrives shortly after.
  const snapEdgeRef = ref<'left' | 'right' | 'top' | 'bottom' | null>(null)

  // DEV-only: ?snap=left|right|top|bottom forces snapEdge — useful for visual tests.
  if (import.meta.env.DEV) {
    const snapOverride = new URLSearchParams(location.search).get('snap')
    if (snapOverride) setTimeout(() => { snapEdgeRef.value = snapOverride as typeof snapEdgeRef.value }, 50)
  }

  /**
   * Whether a valid drag occurred since mousedown (delta > DRAG_THRESHOLD).
   * ControlBar uses this on @click: a drag should not expand the bar; a click should.
   */
  const wasDraggedRef = ref(false)
  /** Pointer is held down (true between mousedown and mouseup). */
  const isPointerDraggingRef = ref(false)
  /** Whether any real motion (>=1px) has occurred. Separate from wasDraggedRef (4px) so visuals can switch sooner. */
  const hasDragMotionRef = ref(false)
  /** Side-snap (left/right) animation is in progress. Used to defer the half-circle visual until the ball actually reaches the edge. */
  const isSnapAnimatingToSideRef = ref(false)

  // Clear stale snapEdge when toggle goes OFF.
  const stopWatchAutoSnap = watch(enableDragAutoSnap, (on) => {
    if (!on) snapEdgeRef.value = null
  })

  /** True between mousedown and mouseup+DRAG_END_DELAY. */
  let isDragging = false

  /** mousedown handler to attach to the floating ball. */
  function onMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return

    isDragging = true
    wasDraggedRef.value = false
    isPointerDraggingRef.value = true
    hasDragMotionRef.value = false
    isSnapAnimatingToSideRef.value = false
    debug('mousedown — isDragging=true')

    // Do NOT clear snapEdgeRef during the drag — clearing it would trigger a
    // layout swap in the control bar the moment the threshold is crossed,
    // causing a visible jump between the drag point and the cursor.

    const startClientX = event.clientX
    const startClientY = event.clientY
    const startScreenX = event.screenX
    const startScreenY = event.screenY
    debug('startClient:', { x: startClientX, y: startClientY },
                'startScreen:', { x: startScreenX, y: startScreenY })

    // Capture the authoritative initial ball screen position from the engine.
    // The drag-start intent response includes the current state with ballScreenPos.
    let startBallX = startScreenX // fallback until drag-start resolves
    let startBallY = startScreenY // fallback until drag-start resolves
    let latestScreenX = startScreenX
    let latestScreenY = startScreenY
    let dragRafId: number | null = null

    void window.openPenApi?.sendPositioningIntent?.({ type: 'drag-start' }).then?.((output: unknown) => {
      const state = (output as { state?: { ballScreenPos?: { x: number; y: number } } })?.state
      if (typeof state?.ballScreenPos?.x === 'number') {
        startBallX = state.ballScreenPos.x
        startBallY = state.ballScreenPos.y
        if (
          isDragging &&
          (latestScreenX !== startScreenX || latestScreenY !== startScreenY) &&
          dragRafId === null
        ) {
          dragRafId = requestAnimationFrame(moveTick)
        }
      }
    })

    function moveTick(): void {
      const ballX = Math.round(startBallX + (latestScreenX - startScreenX))
      const ballY = Math.round(startBallY + (latestScreenY - startScreenY))
      void window.openPenApi?.sendPositioningIntent?.({
        type: 'drag-move',
        ballScreenPos: { x: ballX, y: ballY },
      })
      dragRafId = null
    }

    function onMouseMove(e: MouseEvent): void {
      latestScreenX = e.screenX
      latestScreenY = e.screenY

      if (
        !hasDragMotionRef.value && (
          Math.abs(e.clientX - startClientX) >= 1 || Math.abs(e.clientY - startClientY) >= 1 ||
          Math.abs(e.screenX - startScreenX) >= 1 || Math.abs(e.screenY - startScreenY) >= 1
        )
      ) {
        hasDragMotionRef.value = true
      }

      // Only flag as a drag once the threshold is crossed (jitter rejection).
      if (!wasDraggedRef.value && (
        Math.abs(e.clientX - startClientX) > DRAG_THRESHOLD ||
        Math.abs(e.clientY - startClientY) > DRAG_THRESHOLD
      )) {
        wasDraggedRef.value = true
        debug('drag threshold exceeded, wasDraggedRef=true')
      }

      // RAF throttle — at most one window-position update per frame.
      if (dragRafId === null) dragRafId = requestAnimationFrame(moveTick)
    }

    function onMouseUp(e: MouseEvent): void {
      isPointerDraggingRef.value = false
      hasDragMotionRef.value = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp, true)
      if (dragRafId !== null) { cancelAnimationFrame(dragRafId); dragRafId = null }
      debug('mouseup — clientX:', e.clientX, 'clientY:', e.clientY,
                  '— scheduling', DRAG_END_DELAY, 'ms timer')

      // Capture the screen delta at mouseup before the timer fires.
      const mouseupScreenX = e.screenX
      const mouseupScreenY = e.screenY

      // Defer by DRAG_END_DELAY ms so the final drag-move IPC is processed by
      // main before the drag-end intent arrives, and @click has already fired
      // for click-only interactions so expand still works.
      setTimeout(async () => {
        isDragging = false
        debug('timer fired — isDragging=false')

        // Drag is detected via screen delta (window no longer moves during drag).
        const screenDragDetected =
          Math.abs(mouseupScreenX - startScreenX) > DRAG_THRESHOLD ||
          Math.abs(mouseupScreenY - startScreenY) > DRAG_THRESHOLD

        const clientDragDetected =
          Math.abs(e.clientX - startClientX) > DRAG_THRESHOLD ||
          Math.abs(e.clientY - startClientY) > DRAG_THRESHOLD

        debug('detection —',
          'screenDrag:', screenDragDetected,
          '(delta dx:', mouseupScreenX - startScreenX, 'dy:', mouseupScreenY - startScreenY, ')',
          '| clientDrag:', clientDragDetected,
        )

        if (!screenDragDetected && !clientDragDetected) {
          debug('→ click detected, no snap')
          return
        }

        // Ball screen position at drag-end = initial ball pos + mouse screen delta.
        const ballCenterX = startBallX + (mouseupScreenX - startScreenX)
        const ballCenterY = startBallY + (mouseupScreenY - startScreenY)
        debug('→ ball center at drag-end:', { x: ballCenterX, y: ballCenterY })

        const displays = await window.openPenApi?.getDisplayInfo() ?? []
        debug('displays count:', displays.length)
        if (displays.length === 0) return

        // Compute ball viewport position (workArea-relative) so barBoundsFromEl
        // can express bar extent as distances from ball center rather than window edges.
        const activeDisplay = findDisplay(ballCenterX, ballCenterY, displays as Parameters<typeof findDisplay>[2])
        const ballViewportX = ballCenterX - (activeDisplay?.workArea?.x ?? 0)
        const ballViewportY = ballCenterY - (activeDisplay?.workArea?.y ?? 0)

        // Measure bar bounds if expanded so engine can clamp the full bar extent.
        const barBoundsNow = barEl.value ? barBoundsFromEl(barEl.value, ballViewportX, ballViewportY) : null

        if (!enableDragAutoSnap.value) {
          snapEdgeRef.value = null
          void window.openPenApi?.sendPositioningIntent?.({
            type: 'drag-end',
            ballScreenPos: { x: ballCenterX, y: ballCenterY },
            hadMotion: true,
            enableDragAutoSnap: false,
            barBounds: barBoundsNow,
            barLayoutClass: barLayoutClass.value,
          })
          return
        }

        // Send drag-end intent and read the resulting snapEdge from the engine response.
        // This ensures snapEdge is updated as soon as the engine processes the intent
        // (before the POSITIONING.STATE_CHANGED broadcast arrives).
        type DragEndOutput = { state?: { snapEdge?: string | null } } | null
        const output = await window.openPenApi?.sendPositioningIntent?.({
          type: 'drag-end',
          ballScreenPos: { x: ballCenterX, y: ballCenterY },
          hadMotion: true,
          enableDragAutoSnap: enableDragAutoSnap.value,
          barBounds: barBoundsNow,
          barLayoutClass: barLayoutClass.value,
        }) as DragEndOutput

        const edge = output?.state?.snapEdge as ('left' | 'right' | 'top' | 'bottom' | null | undefined)
        debug('→ snap to edge:', edge)

        if (edge) {
          snapEdgeRef.value = edge
          const isSideEdge = edge === 'left' || edge === 'right'
          isSnapAnimatingToSideRef.value = isSideEdge
          if (isSideEdge) {
            // Clear animation flag after snap animation completes.
            setTimeout(() => { isSnapAnimatingToSideRef.value = false }, 300)
          }
        }
      }, DRAG_END_DELAY)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp, true)
  }

  function cleanup(): void {
    isPointerDraggingRef.value = false
    hasDragMotionRef.value = false
    isSnapAnimatingToSideRef.value = false
    stopWatchAutoSnap()
  }

  return {
    snapEdge: readonly(snapEdgeRef),
    wasDragged: readonly(wasDraggedRef),
    isPointerDragging: readonly(isPointerDraggingRef),
    hasDragMotion: readonly(hasDragMotionRef),
    isSnapAnimatingToSide: readonly(isSnapAnimatingToSideRef),
    onMouseDown,
    cleanup,
  }
}
