<script setup lang="ts">
/**
 * AppSelect — High-level wrapper (Layer 1).
 *
 * Plugin authors use this component without needing to know about Reka UI's
 * Select primitives. The API surface is OpenPen-owned and stable.
 *
 * Public API is stable: switching the underlying headless library in the
 * future does not break the plugin author's code.
 *
 * Implementation notes:
 * - Controlled via modelValue / update:modelValue (standard Vue v-model pattern).
 * - options[] is an OpenPen-owned type; no Reka UI types leak to the public API.
 * - Popup styling mirrors surface-popup tokens (same as AppPopover content).
 * - Styles are unscoped because SelectContent is teleported via SelectPortal.
 */
import {
  SelectRoot,
  SelectTrigger,
  SelectPortal,
  SelectContent,
  SelectViewport,
  SelectItem,
  SelectItemText,
  SelectItemIndicator,
  SelectValue,
  SelectIcon,
} from '../primitives'

// ── OpenPen-owned types (MUST NOT reference reka-ui types) ───────────────────

/** A single option in the dropdown list. */
export interface SelectOption {
  /** The value emitted on selection. */
  value: string
  /** The label shown to the user. */
  label: string
}

export interface AppSelectProps {
  /** Currently selected value (bind with v-model). */
  modelValue: string
  /** List of selectable options. */
  options: SelectOption[]
  /** Placeholder shown when no option is selected. */
  placeholder: string
  /** Whether the select is disabled. */
  disabled?: boolean
}

const props = withDefaults(defineProps<AppSelectProps>(), {
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function onValueChange(v: string) {
  emit('update:modelValue', v)
}
</script>

<template>
  <SelectRoot
    :model-value="modelValue"
    :disabled="disabled"
    @update:model-value="onValueChange"
  >
    <SelectTrigger class="openpen-select-trigger">
      <SelectValue :placeholder="placeholder" />
      <SelectIcon class="openpen-select-icon" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 4L6 8L10 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </SelectIcon>
    </SelectTrigger>
    <SelectPortal>
      <SelectContent class="openpen-select-content" position="popper" :side-offset="4">
        <SelectViewport class="openpen-select-viewport">
          <SelectItem
            v-for="option in options"
            :key="option.value"
            :value="option.value"
            class="openpen-select-item"
          >
            <SelectItemIndicator class="openpen-select-item-indicator">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                <path d="M2 6L5 9L10 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </SelectItemIndicator>
            <SelectItemText>{{ option.label }}</SelectItemText>
          </SelectItem>
        </SelectViewport>
      </SelectContent>
    </SelectPortal>
  </SelectRoot>
</template>

<!-- Styles MUST be unscoped — Vue scoped CSS does not follow Teleport targets,
     so .openpen-select-* classes would not receive the scoped data-v-* attribute
     when rendered inside the portal. -->
<style>
/* ── Trigger ─────────────────────────────────────────────────────────────── */
.openpen-select-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--openpen-space-sm);
  min-width: 120px;
  height: 32px;
  padding: 0 var(--openpen-space-md);
  background: var(--openpen-color-input-bg);
  border: 1px solid var(--openpen-color-border-hi);
  border-radius: var(--openpen-radius-md);
  color: var(--openpen-color-text-primary);
  font-size: 13px;
  cursor: pointer;
  transition:
    background var(--openpen-duration-fast),
    border-color var(--openpen-duration-fast);
  outline: none;
  white-space: nowrap;
  user-select: none;
}

.openpen-select-trigger:hover {
  background: var(--openpen-color-control-hover);
  border-color: var(--openpen-color-border-hi);
}

.openpen-select-trigger:focus-visible {
  border-color: var(--openpen-color-accent);
  box-shadow: 0 0 0 2px var(--openpen-color-accent-glow);
}

.openpen-select-trigger[data-disabled] {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── Trigger icon (chevron) ──────────────────────────────────────────────── */
.openpen-select-icon {
  color: var(--openpen-color-text-dim);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  transition: transform var(--openpen-duration-fast);
}

.openpen-select-trigger[data-state='open'] .openpen-select-icon {
  transform: rotate(180deg);
}

/* ── Dropdown content ────────────────────────────────────────────────────── */
.openpen-select-content {
  background: var(--openpen-color-surface-popup);
  border: 1px solid var(--openpen-color-border-hi);
  border-radius: var(--openpen-radius-md);
  box-shadow: var(--openpen-shadow);
  backdrop-filter: var(--openpen-blur);
  -webkit-backdrop-filter: var(--openpen-blur);
  z-index: 100;
  pointer-events: auto;
  /* Match trigger width */
  min-width: var(--reka-select-trigger-width, 120px);
  max-height: 240px;
  overflow: hidden;
}

/* ── Viewport scrollable area ────────────────────────────────────────────── */
.openpen-select-viewport {
  padding: var(--openpen-space-xs);
}

/* ── Individual items ────────────────────────────────────────────────────── */
.openpen-select-item {
  display: flex;
  align-items: center;
  gap: var(--openpen-space-sm);
  height: 30px;
  padding: 0 var(--openpen-space-md);
  padding-left: 28px; /* indent to align text past indicator */
  border-radius: var(--openpen-radius-sm);
  font-size: 13px;
  color: var(--openpen-color-text-primary);
  cursor: pointer;
  position: relative;
  user-select: none;
  outline: none;
  transition: background var(--openpen-duration-fast);
}

.openpen-select-item[data-highlighted] {
  background: var(--openpen-color-control-hover);
  color: var(--openpen-color-text-primary);
}

.openpen-select-item[data-state='checked'] {
  color: var(--openpen-color-accent);
}

.openpen-select-item[data-disabled] {
  opacity: 0.45;
  cursor: not-allowed;
}

/* ── Selected item indicator (checkmark) ─────────────────────────────────── */
.openpen-select-item-indicator {
  position: absolute;
  left: var(--openpen-space-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--openpen-color-accent);
}

/* ── Open / close animations ─────────────────────────────────────────────────
   Pattern matches AppPopover keyframes (200ms bounce enter, 150ms ease leave). */
.openpen-select-content[data-state='open'] {
  animation: openpen-select-in 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.openpen-select-content[data-state='closed'] {
  animation: openpen-select-out 150ms ease forwards;
}

@keyframes openpen-select-in {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes openpen-select-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.95); }
}
</style>
