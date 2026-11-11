<script setup lang="ts">
import { computed, inject, onUnmounted, readonly, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { emit as eventBusEmit, on as eventBusOn } from '@openpen/module-api/host'
import { ACTIVE_TOOL_KEY } from '@openpen/module-api'
import { AppButton } from '@openpen/module-api/uikit'
import { HIGHLIGHTER_TOOL_ID } from './highlighter-tool'

const { t } = useI18n()

// Initial active state comes from the ControlBar's injected ref (the event bus
// is fire-and-forget, so a bar that expands after a tool switch would miss it).
const injectedActiveTool = inject(ACTIVE_TOOL_KEY, readonly(ref('freehand')))
const localActiveTool = ref<string>(injectedActiveTool.value)

const unsub = eventBusOn('tool-changed', (payload) => {
  const p = payload as { tool?: string }
  if (p?.tool) localActiveTool.value = p.tool
})
onUnmounted(() => unsub())

const isActive = computed(() => localActiveTool.value === HIGHLIGHTER_TOOL_ID)

function activate() {
  eventBusEmit('tool-changed', { tool: HIGHLIGHTER_TOOL_ID })
  window.openPenApi?.setActiveTool({ tool: HIGHLIGHTER_TOOL_ID })
}
</script>

<template>
  <AppButton
    :active="isActive"
    :tooltip="t('openpen.highlighter.tool')"
    :aria-label="t('openpen.highlighter.tool')"
    data-testid="controlbar-highlighter-btn"
    @click="activate"
  >
    <!-- Icon: "highlighter" from Lucide (https://lucide.dev), ISC License, paths unmodified. -->
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="m9 11-6 6v3h9l3-3" />
      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </svg>
  </AppButton>
</template>
