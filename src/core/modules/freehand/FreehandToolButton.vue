<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { emit as eventBusEmit, on as eventBusOn } from '@openpen/module-api/host'

const { t } = useI18n()

const activeToolId = ref<string | null>(null)
const isActive = computed(() => activeToolId.value === 'freehand')

const unsub = eventBusOn('tool-changed', (payload) => {
  const p = payload as { tool?: string }
  activeToolId.value = p?.tool ?? null
})
onUnmounted(() => unsub())

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
