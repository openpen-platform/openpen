<script setup lang="ts">
import { computed, ref, onUnmounted } from 'vue'

const activeToolId = ref<string | null>(null)
const isActive = computed(() => activeToolId.value === 'highlighter')

// Plugins use a CustomEvent on window to talk to the host event bus
// without importing host internals — same pattern modules use through
// `@openpen/module-api` events. The host re-emits these onto the bus.
function dispatchToolChange(tool: string) {
  window.dispatchEvent(new CustomEvent('tool-changed', { detail: { tool } }))
}

window.addEventListener('tool-changed', (e: Event) => {
  const ev = e as CustomEvent<{ tool?: string }>
  activeToolId.value = ev.detail?.tool ?? null
})

onUnmounted(() => {
  // No-op cleanup: window listener stays for app lifetime; the modal
  // would set its own ref the same way.
})

function activate() {
  dispatchToolChange('highlighter')
}
</script>

<template>
  <button class="hl-btn" :class="{ active: isActive }" title="Highlighter" @click="activate">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 11l3 3 8-8-3-3z" />
      <path d="M9 11l-3 9 9-3" />
    </svg>
  </button>
</template>

<style scoped>
.hl-btn {
  background: none;
  border: 1px solid transparent;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.hl-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: white;
}
.hl-btn.active {
  background: rgba(255, 235, 59, 0.2);
  color: #ffeb3b;
  border-color: rgba(255, 235, 59, 0.5);
}
</style>
