<script setup lang="ts">
/**
 * AppPopoverRow - High-level wrapper (Layer 1).
 *
 * One form row inside an AppPopoverPanel: an optional label followed by a
 * control (toggle, slider, segmented control, ...) in the default slot, and an
 * optional third element (value text such as "150px") that is right-aligned in
 * the panel's shared value column.
 * Spacing matches the host's own popup rows (10px gap, vertically centred).
 */
defineProps<{
  /** Optional label rendered before the control. */
  label?: string
}>()
</script>

<template>
  <div
    class="openpen-popover-row"
    :class="{ 'openpen-popover-row--bare': !label }"
    data-testid="app-popover-row"
  >
    <span v-if="label" class="openpen-popover-row-label">{{ label }}</span>
    <slot />
  </div>
</template>

<style scoped>
.openpen-popover-row {
  /* Join the panel's label / control / value columns so every row lines up. */
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: center;
}

/* A row without a label (buttons, a segmented control) spans all columns. */
.openpen-popover-row--bare {
  display: flex;
  gap: 10px;
}

/*
 * Third child = optional value text: right-aligned, equal digit width, never
 * narrower than 5ch so the control does not move while a number gains a digit.
 * (Slider values belong in the AppSlider bubble, not here.)
 */
.openpen-popover-row > :deep(*:nth-child(3)) {
  justify-self: end;
  min-width: 5ch;
  margin-left: 10px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.openpen-popover-row-label {
  margin-right: 10px;
  font-size: 13px;
  color: var(--openpen-color-text-dim);
  white-space: nowrap;
}

/* A segmented control placed in a row takes the remaining width. */
.openpen-popover-row :deep(.app-seg) {
  flex: 1;
}
</style>
