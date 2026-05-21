<script setup lang="ts">
/**
 * AppButton — control-bar button wrapper (Layer 1).
 *
 * Provides the standard 36×36 rounded button appearance that matches the
 * host's control-bar buttons, so plugins do not need to replicate the
 * visual design manually.
 *
 * Disabled state uses aria-disabled + a CSS class rather than the HTML
 * `disabled` attribute, because `disabled` removes pointer events and would
 * swallow the tooltip hover that this component is expected to keep alive.
 *
 * In a vertical control bar the button shrinks to 34×34 and the tooltip
 * points away from the snapped edge (snap-left → right side; snap-right →
 * left side; vbar-free → right side). In a horizontal bar the tooltip sits
 * above the button by default, but flips below when the bar is near the
 * workArea top edge (the host raises TOOLTIP_FLIP_DOWN_KEY in that case).
 *
 * All orientation signals come from the host via injection
 * (IS_VERTICAL_KEY / SNAP_EDGE_KEY / TOOLTIP_FLIP_DOWN_KEY) so plugin
 * buttons render identically to the host's own control-bar buttons.
 */

import { computed, inject } from 'vue'
import { SNAP_EDGE_KEY, IS_VERTICAL_KEY, TOOLTIP_FLIP_DOWN_KEY } from '../../inject-keys'

// ── Public API ────────────────────────────────────────────────────────────────

const props = withDefaults(defineProps<{
  variant?: 'default' | 'danger'
  active?: boolean
  disabled?: boolean
  tooltip?: string
  ariaLabel?: string
}>(), {
  variant: 'default',
  active: false,
  disabled: false,
  tooltip: undefined,
  ariaLabel: undefined,
})

const emit = defineEmits<{
  click: []
}>()

function handleClick() {
  if (!props.disabled) {
    emit('click')
  }
}

// ── Orientation context (host-injected) ───────────────────────────────────────

const isVertical = inject(IS_VERTICAL_KEY, undefined)
const snapEdge = inject(SNAP_EDGE_KEY, undefined)
const tooltipFlipDown = inject(TOOLTIP_FLIP_DOWN_KEY, undefined)

const tooltipSide = computed<'top' | 'top-flip' | 'right' | 'left'>(() => {
  if (isVertical?.value) {
    return snapEdge?.value === 'right' ? 'left' : 'right'
  }
  return tooltipFlipDown?.value ? 'top-flip' : 'top'
})
</script>

<template>
  <button
    class="app-btn"
    :class="[
      `app-btn--tooltip-${tooltipSide}`,
      {
        'app-btn--vertical': isVertical,
        active,
        danger: variant === 'danger',
        'app-btn-disabled': disabled,
      },
    ]"
    :data-tip="tooltip"
    :aria-label="ariaLabel"
    :aria-disabled="disabled || undefined"
    @click="handleClick"
  >
    <slot />
  </button>
</template>

<style scoped>
.app-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: var(--openpen-radius-md);
  background: transparent;
  color: var(--openpen-color-text-dim);
  cursor: pointer;
  transition: background var(--openpen-duration-fast), color var(--openpen-duration-fast), transform var(--openpen-duration-fast);
  position: relative;
  flex-shrink: 0;
  padding: 0;
}

/* Vertical bars shrink the button to 34×34 to match the host's
   `.control-bar.is-vertical .cb-btn` rule. */
.app-btn.app-btn--vertical {
  width: 34px;
  height: 34px;
}

.app-btn:hover {
  background: var(--openpen-color-control-hover);
  color: var(--openpen-color-text-primary);
}

.app-btn:active {
  transform: scale(0.88);
}

.app-btn.active {
  background: var(--openpen-color-accent-bg);
  color: var(--openpen-color-accent);
  box-shadow: 0 0 0 1px var(--openpen-color-accent-glow);
}

.app-btn.danger {
  color: var(--openpen-color-danger);
}

.app-btn.danger:hover {
  background: var(--openpen-color-danger-hover-bg);
  color: var(--openpen-color-danger-hover);
}

/* Disabled: keeps pointer events alive so the tooltip ::after hover still fires. */
.app-btn.app-btn-disabled {
  cursor: not-allowed;
}

/* Dim only the button content — tooltip pseudo-element stays at full opacity. */
.app-btn.app-btn-disabled > * {
  opacity: 0.30;
}

/* Tooltip — horizontal mode default (above the button). */
.app-btn[data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--openpen-color-tooltip-bg);
  border: 1px solid var(--openpen-color-tooltip-border);
  color: var(--openpen-color-tooltip-text);
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
  padding: 5px 10px;
  border-radius: var(--openpen-radius-sm);
  pointer-events: none;
  opacity: 0;
  transition: opacity var(--openpen-duration-fast);
  box-shadow: var(--openpen-shadow-sm);
  z-index: 41;
}

/* Horizontal mode near workArea top: tooltip flips below the button so
   it does not extend off-screen. The host sets TOOLTIP_FLIP_DOWN_KEY when
   the ball is within ~60 px of the top edge. */
.app-btn.app-btn--tooltip-top-flip[data-tip]::after {
  bottom: auto;
  top: calc(100% + 8px);
}

/* Vertical bar, snap-left or vbar-free: tooltip points right (inward). */
.app-btn.app-btn--tooltip-right[data-tip]::after {
  top: 50%;
  bottom: auto;
  left: calc(100% + 8px);
  right: auto;
  transform: translateY(-50%);
}

/* Vertical bar, snap-right: tooltip points left (inward). */
.app-btn.app-btn--tooltip-left[data-tip]::after {
  top: 50%;
  bottom: auto;
  left: auto;
  right: calc(100% + 8px);
  transform: translateY(-50%);
}

.app-btn[data-tip]:hover::after {
  opacity: 1;
}
</style>
