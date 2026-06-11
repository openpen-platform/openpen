<script setup lang="ts">
/*
 * EraserToolButton (module) — eraser tool button + caret + mode popup.
 *
 * Renders an `AppButtonDropdown`:
 *   - main button: activates the brush eraser tool
 *   - caret button: opens / closes the eraser mode popup
 *
 * Popup contains two options:
 *   - Brush Erase: activates the 'eraser' tool (destination-out)
 *   - Stroke Erase: activates the 'stroke-eraser' tool (delete whole stroke)
 *
 * Popup lifecycle (mutual exclusion, outside-click, animating guard,
 * passthrough) is delegated to AppPopover via AppButtonDropdown.
 */
import { computed, inject, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  SNAP_EDGE_KEY,
  MODAL_MANAGER_KEY,
} from '@openpen/module-api'
import { AppButtonDropdown } from '@openpen/module-api/uikit'
import { emit as eventBusEmit, on as eventBusOn } from '@openpen/module-api/host'

const { t } = useI18n()

const snapEdge = inject(SNAP_EDGE_KEY)
const modalManager = inject(MODAL_MANAGER_KEY)

// Track which tool is active to show active state and selected mode.
const activeToolId = ref<string | null>(null)
const isActive = computed(() =>
  activeToolId.value === 'eraser' || activeToolId.value === 'stroke-eraser'
)

// Remembers the last selected eraser mode so switching to another tool and
// back restores the user's chosen mode instead of defaulting to brush erase.
const lastEraserMode = ref<'eraser' | 'stroke-eraser'>('eraser')

const unsub = eventBusOn('tool-changed', (payload) => {
  const p = payload as { tool?: string }
  activeToolId.value = p?.tool ?? null
  if (p?.tool === 'eraser' || p?.tool === 'stroke-eraser') {
    lastEraserMode.value = p.tool
  }
})
onUnmounted(() => unsub())

// Close popup on snap edge change (stale anchor positions).
watch(() => snapEdge?.value, () => { modalManager?.close('eraser-mode') })

function activateBrushErase() {
  eventBusEmit('tool-changed', { tool: 'eraser' })
  window.openPenApi?.setActiveTool({ tool: 'eraser' })
  modalManager?.close('eraser-mode')
}

// Activate whichever eraser mode was last selected (survives tool switches).
function activateCurrentMode() {
  eventBusEmit('tool-changed', { tool: lastEraserMode.value })
  window.openPenApi?.setActiveTool({ tool: lastEraserMode.value })
}

function activateStrokeErase() {
  eventBusEmit('tool-changed', { tool: 'stroke-eraser' })
  window.openPenApi?.setActiveTool({ tool: 'stroke-eraser' })
  modalManager?.close('eraser-mode')
}

/**
 * Activate brush eraser when the caret is clicked (if not already in eraser
 * family). AppButtonDropdown's internal popover handles open/close; this
 * handler only fires the side-effect.
 */
function activateIfNeeded() {
  if (!isActive.value) {
    eventBusEmit('tool-changed', { tool: lastEraserMode.value })
    window.openPenApi?.setActiveTool({ tool: lastEraserMode.value })
  }
}
</script>

<template>
  <AppButtonDropdown
    popover-id="eraser-mode"
    popover-placement="auto"
    :active="isActive"
    :main-tooltip="t('openpen.eraser.tool')"
    :main-aria-label="t('openpen.eraser.toolAria')"
    :caret-aria-label="t('openpen.eraser.modeMenu')"
    main-testid="controlbar-eraser-btn"
    caret-testid="controlbar-eraser-caret"
    @main-click="activateCurrentMode"
    @caret-click="activateIfNeeded"
  >
    <template #main-content>
      <!-- Stroke erase icon — shown when stroke-eraser is the remembered mode -->
      <svg v-if="lastEraserMode === 'stroke-eraser'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="3"/>
        <path d="M3 12h3M18 12h3M12 3v3M12 18v3"/>
      </svg>
      <!-- Brush erase icon — default -->
      <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/>
        <path d="M22 21H7"/>
        <path d="m5 11 9 9"/>
      </svg>
    </template>
    <template #popover-content>
      <div class="eraser-mode-panel">
        <!-- Brush Erase option -->
        <button
          class="cb-menu-item"
          data-testid="eraser-mode-brush"
          :class="{ active: activeToolId === 'eraser' }"
          @click="activateBrushErase"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21"/>
            <path d="M22 21H7"/>
            <path d="m5 11 9 9"/>
          </svg>
          <div class="cb-menu-item-content">
            <span>{{ t('openpen.eraser.modeBrush') }}</span>
            <span class="cb-menu-item-sub">{{ t('openpen.eraser.modeBrushSub') }}</span>
          </div>
        </button>
        <!-- Stroke Erase option -->
        <button
          class="cb-menu-item"
          data-testid="eraser-mode-stroke"
          :class="{ active: activeToolId === 'stroke-eraser' }"
          @click="activateStrokeErase"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M3 12h3M18 12h3M12 3v3M12 18v3"/>
          </svg>
          <div class="cb-menu-item-content">
            <span>{{ t('openpen.eraser.modeStroke') }}</span>
            <span class="cb-menu-item-sub">{{ t('openpen.eraser.modeStrokeSub') }}</span>
          </div>
        </button>
      </div>
    </template>
  </AppButtonDropdown>
</template>
