<script setup lang="ts">
/**
 * StatusBar — ephemeral indicator container.
 *
 * Renders every contribution to the `ui.status` slot. Modules use
 * this for non-modal, attention-light feedback ("recording…",
 * "syncing…", network-state pips). Each contribution is a Vue
 * component responsible for its own visibility and content.
 *
 * Anchored under the floating ball / control bar so it scans as
 * "ambient app state" rather than "primary chrome".
 */
import { useSlot } from '../core/runtime/slot-runtime'
import type { StatusContribution } from '@openpen/module-api'

const items = useSlot<StatusContribution>('ui.status')
</script>

<template>
  <div v-if="items.length > 0" class="status-bar openpen-interactive">
    <component v-for="item in items" :key="item.id" :is="item.component" />
  </div>
</template>

<style scoped>
.status-bar {
  position: absolute;
  top: 110px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 12px;
  background: rgba(20, 20, 30, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  font-size: 11px;
  color: rgba(255, 255, 255, 0.85);
  pointer-events: auto;
}
</style>
