<script setup lang="ts">
/**
 * AppPopoverPanel - High-level wrapper (Layer 1).
 *
 * Inner layout for the `content` slot of AppPopover: a vertical stack with the
 * same 10px spacing the host's own popup panels use, plus an optional title.
 * Rows share three columns (label, control, value) so controls start at the
 * same x in every row without any plugin-side CSS.
 * The frame (background, border, radius, padding, shadow) comes from AppPopover.
 *
 * Styles use --openpen-* design tokens only.
 */
defineProps<{
  /** Optional small-caps heading rendered above the panel content. */
  title?: string
}>()
</script>

<template>
  <div class="openpen-popover-panel" data-testid="app-popover-panel">
    <div v-if="title" class="openpen-popover-title" data-testid="app-popover-panel-title">
      {{ title }}
    </div>
    <slot />
  </div>
</template>

<style scoped>
.openpen-popover-panel {
  /*
   * Three shared columns for every row in the panel (rows use `subgrid`):
   * label (as wide as the widest label), control (takes the rest), value
   * (optional; zero width when no row has one). The 10px between columns is
   * put on the label and value cells instead of a column gap so an unused
   * value column leaves no empty space at the right edge.
   */
  display: grid;
  grid-template-columns: auto minmax(140px, 1fr) auto;
  align-items: center;
  row-gap: 10px;
  column-gap: 0;
}

.openpen-popover-title {
  grid-column: 1 / -1;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--openpen-color-text-muted);
  margin-bottom: 6px;
}
</style>
