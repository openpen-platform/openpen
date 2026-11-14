<script setup lang="ts">
import { AppPopover, AppPopoverPanel, AppPopoverRow, AppSlider } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const size = ref(16)
</script>

<template>
  <!-- AppPopover wraps the trigger button + AppSlider into a control-bar button
       that opens a popup with a slider. No inject keys or headless library
       knowledge required — the wrapper handles everything automatically.
       In each AppPopoverRow put the label (prop) and the control; the panel
       lines the columns up, so the slider needs no width and the plugin needs
       no CSS. The slider's number is shown by `value-label` as a bubble above
       the thumb while dragging, not as a static number beside it. -->
  <AppPopover popover-id="starter-size" placement="auto">
    <template #trigger="{ active }">
      <button class="hello-btn" :class="{ active }" :title="`Size: ${size}px`">
        Aa
      </button>
    </template>
    <template #content>
      <AppPopoverPanel title="Size">
        <AppPopoverRow label="Size">
          <AppSlider v-model="size" :min="8" :max="64" :value-label="`${size}px`" ariaLabel="Size" />
        </AppPopoverRow>
      </AppPopoverPanel>
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
</style>
