<script setup lang="ts">
/**
 * HtmlOverlayLayer — DOM-based overlay above the canvas.
 *
 * Renders every contribution to `canvas.html.overlay`. Used for
 * elements that can't (or shouldn't) be drawn into the canvas:
 * editable text annotations, image stickers, dragged-out HTML
 * widgets like a radial QuickMenu. Lives inside the overlay window
 * directly above the canvas in z-order.
 *
 * Visibility is the contribution's own concern; this layer only
 * provides the mount point and the click region.
 */
import { useSlot } from '../core/runtime/slot-runtime'
import type { HtmlOverlayContribution } from '@openpen/module-api'

const overlays = useSlot<HtmlOverlayContribution>('canvas.html.overlay')
</script>

<template>
  <div class="html-overlay-layer openpen-interactive">
    <component v-for="o in overlays" :key="o.id" :is="o.component" />
  </div>
</template>

<style scoped>
.html-overlay-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}

.html-overlay-layer > :deep(*) {
  pointer-events: auto;
}
</style>
