<script setup lang="ts">
/*
 * ShapeToolButton (module) — shape tool button + caret + sub-panel popup.
 *
 * Renders:
 *   - main button: activates the shape tool
 *   - caret button (via AppPopover): opens/closes ShapePopover popup
 *
 * Popup lifecycle (mutual exclusion, outside-click, animating guard,
 * passthrough) is delegated to AppPopover from @openpen/module-api/uikit.
 */
import { computed, inject, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  SNAP_EDGE_KEY,
  IS_VERTICAL_KEY,
  MODAL_MANAGER_KEY,
  type ShapeContribution,
} from '@openpen/module-api'
import { AppPopover } from '@openpen/module-api/uikit'
import { emit as eventBusEmit, on as eventBusOn, getSlotEntries } from '@openpen/module-api/host'
import ShapePopover from './ShapePopover.vue'
import { currentShape, filled } from './shape-state'

const { t } = useI18n()

const snapEdge = inject(SNAP_EDGE_KEY)
const isVertical = inject(IS_VERTICAL_KEY)
const modalManager = inject(MODAL_MANAGER_KEY)

// Active caret points toward the popover; inactive points down.
// Popup opens to the left only when snapped to the right edge; otherwise opens right.
const caretActiveSideClass = computed(() => {
  if (!isVertical?.value) return 'cb-shape-caret-icon--up'
  return snapEdge?.value === 'right'
    ? 'cb-shape-caret-icon--left'
    : 'cb-shape-caret-icon--right'
})

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
 * AppPopover's PopoverTrigger as-child handles the popup toggle via Reka UI.
 */
function activateToolIfNeeded() {
  if (!isActive.value) {
    eventBusEmit('tool-changed', { tool: 'shape' })
  }
}
</script>

<template>
  <div
    class="cb-shape-wrap"
    :class="{ 'cb-shape-wrap--vertical': isVertical }"
  >
    <!-- Main shape tool button -->
    <button
      class="cb-btn cb-shape-main-btn"
      :class="{ active: isActive }"
      :data-tip="t('openpen.shape.tool')"
      :aria-label="t('openpen.shape.tool')"
      @click="activateTool"
    >
      <component
        :is="currentShapeIcon"
        v-if="currentShapeIcon"
        :filled="filled"
        class="cb-shape-main-icon"
      />
    </button>

    <!-- Caret button — opens ShapePopover popup via AppPopover -->
    <AppPopover popover-id="shape" placement="auto">
      <template #trigger="{ active }">
        <button
          class="cb-shape-caret"
          :class="{
            active,
            'cb-shape-caret--vertical': isVertical,
          }"
          :aria-label="t('openpen.shape.options')"
          @click="activateToolIfNeeded"
        >
          <svg
            class="cb-shape-caret-icon"
            :class="active ? caretActiveSideClass : 'cb-shape-caret-icon--down'"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </template>
      <template #content>
        <div
          class="shape-popover shape-popover-content"
          :class="{ 'shape-popover-content--vertical': isVertical }"
        >
          <ShapePopover :vertical="isVertical" />
        </div>
      </template>
    </AppPopover>
  </div>
</template>

<style scoped>
/* ── Shape button wrap ── */
.cb-shape-wrap {
  display: flex;
  align-items: center;
  gap: 0;
  -webkit-app-region: no-drag;
}

.cb-shape-wrap--vertical {
  flex-direction: column;
  gap: 2px;
}

.cb-shape-main-btn {
  width: 32px;
}

.cb-shape-main-icon {
  width: 16px;
  height: 16px;
}

/* ── Caret ── */
.cb-shape-caret {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 30px;
  border: none;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  padding: 0;
  border-radius: 8px;
  transition: color 150ms, background 150ms;
}

.cb-shape-caret-icon {
  transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.cb-shape-caret-icon--down { transform: rotate(0deg); }
.cb-shape-caret-icon--up { transform: rotate(180deg); }
.cb-shape-caret-icon--right { transform: rotate(-90deg); }
.cb-shape-caret-icon--left { transform: rotate(90deg); }

.cb-shape-caret--vertical {
  width: 30px;
  height: 14px;
}

.cb-shape-caret:hover {
  color: var(--text-primary);
  background: var(--cb-hover-bg);
}

.cb-shape-caret.active {
  color: var(--accent);
  background: var(--accent-bg);
}

/* .shape-popover-content layout is defined globally in
   src/styles/control-bar-items.css (Teleport content cannot use scoped CSS) */
</style>
