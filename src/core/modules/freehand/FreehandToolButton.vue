<script setup lang="ts">
import { computed, inject, onUnmounted, readonly, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { emit as eventBusEmit, on as eventBusOn } from '@openpen/module-api/host'
import { ACTIVE_TOOL_KEY } from '@openpen/module-api'

const { t } = useI18n()

// Inject ControlBar's active-tool ref for the initial active state on mount
// (avoids the event-bus fire-and-forget timing race on bar expansion).
// Falls back to 'freehand' when mounted outside a ControlBar (not the normal path).
const injectedActiveTool = inject(ACTIVE_TOOL_KEY, readonly(ref('freehand')))

// Local ref that tracks tool switches via event bus (handles the case where the
// bar is already expanded and the user switches tools).
const localActiveTool = ref<string>(injectedActiveTool.value)

// Keep local ref in sync with event-bus tool switches.
const unsub = eventBusOn('tool-changed', (payload) => {
  const p = payload as { tool?: string }
  if (p?.tool) localActiveTool.value = p.tool
})
onUnmounted(() => unsub())

const isActive = computed(() => localActiveTool.value === 'freehand')

function activate() {
  eventBusEmit('tool-changed', { tool: 'freehand' })
  window.openPenApi?.setActiveTool({ tool: 'freehand' })
}
</script>

<template>
  <button
    class="cb-btn"
    :class="{ active: isActive }"
    :data-tip="t('openpen.freehand.tool')"
    :aria-label="t('openpen.freehand.tool')"
    @click="activate"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M3 17c3-3 6-6 9-3s6 0 9-3"/>
    </svg>
  </button>
</template>
