<script setup lang="ts">
/*
 * ShapeToolButton (module) — shape tool button + caret + sub-panel popup.
 *
 * Renders an `AppButtonDropdown`:
 *   - main button: activates the shape tool
 *   - caret button: opens / closes the ShapePopover popup
 *
 * Popup lifecycle (mutual exclusion, outside-click, animating guard,
 * passthrough) is delegated to AppPopover via AppButtonDropdown.
 */
import { computed, inject, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  SNAP_EDGE_KEY,
  IS_VERTICAL_KEY,
  MODAL_MANAGER_KEY,
  type ShapeContribution,
} from '@openpen/module-api'
import { AppButtonDropdown } from '@openpen/module-api/uikit'
import { emit as eventBusEmit, on as eventBusOn, getSlotEntries } from '@openpen/module-api/host'
import ShapePopover from './ShapePopover.vue'
import { currentShape, filled } from './shape-state'

const { t } = useI18n()

const snapEdge = inject(SNAP_EDGE_KEY)
const isVertical = inject(IS_VERTICAL_KEY)
const modalManager = inject(MODAL_MANAGER_KEY)

// Track whether this tool is active.
const activeToolId = ref<string | null>(null)
const isActive = computed(() => activeToolId.value === 'shape')

const unsub = eventBusOn('tool-changed', (payload) => {
  const p = payload as { tool?: string }
  activeToolId.value = p?.tool ?? null
})
onUnmounted(() => unsub())

// Close popup on snap edge change (stale anchor positions).
watch(() => snapEdge?.value, () => { modalManager?.close('shape') })

// Contribution-driven icon: reflects the currently selected shape.
// Third-party plugin shapes contributed to canvas.shapes appear automatically.
const shapesEntries = getSlotEntries<ShapeContribution>('canvas.shapes')
const currentShapeIcon = computed(() => {
  const found = shapesEntries.value.find((e) => e.contribution.id === currentShape.value)
  return found?.contribution.icon
})

function activateTool() {
  eventBusEmit('tool-changed', { tool: 'shape' })
  // Notify main process so IPC-dependent features (cursor, overlay mode) stay in sync.
  window.openPenApi?.setActiveTool({ tool: 'shape' })
}

/**
 * Activate the shape tool when the caret is clicked (if not already active).
 * AppButtonDropdown's internal popover handles open/close; this handler
 * only fires the side-effect.
 */
function activateToolIfNeeded() {
  if (!isActive.value) {
    eventBusEmit('tool-changed', { tool: 'shape' })
    // Mirror activateTool: the overlay engine only switches via the IPC path, so
    // the event-bus emit alone would update the bar UI but not the drawn stroke.
    window.openPenApi?.setActiveTool({ tool: 'shape' })
  }
}
</script>

<template>
  <AppButtonDropdown
    popover-id="shape"
    popover-placement="auto"
    :active="isActive"
    :main-tooltip="t('openpen.shape.tool')"
    :main-aria-label="t('openpen.shape.tool')"
    :caret-aria-label="t('openpen.shape.options')"
    main-testid="controlbar-shape-btn"
    caret-testid="controlbar-shape-caret"
    @main-click="activateTool"
    @caret-click="activateToolIfNeeded"
  >
    <template #main-content>
      <component
        :is="currentShapeIcon"
        v-if="currentShapeIcon"
        :filled="filled"
        class="cb-shape-main-icon"
      />
    </template>
    <template #popover-content>
      <div
        class="shape-popover shape-popover-content"
        :class="{ 'shape-popover-content--vertical': isVertical }"
      >
        <ShapePopover :vertical="isVertical" />
      </div>
    </template>
  </AppButtonDropdown>
</template>

<style scoped>
/* Shape icon sized inside the main AppButton (16×16 stays identical to the
   pre-migration `.cb-shape-main-icon` rule). */
.cb-shape-main-icon {
  width: 16px;
  height: 16px;
}

/* .shape-popover-content layout is defined globally in
   src/styles/control-bar-items.css (Teleport content cannot use scoped CSS). */
</style>
