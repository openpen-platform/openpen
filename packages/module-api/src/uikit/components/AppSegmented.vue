<script setup lang="ts">
/**
 * AppSegmented — High-level wrapper (Layer 1).
 *
 * Wraps Reka UI RadioGroup (RadioGroupRoot / RadioGroupItem).
 *
 * Visual: flex gap 4px, 1.5px border var(--border-hi),
 * active = var(--accent-bg) background + var(--accent) color.
 *
 * Styles use --openpen-* design tokens.
 * No Reka UI types are leaked in the public API.
 */
import {
  RadioGroupRoot,
  RadioGroupItem,
} from '../primitives'

// ── Public API (MUST NOT reference reka-ui types) ─────────────────────────────

interface Option {
  value: string
  label: string
  icon?: string
}

defineProps<{
  modelValue: string
  options: Option[]
  /** When true, all options are non-interactive and visually dimmed. */
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// AcceptableValue from Reka UI can be null; we narrow to string so the public API has no Reka UI type leakage.
function onValueChange(val: unknown) {
  if (typeof val === 'string') {
    emit('update:modelValue', val)
  }
}
</script>

<template>
  <RadioGroupRoot
    class="app-seg"
    :class="{ 'app-seg--disabled': disabled }"
    :model-value="modelValue"
    :disabled="disabled"
    orientation="horizontal"
    @update:model-value="onValueChange"
  >
    <RadioGroupItem
      v-for="opt in options"
      :key="opt.value"
      :value="opt.value"
      as-child
    >
      <button
        class="app-seg-btn"
        :class="{ active: modelValue === opt.value }"
      >
        <span
          v-if="opt.icon"
          class="app-seg-icon"
          aria-hidden="true"
          v-html="opt.icon"
        />
        <span>{{ opt.label }}</span>
      </button>
    </RadioGroupItem>
  </RadioGroupRoot>
</template>

<style scoped>
.app-seg {
  display: flex;
  gap: var(--openpen-space-xs);
}

.app-seg-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px var(--openpen-space-lg);
  border: 1.5px solid var(--openpen-color-border-hi);
  border-radius: var(--openpen-radius-sm);
  background: var(--openpen-color-input-bg);
  color: var(--openpen-color-text-dim);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--openpen-duration-fast) var(--openpen-easing-standard),
    color var(--openpen-duration-fast) var(--openpen-easing-standard),
    border-color var(--openpen-duration-fast) var(--openpen-easing-standard);
}

.app-seg-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.app-seg-btn:hover {
  color: var(--openpen-color-text-primary);
  background: var(--openpen-color-control-hover);
}

.app-seg-btn.active {
  background: var(--openpen-color-accent-bg);
  color: var(--openpen-color-accent);
  border-color: color-mix(in srgb, var(--openpen-color-accent) 40%, transparent);
}

.app-seg--disabled {
  opacity: 0.45;
  pointer-events: none;
  cursor: not-allowed;
}
</style>
