<script setup lang="ts">
/**
 * AppSegmented — High-level wrapper (Layer 1).
 *
 * Wraps Reka UI RadioGroup (RadioGroupRoot / RadioGroupItem).
 *
 * A segmented control: one grey track holds the options with no dividers;
 * the selected segment is raised (surface fill, thin border, soft shadow) so
 * the selection reads by shape, not only by colour.
 * Hover is a visible step on the track, and keyboard focus draws a 2px frame
 * around the whole group. Options may carry a preview icon and a tooltip; an
 * `iconOnly` option shows just the icon (its name is the aria-label + tooltip).
 *
 * Only existing --openpen-* tokens are used; no new colours.
 * No Reka UI types are leaked in the public API.
 */
import {
  RadioGroupRoot,
  RadioGroupItem,
} from '../primitives'
import AppTooltip from './AppTooltip.vue'

// ── Public API (MUST NOT reference reka-ui types) ─────────────────────────────

interface Option {
  value: string
  label: string
  icon?: string
  /** Show only the icon; `label` becomes the accessible name and the tooltip. */
  iconOnly?: boolean
  /** Tooltip text; defaults to `label` for icon-only options. */
  tooltip?: string
  testid?: string
}

defineProps<{
  modelValue: string
  options: Option[]
  disabled?: boolean
  /** Accessible name of the whole group (e.g. "Head style"). */
  ariaLabel?: string
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

const tipOf = (o: Option): string | undefined => o.tooltip ?? (o.iconOnly ? o.label : undefined)
</script>

<template>
  <RadioGroupRoot
    class="app-seg"
    data-testid="app-seg"
    :class="{ 'app-seg--disabled': disabled }"
    :model-value="modelValue"
    :disabled="disabled"
    :aria-label="ariaLabel"
    orientation="horizontal"
    @update:model-value="onValueChange"
  >
    <template v-for="opt in options" :key="opt.value">
      <AppTooltip v-if="tipOf(opt)" :content="tipOf(opt)!">
        <RadioGroupItem :value="opt.value" as-child>
          <button
            class="app-seg-btn"
            :class="{ active: modelValue === opt.value, 'app-seg-btn--icon': opt.iconOnly }"
            :aria-label="opt.iconOnly ? opt.label : undefined"
            :data-testid="opt.testid"
          >
            <span v-if="opt.icon" class="app-seg-icon" aria-hidden="true" v-html="opt.icon" />
            <span v-if="!opt.iconOnly">{{ opt.label }}</span>
          </button>
        </RadioGroupItem>
      </AppTooltip>
      <RadioGroupItem v-else :value="opt.value" as-child>
        <button
          class="app-seg-btn"
          :class="{ active: modelValue === opt.value }"
          :data-testid="opt.testid"
        >
          <span v-if="opt.icon" class="app-seg-icon" aria-hidden="true" v-html="opt.icon" />
          <span>{{ opt.label }}</span>
        </button>
      </RadioGroupItem>
    </template>
  </RadioGroupRoot>
</template>

<style scoped>
.app-seg {
  display: flex;
  gap: 0;
  padding: 2px;
  border-radius: var(--openpen-radius-sm);
  background: var(--openpen-color-input-bg);
  border: 1px solid var(--openpen-color-border);
}

/* One focus frame around the whole group (2px, 2px away). */
.app-seg:focus-within {
  /* !important: Reka's roving-focus group writes an inline `outline: none` on this element. */
  outline: 2px solid var(--openpen-color-accent) !important;
  outline-offset: 2px;
}

.app-seg-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 5px var(--openpen-space-md);
  border: 1px solid transparent;
  border-radius: calc(var(--openpen-radius-sm) - 2px);
  background: transparent;
  color: var(--openpen-color-text-dim);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  outline: none;
  transition:
    background var(--openpen-duration-fast) var(--openpen-easing-standard),
    color var(--openpen-duration-fast) var(--openpen-easing-standard),
    box-shadow var(--openpen-duration-fast) var(--openpen-easing-standard);
}

.app-seg-btn--icon {
  padding: 5px var(--openpen-space-sm);
}

.app-seg-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

/* Hover: a step on top of the track that is still visible (track is input-bg). */
.app-seg-btn:hover {
  color: var(--openpen-color-text-primary);
  background: var(--openpen-color-control-hover);
}

/* Selected: raised segment — surface fill + thin border + soft shadow. */
.app-seg-btn.active {
  background: var(--openpen-color-surface-popup);
  color: var(--openpen-color-accent);
  border-color: var(--openpen-color-border-hi);
  box-shadow: var(--openpen-shadow-sm);
}

.app-seg--disabled {
  opacity: 0.45;
  pointer-events: none;
  cursor: not-allowed;
}
</style>
