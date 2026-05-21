<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { emit as eventBusEmit, on as eventBusOn } from '@openpen/module-api/host'
import { AppButton } from '@openpen/module-api/uikit'

const { t } = useI18n()

const activeToolId = ref<string | null>(null)
const isActive = computed(() => activeToolId.value === 'line')

const unsub = eventBusOn('tool-changed', (payload) => {
  const p = payload as { tool?: string }
  activeToolId.value = p?.tool ?? null
})
onUnmounted(() => unsub())

function activate() {
  eventBusEmit('tool-changed', { tool: 'line' })
  window.openPenApi?.setActiveTool({ tool: 'line' })
}
</script>

<template>
  <AppButton
    :active="isActive"
    :tooltip="t('openpen.line.tool')"
    :aria-label="t('openpen.line.tool')"
    data-testid="controlbar-line-btn"
    @click="activate"
  >
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <line x1="5" y1="19" x2="19" y2="5"/>
      <circle cx="5" cy="19" r="2" fill="currentColor" stroke="none"/>
      <circle cx="19" cy="5" r="2" fill="currentColor" stroke="none"/>
    </svg>
  </AppButton>
</template>
