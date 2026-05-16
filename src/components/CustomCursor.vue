<script setup lang="ts">
import { useCustomCursor } from '../composables/useCustomCursor'

const { cursorRef, visible, current } = useCustomCursor()
</script>

<template>
  <div
    v-if="visible && current"
    ref="cursorRef"
    class="openpen-custom-cursor"
    aria-hidden="true"
    v-html="current.svgMarkup"
  />
</template>

<style scoped>
.openpen-custom-cursor {
  position: fixed;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 2147483646;
  will-change: transform;
  /* `paint` would clip animation particles that travel beyond the 24×24
     SVG box — keep layout + style containment only. */
  contain: layout style;
}
</style>
