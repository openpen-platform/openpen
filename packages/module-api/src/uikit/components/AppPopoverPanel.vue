<script setup lang="ts">
/**
 * AppPopoverPanel - High-level wrapper (Layer 1).
 *
 * Inner layout for the `content` slot of AppPopover: a vertical stack with the
 * same 10px spacing the host's own popup panels use, plus an optional title.
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
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.openpen-popover-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--openpen-color-text-muted);
  margin-bottom: 6px;
}
</style>
