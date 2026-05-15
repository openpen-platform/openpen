<script setup lang="ts">
/*
 * ColorButton (module) — color control item for ui.control-bar.
 *
 * Renders the color swatch button + popup (ColorPicker) for both
 * horizontal and vertical control-bar layouts.
 *
 * Popup lifecycle (mutual exclusion, outside-click, animating guard,
 * passthrough) is delegated to AppPopover from @openpen/module-api/uikit.
 */
import { computed, inject, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  STROKE_STYLE_CONTEXT_KEY,
  SNAP_EDGE_KEY,
  MODAL_MANAGER_KEY,
  useModuleContext,
} from '@openpen/module-api'
import type { StrokeColor } from '@openpen/module-api'
import { AppPopover } from '@openpen/module-api/uikit'
import ColorPicker from './ColorPicker.vue'

const { t } = useI18n()

const strokeStyleCtx = inject(STROKE_STYLE_CONTEXT_KEY)
const snapEdge = inject(SNAP_EDGE_KEY)
const modalManager = inject(MODAL_MANAGER_KEY)

const color = computed(() => strokeStyleCtx?.color.value ?? '#818cf8')

const colorBtnStyle = computed((): { background: string } => {
  const c = color.value
  const bg = typeof c === 'object' && c !== null
    ? `linear-gradient(135deg, ${c.from}, ${c.to})`
    : c as string
  return { background: bg }
})

function onColorChange(newColor: StrokeColor) {
  strokeStyleCtx?.setColor(newColor)
}

let unsubSettings: (() => void) | null = null

onMounted(() => {
  // Module context registration completes after the host's onMounted resolves,
  // which fires after all child components mount. Defer to the next macrotask
  // so the context is guaranteed to be available.
  setTimeout(() => {
    try {
      const ctx = useModuleContext('@openpen/color')
      const s = ctx.getSettings<{ defaultColor?: string }>()
      if (s.defaultColor) strokeStyleCtx?.setColor(s.defaultColor)
      unsubSettings = ctx.onSettingsChange<{ defaultColor?: string }>((next) => {
        if (next.defaultColor) strokeStyleCtx?.setColor(next.defaultColor)
      })
    } catch {
      // Module not loaded in this window type (e.g. overlay-only context).
    }
  }, 0)
})

onUnmounted(() => { unsubSettings?.() })

// Close popup when snap edge changes (stale anchor positions).
watch(() => snapEdge?.value, () => { modalManager?.close('color') })
</script>

<template>
  <AppPopover popover-id="color" placement="auto">
    <template #trigger="{ active }">
      <button
        class="cb-btn cb-color-btn"
        data-testid="controlbar-color-btn"
        :data-tip="t('openpen.color.button')"
        :aria-label="t('openpen.color.button')"
        :class="{ active }"
      >
        <span class="cb-color-swatch" :style="colorBtnStyle" />
      </button>
    </template>
    <template #content>
      <ColorPicker
        :model-value="color"
        @update:model-value="onColorChange"
      />
    </template>
  </AppPopover>
</template>

<style scoped>
.cb-color-btn {
  -webkit-app-region: no-drag;
}

/* .cb-color-swatch is defined globally in src/styles/control-bar-items.css */
</style>
