<script setup lang="ts">
/**
 * AppToggle — High-level wrapper (Layer 1).
 *
 * Wraps Reka UI Switch (SwitchRoot / SwitchThumb).
 *
 * Visual: 40×24px, off=toggle-off-bg, on=accent,
 * 18×18 white thumb, bounce transition.
 *
 * Styles use --openpen-* design tokens.
 * No Reka UI types are leaked in the public API.
 *
 * DOM notes:
 * - SwitchRoot renders a <button role="switch"> with class "app-toggle"
 * - "on" class is added when modelValue is true
 * - aria-pressed is added explicitly because Reka UI's SwitchRoot uses
 *   aria-checked; both attributes co-exist for maximum a11y surface.
 */
import {
  SwitchRoot,
  SwitchThumb,
} from '../primitives'

// ── Public API (MUST NOT reference reka-ui types) ─────────────────────────────

withDefaults(defineProps<{
  modelValue: boolean
  ariaLabel?: string
}>(), { ariaLabel: '' })

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

function onCheckedChange(val: boolean) {
  emit('update:modelValue', val)
}
</script>

<template>
  <SwitchRoot
    class="app-toggle"
    :class="{ on: modelValue }"
    :model-value="modelValue"
    :aria-label="ariaLabel"
    :aria-pressed="modelValue"
    @update:model-value="onCheckedChange"
  >
    <SwitchThumb class="app-toggle-thumb" />
  </SwitchRoot>
</template>

<style scoped>
/* Root — the toggle track */
.app-toggle {
  width: 40px;
  height: 24px;
  border-radius: 12px;
  border: none;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  background: var(--openpen-color-toggle-off);
  transition: background var(--openpen-duration-base) var(--openpen-easing-standard);
  /* Remove default button styles */
  padding: 0;
  appearance: none;
  -webkit-appearance: none;
  display: inline-flex;
  align-items: center;
}

.app-toggle.on {
  background: var(--openpen-color-accent);
}

/* Thumb — the white circular knob */
.app-toggle-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  transition: left var(--openpen-duration-bounce) var(--openpen-easing-bounce);
  display: block;
  pointer-events: none;
}

.app-toggle.on .app-toggle-thumb,
.app-toggle[data-state='checked'] .app-toggle-thumb {
  left: 19px;
}
</style>
