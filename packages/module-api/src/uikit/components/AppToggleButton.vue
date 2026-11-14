<script setup lang="ts">
/**
 * AppToggleButton — High-level wrapper (Layer 1).
 *
 * Wraps Reka UI Toggle. Modelled on the Fluent UI v9 ToggleButton: a
 * standalone button that exposes its two states through `aria-pressed`. Each
 * button is its own tab stop; Space / Enter flips it.
 *
 * Visual: 32px-high button. Unpressed = input background, dim text, soft
 * border. Pressed = accent tint, primary text, stronger border, so the two
 * states differ by fill, border and text colour (not by hue alone).
 *
 * Styles use --openpen-* design tokens.
 * No Reka UI types are leaked in the public API.
 */
import { Toggle } from '../primitives'

// ── Public API (MUST NOT reference reka-ui types) ─────────────────────────────

withDefaults(defineProps<{
  /** Pressed state (use `v-model`). */
  modelValue: boolean
  /** Accessible name. Required because the content is often a single glyph or icon. */
  ariaLabel: string
  disabled?: boolean
  testid?: string
}>(), { disabled: false, testid: undefined })

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function onPressedChange(val: unknown) {
  if (typeof val === 'boolean') emit('update:modelValue', val)
}
</script>

<template>
  <Toggle
    class="app-toggle-btn"
    :class="{ pressed: modelValue }"
    :model-value="modelValue"
    :aria-label="ariaLabel"
    :disabled="disabled"
    :data-testid="testid"
    @update:model-value="onPressedChange"
  >
    <slot />
  </Toggle>
</template>

<style scoped>
.app-toggle-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 var(--openpen-space-sm);
  border: 1px solid var(--openpen-color-border-hi);
  border-radius: var(--openpen-radius-sm);
  background: var(--openpen-color-input-bg);
  color: var(--openpen-color-text-dim);
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background var(--openpen-duration-fast) var(--openpen-easing-standard),
    color var(--openpen-duration-fast) var(--openpen-easing-standard),
    border-color var(--openpen-duration-fast) var(--openpen-easing-standard);
}

.app-toggle-btn:hover {
  background: var(--openpen-color-control-hover);
  color: var(--openpen-color-text-primary);
}

.app-toggle-btn.pressed {
  background: var(--openpen-color-accent-bg);
  border-color: var(--openpen-color-text-dim);
  color: var(--openpen-color-text-primary);
}

.app-toggle-btn:focus-visible {
  outline: 2px solid var(--openpen-color-accent);
  outline-offset: 2px;
}

.app-toggle-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
</style>
