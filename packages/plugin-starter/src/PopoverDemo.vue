<script setup lang="ts">
import { AppPopover, AppSlider } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const size = ref(16)
</script>

<template>
  <!-- AppPopover wraps the trigger button + AppSlider into a control-bar button
       that opens a popup with a slider. No inject keys or headless library
       knowledge required — the wrapper handles everything automatically. -->
  <AppPopover popover-id="starter-size" placement="auto">
    <template #trigger="{ active }">
      <button class="hello-btn" :class="{ active }" :title="`Size: ${size}px`">
        Aa
      </button>
    </template>
    <template #content>
      <div class="demo-panel">
        <span class="demo-label">Size: {{ size }}px</span>
        <AppSlider v-model="size" :min="8" :max="64" width="120px" />
      </div>
    </template>
  </AppPopover>
</template>

<style scoped>
.hello-btn {
  background: none;
  border: 1px solid transparent;
  color: var(--openpen-color-text-primary);
  cursor: pointer;
  padding: 6px 8px;
  border-radius: var(--openpen-radius-sm);
  font-size: 13px;
  font-weight: 600;
}

.hello-btn:hover,
.hello-btn.active {
  background: var(--openpen-color-control-hover);
}

.demo-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 140px;
}

.demo-label {
  font-size: 12px;
  color: var(--openpen-color-text-dim);
}
</style>
