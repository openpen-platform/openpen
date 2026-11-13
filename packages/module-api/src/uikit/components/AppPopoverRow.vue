<script setup lang="ts">
/**
 * AppPopoverRow - High-level wrapper (Layer 1).
 *
 * One form row inside an AppPopoverPanel: an optional label followed by a
 * control (toggle, slider, segmented control, ...) in the default slot.
 * Spacing matches the host's own popup rows (10px gap, vertically centred).
 */
defineProps<{
  /** Optional label rendered before the control. */
  label?: string
}>()
</script>

<template>
  <div class="openpen-popover-row" data-testid="app-popover-row">
    <span v-if="label" class="openpen-popover-row-label">{{ label }}</span>
    <slot />
  </div>
</template>

<style scoped>
.openpen-popover-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.openpen-popover-row-label {
  font-size: 13px;
  color: var(--openpen-color-text-dim);
  white-space: nowrap;
}

/* A segmented control placed in a row takes the remaining width. */
.openpen-popover-row :deep(.app-seg) {
  flex: 1;
}
</style>
