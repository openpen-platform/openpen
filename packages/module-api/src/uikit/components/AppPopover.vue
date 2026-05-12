<script setup lang="ts">
/**
 * AppPopover — High-level wrapper (Layer 1).
 *
 * Plugin authors use this component without needing to know about inject
 * keys, Reka UI, modal manager mutual exclusion, or the animating guard.
 *
 * Public API is stable: switching the underlying headless library in the
 * future does not break the plugin author's code.
 *
 * Implementation notes:
 * - placement 'auto' picks the initial Reka UI side based on snap edge:
 *   vbar-left → 'right', vbar-right → 'left', horizontal → 'bottom'.
 *   Reka UI's built-in flip middleware then handles viewport-edge collision.
 * - usePassthroughGuard: called with the content element ref. The contentEl
 *   ref is passed to usePassthroughGuard, which attaches mousemove/leave
 *   handlers that toggle mouse passthrough based on pointer position.
 */
import { computed, inject, onMounted, ref, useTemplateRef, watch } from 'vue'
import {
  PopoverRoot,
  PopoverTrigger,
  PopoverPortal,
  PopoverContent,
  PopoverArrow,
} from '../primitives'
// Inject keys MUST come from the package barrel — the runtime build
// externalises '@openpen/module-api' so host + uikit share the same Symbol
// instances. Importing from the relative '../../inject-keys' path bundles a
// duplicate Symbol into module-api-uikit.js, causing host's provide() and
// uikit's inject() to miss each other (popover never opens, etc).
import {
  WRAPPER_EL_KEY,
  MODAL_MANAGER_KEY,
  CONTROL_BAR_ANIMATING_KEY,
  POPOVER_PLACEMENT_HINT_KEY,
} from '@openpen/module-api'
import { usePassthroughGuard } from '../../host/passthrough'

// ── OpenPen-owned type (MUST NOT reference reka-ui types) ─────────────────────

/** Preferred placement for the popover content relative to the trigger. */
export type Placement = 'auto' | 'top' | 'bottom' | 'left' | 'right'

export interface AppPopoverProps {
  /** Globally unique popover id; used for modal-stack mutual exclusion. */
  popoverId: string
  /**
   * Popover placement direction.
   * - 'auto' (default, recommended): the host's snap-edge hint picks the side that
   *   keeps the popover on-screen across all control-bar modes.
   * - explicit values ('top' | 'bottom' | 'left' | 'right'): bypass the auto hint.
   *   In dev mode a console warning is emitted because explicit values can position
   *   popovers off-screen or away from the trigger button when the control bar is
   *   in a vertical mode. Only use when you have verified the placement stays
   *   on-screen across all snap layouts.
   */
  placement?: Placement
  /** Gap between trigger and content in px. Default 8. */
  gap?: number
}

export interface AppPopoverSlots {
  /** Trigger slot; scope exposes active state + toggle / open / close actions. */
  trigger: (scope: {
    active: boolean
    toggle: () => void
    open: () => void
    close: () => void
  }) => unknown
  /** Popover content slot. */
  content: () => unknown
}

const props = withDefaults(defineProps<AppPopoverProps>(), {
  placement: 'auto',
  gap: 8,
})

defineSlots<AppPopoverSlots>()

// ── 0. Dev-mode guard: warn plugin authors about risky explicit placement ─────
onMounted(() => {
  if (!import.meta.env.DEV) return
  if (props.placement !== 'auto' && props.placement !== undefined) {
    console.warn(
      `[AppPopover] Explicit placement="${props.placement}" bypasses ` +
      `the host's snap-edge auto detection. In vertical control-bar modes ` +
      `this can position popups off-screen or away from the trigger button. ` +
      `Prefer placement="auto" (default) and let the host pick the side; ` +
      `use an explicit value only when you have verified it stays on-screen ` +
      `across snap-left / snap-right / snap-free / horizontal layouts.`
    )
  }
})

// ── 1. Inject host context (plugin author never sees these) ───────────────────

const wrapperElRef = inject(WRAPPER_EL_KEY)
const wrapperEl = computed<HTMLElement | null>(() => wrapperElRef?.value ?? null)
const modalManager = inject(MODAL_MANAGER_KEY)
const animating = inject(CONTROL_BAR_ANIMATING_KEY)
const popoverPlacementHint = inject(POPOVER_PLACEMENT_HINT_KEY)

// ── 2. Modal manager mutual exclusion ────────────────────────────────────────

const isOpen = computed(() => modalManager?.isOpen(props.popoverId) ?? false)

function open() {
  modalManager?.open(props.popoverId)
}

function close() {
  modalManager?.close(props.popoverId)
}

function toggle() {
  if (isOpen.value) {
    close()
  } else {
    open()
  }
}

// Sync Reka UI's controlled open state back to modal manager.
// Reka UI may close via Escape / outside-click; we must keep manager in sync.
function onUpdateOpen(v: boolean) {
  if (v) {
    open()
  } else {
    close()
  }
}

// ── 3. ControlBar animation guard — auto-close during transitions ────────────

watch(
  () => animating?.value,
  (isAnimating) => {
    if (isAnimating && isOpen.value) {
      close()
    }
  }
)

// ── 4. placement → Reka UI side mapping ──────────────────────────────────────
//
// 'auto' uses the POPOVER_PLACEMENT_HINT_KEY provided by ControlBar. The hint
// encodes a two-tier UX rule:
//   - Snap edge set → open away from the edge (left→right, right→left, etc.)
//   - Snap off → open toward the side with more screen space on the relevant axis
//     (horizontal bar: top/bottom; vertical bar: left/right)
// Reka UI's built-in flip middleware handles secondary overflow. The window is
// workArea-sized, so the viewport equals the workArea and floating-ui's collision
// detection is correct without any boundary-proxy workaround.

type RekaSide = 'top' | 'bottom' | 'left' | 'right'

const rekaSide = computed<RekaSide>(() => {
  if (props.placement !== 'auto') return props.placement as RekaSide
  // Fall back to 'bottom' only if no hint is provided (e.g. standalone use outside ControlBar).
  return popoverPlacementHint?.value ?? 'bottom'
})

// ── 5. Passthrough guard integration ─────────────────────────────────────────
//
// usePassthroughGuard is called with the content element ref. Reka UI's
// PopoverContent is a Vue component, so the template ref resolves to a
// component instance (with `$el`) rather than a raw HTMLElement. We normalize
// via a watcher so the guard receives a plain element ref.
// openpen-interactive class enables the ControlBar passthrough guard's CSS selector path.
const contentInstance = useTemplateRef<HTMLElement | { $el?: HTMLElement } | null>('content')
const contentEl = ref<HTMLElement | null>(null)
watch(contentInstance, (instance) => {
  if (!instance) {
    contentEl.value = null
  } else if (instance instanceof HTMLElement) {
    contentEl.value = instance
  } else if (typeof instance === 'object' && '$el' in instance && instance.$el instanceof HTMLElement) {
    contentEl.value = instance.$el
  } else {
    contentEl.value = null
  }
})
usePassthroughGuard(contentEl)
</script>

<template>
  <PopoverRoot :open="isOpen" @update:open="onUpdateOpen">
    <PopoverTrigger as-child>
      <slot
        name="trigger"
        :active="isOpen"
        :toggle="toggle"
        :open="open"
        :close="close"
      />
    </PopoverTrigger>
    <PopoverPortal :to="wrapperEl ?? undefined">
      <PopoverContent
        ref="content"
        :side="rekaSide"
        :avoid-collisions="true"
        :side-offset="props.gap"
        class="openpen-popover-content openpen-interactive"
      >
        <slot name="content" />
        <!-- Arrow geometry: 14×8 sharp triangle. Fill shares
             --openpen-color-popover-frame with the popup border so the arrow
             reads as a continuous extension of the frame. See tokens.css for
             per-theme values. -->
        <PopoverArrow class="openpen-popover-arrow" :width="14" :height="8" />
      </PopoverContent>
    </PopoverPortal>
  </PopoverRoot>
</template>

<!-- Styles for teleported PopoverContent MUST be unscoped — Vue scoped CSS
     does not follow Teleport targets, so .openpen-popover-content would not
     receive the scoped data-v-* attribute when rendered inside the portal. -->
<style>
.openpen-popover-content {
  background: var(--openpen-color-surface-popup);
  border: 1px solid var(--openpen-color-popover-frame);
  border-radius: var(--openpen-radius-lg);
  padding: 14px 16px;
  color: var(--openpen-color-text-primary);
  font-size: 13px;
  box-shadow: var(--openpen-shadow);
  backdrop-filter: var(--openpen-blur);
  -webkit-backdrop-filter: var(--openpen-blur);
  z-index: 100;
  /* Prevent pointer events from leaking through transparent gaps. */
  pointer-events: auto;
}

.openpen-popover-arrow {
  fill: var(--openpen-color-popover-frame);
}

/* ── Open / close animations ────────────────────────────────────────────────
   Reka UI's Presence keeps the element in the DOM until the running CSS
   animation ends, so animations targeting [data-state="closed"] DO play
   on close. transform-origin tracks data-side so the popover scales out
   from the trigger instead of from its own center.

   Timings: 200ms easeOutBack enter, 150ms ease leave. */
.openpen-popover-content[data-state='open'] {
  animation: openpen-popover-in 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.openpen-popover-content[data-state='closed'] {
  animation: openpen-popover-out 150ms ease forwards;
}

.openpen-popover-content[data-side='bottom'] { transform-origin: top center; }
.openpen-popover-content[data-side='top']    { transform-origin: bottom center; }
.openpen-popover-content[data-side='left']   { transform-origin: right center; }
.openpen-popover-content[data-side='right']  { transform-origin: left center; }

@keyframes openpen-popover-in {
  from { opacity: 0; transform: scale(0.92); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes openpen-popover-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.92); }
}
</style>
