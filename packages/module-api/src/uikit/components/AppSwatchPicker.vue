<script setup lang="ts">
/**
 * AppSwatchPicker — High-level wrapper (Layer 1).
 *
 * Wraps Reka UI RadioGroup (RadioGroupRoot / RadioGroupItem). Modelled on the
 * Fluent UI v9 SwatchPicker (row layout): the group is a `radiogroup`, every
 * swatch is a `radio` with `aria-checked`, the whole group is one tab stop and
 * all four arrow keys move to the previous / next swatch and select it, in
 * reading order (so swatches that wrap onto a new line are reached the same way).
 *
 * Visual: round swatches; the selected swatch gets an inset double ring (outer
 * ring in the primary text colour, inner band in the popup surface colour) so the
 * selection stays visible on any swatch colour, light or dark. Keyboard focus
 * is a separate outline outside the swatch.
 *
 * The colour list is supplied by the caller; the component never ships a
 * palette of its own.
 *
 * Styles use --openpen-* design tokens.
 * No Reka UI types are leaked in the public API.
 */
import { RadioGroupRoot, RadioGroupItem } from '../primitives'

// ── Public API (MUST NOT reference reka-ui types) ─────────────────────────────

export interface SwatchColor {
  /** CSS colour value, e.g. `#818CF8`. Compared case-insensitively with `modelValue`. */
  value: string
  /** Accessible name announced for the swatch (for example `Indigo`). */
  label: string
  /** Optional `data-testid` for the swatch button. */
  testid?: string
}

const props = withDefaults(defineProps<{
  /** Currently selected colour value (use `v-model`). */
  modelValue: string
  colors: SwatchColor[]
  /** Accessible name of the whole group. */
  ariaLabel: string
  shape?: 'circular' | 'rounded' | 'square'
  size?: 'small' | 'medium' | 'large'
  /** Gap between swatches: `small` 6px, `medium` 8px. */
  spacing?: 'small' | 'medium'
  /** Swatch background override, for example a gradient. Defaults to the colour value. */
  background?: (color: SwatchColor) => string
  disabled?: boolean
  testid?: string
}>(), {
  shape: 'circular',
  size: 'medium',
  spacing: 'medium',
  background: undefined,
  disabled: false,
  testid: 'app-swatch-picker',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const isSelected = (value: string) => value.toLowerCase() === props.modelValue.toLowerCase()

// The radio group needs the exact stored value, so map the (case-insensitive)
// match back to the caller's own spelling of the selected colour.
const selectedValue = (): string =>
  props.colors.find((c) => isSelected(c.value))?.value ?? ''

// AcceptableValue from Reka UI can be null; we narrow to string so the public API has no Reka UI type leakage.
function onValueChange(val: unknown) {
  if (typeof val === 'string') emit('update:modelValue', val)
}
</script>

<template>
  <RadioGroupRoot
    class="app-swatch-picker"
    :class="[`app-swatch-picker--${shape}`, `app-swatch-picker--${size}`, `app-swatch-picker--spacing-${spacing}`]"
    :data-testid="testid"
    :model-value="selectedValue()"
    :aria-label="ariaLabel"
    :disabled="disabled"
    @update:model-value="onValueChange"
  >
    <RadioGroupItem
      v-for="c in colors"
      :key="c.value"
      :value="c.value"
      as-child
    >
      <button
        type="button"
        class="app-swatch"
        :class="{ selected: isSelected(c.value) }"
        :style="{ background: background ? background(c) : c.value }"
        :aria-label="c.label"
        :title="c.label"
        :data-testid="c.testid"
      />
    </RadioGroupItem>
  </RadioGroupRoot>
</template>

<style scoped>
.app-swatch-picker {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--openpen-space-sm);
  --app-swatch-size: 24px;
}

.app-swatch-picker--spacing-small { gap: 6px; }

.app-swatch-picker--small { --app-swatch-size: 22px; }
.app-swatch-picker--medium { --app-swatch-size: 24px; }
.app-swatch-picker--large { --app-swatch-size: 28px; }

.app-swatch {
  width: var(--app-swatch-size);
  height: var(--app-swatch-size);
  padding: 0;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  flex-shrink: 0;
  /* Hairline so near-white / near-surface swatches keep an edge. */
  box-shadow: inset 0 0 0 1px var(--openpen-color-border-hi);
  outline: none;
  transition: transform var(--openpen-duration-fast) var(--openpen-easing-standard);
}

.app-swatch-picker--rounded .app-swatch { border-radius: var(--openpen-radius-sm); }
.app-swatch-picker--square .app-swatch { border-radius: 2px; }

.app-swatch:hover { transform: scale(1.1); }

/* Selected: outer ring (primary text colour) + inner band (focus-band colour). */
.app-swatch.selected {
  box-shadow:
    inset 0 0 0 2px var(--openpen-color-text-primary),
    inset 0 0 0 4px var(--openpen-color-surface-popup);
}

/* Keyboard focus: separate outline outside the swatch. */
.app-swatch:focus-visible {
  outline: 2px solid var(--openpen-color-accent);
  outline-offset: 2px;
}

.app-swatch-picker[data-disabled] {
  opacity: 0.45;
  pointer-events: none;
}
</style>
