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
 */

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
</script>

<template>
  <button
    class="app-btn"
    :class="{
      active,
      danger: variant === 'danger',
      'app-btn-disabled': disabled,
    }"
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

/* Tooltip */
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

.app-btn[data-tip]:hover::after {
  opacity: 1;
}
</style>
