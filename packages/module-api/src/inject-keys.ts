/**
 * Vue InjectionKey symbols that host code provides and module components inject.
 *
 * Module components MUST NOT import host composables directly (boundary rule).
 * Instead, the host provides these contexts via Vue's provide/inject, and
 * modules reference the keys via this file (part of the public SDK surface).
 */
import type { InjectionKey, Ref } from 'vue'
import type { StrokeColor } from './types/tool'

// ── Stroke Style ─────────────────────────────────────────────────────────────

/**
 * Provides read + write access to the global stroke style state.
 * Provided by App.vue (root); available in all renderer windows.
 *
 * Module components: inject via `inject(STROKE_STYLE_CONTEXT_KEY)`.
 */
export interface StrokeStyleContext {
  lineWidth: Readonly<Ref<number>>
  color: Readonly<Ref<StrokeColor>>
  setLineWidth: (w: number) => void
  setColor: (c: StrokeColor) => void
}

export const STROKE_STYLE_CONTEXT_KEY: InjectionKey<StrokeStyleContext> =
  Symbol('openpen.strokeStyleContext')

// ── Snap Edge ────────────────────────────────────────────────────────────────

/**
 * Which side of the screen workArea the floating ball is anchored to.
 *
 * - 'left'   → ball anchored on the left edge  (vbar-left layout)
 * - 'right'  → ball anchored on the right edge (vbar-right layout)
 * - 'top'    → ball anchored on the top edge   (horizontal bar, top)
 * - 'bottom' → ball anchored on the bottom edge (horizontal bar, bottom)
 * - null     → not snapped (free-floating or horizontal default)
 *
 * Consumers that need a ready-to-use popup direction (the opposite of the
 * snap edge) should inject POPOVER_PLACEMENT_HINT_KEY instead — it encodes
 * the two-tier UX rule (snap edge → midline fallback) so individual components
 * do not have to replicate the logic.
 *
 * Use IS_VERTICAL_KEY for orientation checks (vbar vs horizontal); this key
 * is null in vbar-free mode where no edge is snapped.
 */
export type SnapEdge = 'left' | 'right' | 'top' | 'bottom' | null

export const SNAP_EDGE_KEY: InjectionKey<Readonly<Ref<SnapEdge>>> =
  Symbol('openpen.snapEdge')

// ── Vertical Layout ──────────────────────────────────────────────────────────

/**
 * True for any vertical layout (vbar-left / vbar-right / vbar-free). Use
 * this for orientation; SNAP_EDGE_KEY is edge-specific and null in vbar-free.
 */
export const IS_VERTICAL_KEY: InjectionKey<Readonly<Ref<boolean>>> =
  Symbol('openpen.isVertical')

// ── Modal Manager ─────────────────────────────────────────────────────────────

/**
 * Programmatic open / close for modals registered via `ui.modals` slot.
 * Provided by ModalStack.vue.
 *
 * Module control-bar buttons call `open(id)` to show their modal.
 * Modal components call `isOpen(id)` to control their own visibility.
 */
export interface ModalManager {
  /** Open the modal with the given id. Closes any currently-open modal first. */
  open: (id: string) => void
  /** Close the modal with the given id. No-op if it is not open. */
  close: (id: string) => void
  /** Returns true if the modal with the given id is currently open. */
  isOpen: (id: string) => boolean
}

export const MODAL_MANAGER_KEY: InjectionKey<ModalManager> =
  Symbol('openpen.modalManager')

// ── Control Bar Layout Context ───────────────────────────────────────────────

/**
 * Reference to the `.control-bar-wrapper` element. Provided by ControlBar.vue.
 * Module components that open anchor-relative popups teleport into this element.
 */
export const WRAPPER_EL_KEY: InjectionKey<Readonly<Ref<HTMLElement | null>>> =
  Symbol('openpen.wrapperEl')

/**
 * Reference to the `.control-bar` element. Provided by ControlBar.vue.
 * Module components use this as the anchor for popup positioning.
 */
export const ANCHOR_EL_KEY: InjectionKey<Readonly<Ref<HTMLElement | null>>> =
  Symbol('openpen.anchorEl')

// ── Control Bar Animating ──────────────────────────────────────────────────────

/**
 * Reactive flag that is `true` while the ControlBar is running a scaleY
 * animation (expand 350ms / collapse 250ms / snap 250ms).
 *
 * Provided by ControlBar.vue as `readonly(animating)`.
 * AppPopover (and any other UIKit wrapper) watches this and auto-closes
 * when it becomes true, avoiding floating-ui position drift during animation.
 */
export const CONTROL_BAR_ANIMATING_KEY: InjectionKey<Readonly<Ref<boolean>>> =
  Symbol('openpen:control-bar-animating')

// ── Tooltip Flip Down (near workArea top) ────────────────────────────────────

/**
 * `true` when the control bar's ball is sitting close to the workArea top
 * edge, in horizontal mode. Buttons that render a tooltip above themselves
 * (`bottom: calc(100% + 8px)`) would extend off-screen in that state, so they
 * flip below the button instead.
 *
 * Provided by ControlBar.vue. Consumed by AppButton (and any other UIKit
 * wrapper that renders an `::after` tooltip).
 *
 * `false` in vertical mode regardless of position — vertical bars use a
 * sideways tooltip direction (see `SNAP_EDGE_KEY`).
 */
export const TOOLTIP_FLIP_DOWN_KEY: InjectionKey<Readonly<Ref<boolean>>> =
  Symbol('openpen:tooltipFlipDown')

// ── Host Dialog Presence ─────────────────────────────────────────────────────

/**
 * Reference-counted open-dialog count. Hosts inject this to render their
 * own "locked" state when > 0 — a transparent overlay window can't use a
 * dim/blur dialog backdrop without rendering as an isolated dark patch.
 */
export const HOST_DIALOG_OPEN_COUNT_KEY: InjectionKey<Ref<number>> =
  Symbol('openpen:hostDialogOpenCount')

// ── Popover Placement Hint ────────────────────────────────────────────────────

/**
 * Deliberate UX rule for initial popover placement direction.
 *
 * Encodes which side of the trigger the popover should prefer to open on,
 * based on two rules applied in priority order:
 *   1. Snap edge: opening away from the snapped edge (e.g. snap-left → 'right').
 *   2. Screen midline (when no snap edge): opening toward the side with more space
 *      on the relevant axis (horizontal bar → top/bottom; vertical bar → left/right).
 *
 * The floating-ui flip middleware handles secondary overflow; this hint is the
 * proactive first choice so the popover starts on the correct side without
 * requiring a layout-measurement round-trip.
 *
 * Provided by ControlBar.vue; injected by AppPopover.vue.
 * Plugin authors do not need to consume this key directly.
 */
export type PopoverPlacementHint = 'top' | 'bottom' | 'left' | 'right'

export const POPOVER_PLACEMENT_HINT_KEY: InjectionKey<Readonly<Ref<PopoverPlacementHint>>> =
  Symbol('openpen:popoverPlacementHint')

// ── Active Tool ───────────────────────────────────────────────────────────────

/**
 * The currently active tool id. Provided by ControlBar.vue as `readonly(activeToolId)`.
 * Module tool-button components inject this for reactive active-state without
 * depending on the event-bus timing (event bus is fire-and-forget; this ref is
 * always current regardless of when the component mounts).
 */
export const ACTIVE_TOOL_KEY: InjectionKey<Readonly<Ref<string>>> =
  Symbol('openpen:activeTool')
