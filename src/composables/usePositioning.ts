/**
 * usePositioning — renderer-side bridge to the main-process PositioningEngine.
 *
 * Subscribes to POSITIONING.STATE_CHANGED IPC events and exposes readonly refs
 * so components can react to positioning state without computing positions themselves.
 *
 * ballViewportPos is the only viewport-coordinate computation in the codebase:
 *   ballViewportPos = ballScreenPos − activeDisplay.workArea.origin
 *
 * When the engine emits an animation hint, this composable runs a RAF loop that
 * interpolates ballViewportPos from its previous value to the new target, applying
 * updates as CSS variable writes via the ref. The window itself never moves.
 */

import { ref, computed, readonly, onMounted, onUnmounted } from 'vue'

type SnapEdge = 'top' | 'right' | 'bottom' | 'left' | null
type BarLayoutClass = 'horizontal' | 'vbar-left' | 'vbar-right' | 'vbar-free'

interface PositioningState {
  ballScreenPos: { x: number; y: number }
  activeDisplayId: number
  snapEdge: SnapEdge
  barExpanded: boolean
  barLayoutClass: BarLayoutClass
}

interface AnimationHint {
  durationMs: number
  easing: 'easeOutBack' | 'easeOutCubic' | 'linear'
  purpose: 'snap' | 'summon' | 'clamp' | 'expand-precompute'
}

interface ViewportPoint {
  x: number
  y: number
}

// ── Easing functions ──────────────────────────────────────────────────────────

function easeOutBack(t: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

function applyEasing(easing: AnimationHint['easing'], t: number): number {
  if (easing === 'easeOutBack')  return easeOutBack(t)
  if (easing === 'easeOutCubic') return easeOutCubic(t)
  return t // linear
}

// ── Shared module-level state ─────────────────────────────────────────────────

const positioningState = ref<PositioningState | null>(null)
/** All display info cached from the last getDisplayInfo() call. */
const cachedDisplays = ref<DisplayInfo[]>([])

/**
 * Animated ball viewport position (interpolated during transitions).
 * Separate from the raw computed to allow RAF-driven updates between state snapshots.
 */
const animatedBallViewportPos = ref<ViewportPoint | null>(null)

let animRafId: number | null = null
let animFrom: ViewportPoint | null = null
let animTo: ViewportPoint | null = null
let animStartMs = 0
let animDurationMs = 0
let animEasing: AnimationHint['easing'] = 'linear'

function cancelAnimation(): void {
  if (animRafId !== null) {
    cancelAnimationFrame(animRafId)
    animRafId = null
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function animTick(): void {
  if (!animFrom || !animTo) return
  const elapsed = performance.now() - animStartMs
  const t = Math.min(elapsed / animDurationMs, 1)
  const eased = applyEasing(animEasing, t)

  animatedBallViewportPos.value = {
    x: lerp(animFrom.x, animTo.x, eased),
    y: lerp(animFrom.y, animTo.y, eased),
  }

  if (t < 1) {
    animRafId = requestAnimationFrame(animTick)
  } else {
    animRafId = null
    animFrom = null
  }
}

function startAnimation(from: ViewportPoint, to: ViewportPoint, hint: AnimationHint): void {
  cancelAnimation()
  animFrom = from
  animTo = to
  animStartMs = performance.now()
  animDurationMs = hint.durationMs
  animEasing = hint.easing
  animRafId = requestAnimationFrame(animTick)
}

/** Derive viewport position from a screen position and the active display workArea. */
function toViewport(pos: { x: number; y: number }, activeId: number): ViewportPoint {
  const activeDisplay = cachedDisplays.value.find((d) => d.id === activeId)
  if (!activeDisplay) return { x: pos.x, y: pos.y } // fallback: no conversion yet
  return {
    x: pos.x - activeDisplay.workArea.x,
    y: pos.y - activeDisplay.workArea.y,
  }
}

let stateUnsub: (() => void) | null = null
let mountCount = 0

function ensureSubscription(): void {
  if (stateUnsub !== null) return
  stateUnsub = window.openPenApi?.onPositioningStateChanged?.((payload: unknown) => {
    const { state, animation } = payload as { state: PositioningState; animation: AnimationHint | null }
    applyState(state, animation)
  }) ?? null
}

function teardownSubscription(): void {
  stateUnsub?.()
  stateUnsub = null
}

/**
 * Apply a state snapshot to the shared module-level refs. Used both by the
 * broadcast subscription and the initial pull on mount.
 */
function applyState(state: PositioningState, animation: AnimationHint | null): void {
  const prev = positioningState.value
  positioningState.value = state

  const newVP = toViewport(state.ballScreenPos, state.activeDisplayId)

  if (animation && prev) {
    const fromVP = animatedBallViewportPos.value ?? toViewport(prev.ballScreenPos, prev.activeDisplayId)

    // Override easing for left/right edge snaps: easeOutBack overshoots past
    // the target, but the target sits flush against the viewport boundary so
    // any overshoot clips invisibly. easeOutCubic decelerates smoothly into
    // the edge without a clipped bounce.
    const effectiveHint: AnimationHint =
      animation.purpose === 'snap' &&
      (state.snapEdge === 'left' || state.snapEdge === 'right') &&
      animation.easing === 'easeOutBack'
        ? { ...animation, easing: 'easeOutCubic' }
        : animation

    startAnimation(fromVP, newVP, effectiveHint)
    return
  }

  // A non-animated state update aimed at the same target as a running
  // animation (e.g. bar-expand intent re-broadcast mid-snap) must leave the
  // animation alone so it can complete smoothly.
  const sameTargetMidAnimation =
    animRafId !== null &&
    animTo !== null &&
    Math.abs(animTo.x - newVP.x) < 0.5 &&
    Math.abs(animTo.y - newVP.y) < 0.5
  if (sameTargetMidAnimation) return

  cancelAnimation()
  animatedBallViewportPos.value = newVP
}

/**
 * Composable that provides reactive positioning state from the engine.
 * Multiple callers share the same subscription — the subscription is created
 * on first mount and torn down when all consumers unmount.
 */
export function usePositioning() {
  onMounted(async () => {
    mountCount++
    ensureSubscription()

    // Fetch display info and the current engine state in parallel.
    // getPositioningState() is a pull-based fallback: the push-broadcast
    // (STATE_CHANGED) fires during engine intents and may arrive before
    // the renderer's subscription is wired. Pulling on mount ensures the
    // renderer always has a valid initial position regardless of timing.
    const [displays, rawState] = await Promise.all([
      window.openPenApi?.getDisplayInfo?.(),
      window.openPenApi?.getPositioningState?.(),
    ])

    if (displays?.length) {
      cachedDisplays.value = displays
    }

    // Only apply the pulled state if no broadcast has arrived yet — a broadcast
    // that arrived first is more recent and should take precedence.
    if (rawState && !positioningState.value) {
      const state = rawState as unknown as PositioningState
      applyState(state, null)
    } else if (positioningState.value && !animatedBallViewportPos.value) {
      // Displays were just loaded; recompute viewport pos from existing state.
      animatedBallViewportPos.value = toViewport(
        positioningState.value.ballScreenPos,
        positioningState.value.activeDisplayId,
      )
    }
  })

  onUnmounted(() => {
    mountCount--
    if (mountCount <= 0) {
      mountCount = 0
      cancelAnimation()
      teardownSubscription()
    }
  })

  /** Ball position in screen coordinates (authoritative, from engine). */
  const ballScreenPos = computed(() => positioningState.value?.ballScreenPos ?? null)

  /**
   * Ball center in viewport coordinates, animated during transitions.
   * This is the only place in the codebase that converts screen→viewport.
   * The animated value interpolates smoothly; the raw screen pos jumps instantly.
   */
  const ballViewportPos = computed<ViewportPoint | null>(() => {
    // Return animated position if available (handles transitions).
    if (animatedBallViewportPos.value) return animatedBallViewportPos.value

    // Fallback: compute from current state when no animation has run yet.
    const pos = positioningState.value?.ballScreenPos
    if (!pos) return null
    const activeId = positioningState.value?.activeDisplayId
    return toViewport(pos, activeId ?? -1)
  })

  const snapEdge = computed(() => positioningState.value?.snapEdge ?? null)
  const barLayoutClass = computed(() => positioningState.value?.barLayoutClass ?? 'horizontal')
  const barExpanded = computed(() => positioningState.value?.barExpanded ?? false)
  const activeDisplayId = computed(() => positioningState.value?.activeDisplayId ?? -1)

  return {
    ballScreenPos: readonly(ballScreenPos),
    ballViewportPos: readonly(ballViewportPos),
    snapEdge: readonly(snapEdge),
    barLayoutClass: readonly(barLayoutClass),
    barExpanded: readonly(barExpanded),
    activeDisplayId: readonly(activeDisplayId),
  }
}
