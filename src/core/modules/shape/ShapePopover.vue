<script setup lang="ts">
/*
 * ShapePopover (module) — contribution-driven shape selector + fill toggle.
 *
 * Renders all shapes registered in the canvas.shapes slot using
 * <component :is="s.icon"> — third-party plugins contributing shapes
 * will have their icons and labels rendered automatically.
 *
 * Props from parent (ShapeToolButton via the popup):
 *   - vertical: whether the control-bar is in vertical (snap) mode
 *
 * Reads/writes shape-state directly (module-internal reactive refs).
 * Emits no events to host — host reads canvas.shapes slot contributions.
 */
import { computed, inject } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ShapeContribution } from '@openpen/module-api'
import { SNAP_EDGE_KEY, MODAL_MANAGER_KEY } from '@openpen/module-api'
import { AppToggle } from '@openpen/module-api/uikit'
import { emit as eventBusEmit, getSlotEntries } from '@openpen/module-api/host'
import { currentShape, filled } from './shape-state'

const props = withDefaults(defineProps<{
  vertical?: boolean
}>(), {
  vertical: false,
})

const { t, locale } = useI18n()

const snapEdge = inject(SNAP_EDGE_KEY)
const modalManager = inject(MODAL_MANAGER_KEY)

// Contribution-driven: reads all shapes from canvas.shapes slot.
// Third-party plugins contributing shapes appear here automatically.
const shapesEntries = getSlotEntries<ShapeContribution>('canvas.shapes')
const shapes = computed(() => shapesEntries.value.map((e) => e.contribution))

function resolveLabel(
  label: string | Record<string, string> | undefined,
  id: string
): string {
  // Try module i18n first: shape module locales take precedence so that
  // builtin shapes use the full localised string (e.g. "Rectangle" not "Rect").
  const i18nKey = `openpen.shape.${id}`
  try {
    const msg = t(i18nKey)
    // vue-i18n returns the key itself when missing; treat that as "no translation".
    if (msg && msg !== i18nKey) return msg
  } catch {
    // i18n not available (e.g. unit tests) — fall through.
  }
  if (!label) return id
  if (typeof label === 'string') return label
  return label[locale.value] ?? label['en'] ?? id
}

function selectShape(id: string) {
  currentShape.value = id as typeof currentShape.value
  const config = { tool: 'shape', shapeType: currentShape.value, filled: filled.value }
  // Broadcast on event-bus so useCanvas / shape module stays in sync.
  eventBusEmit('tool-changed', config)
  // Notify main process so IPC-dependent features (cursor, overlay mode) stay in sync.
  window.openPenApi?.setActiveTool(config)
  // Auto-close the popover after selecting a shape (fill toggle does NOT close).
  modalManager?.close('shape')
}

function toggleFilled(val: boolean) {
  filled.value = val
  const config = { tool: 'shape', shapeType: currentShape.value, filled: filled.value }
  eventBusEmit('tool-changed', config)
  window.openPenApi?.setActiveTool(config)
}
</script>

<template>
  <!-- Shape chip grid — icon-only in both modes; label provided via data-tip tooltip (aria-label for screen readers) -->
  <div
    class="shape-grid"
    :class="[
      { vertical: props.vertical },
      snapEdge ? `snap-${snapEdge}` : null,
    ]"
  >
    <div
      v-for="s in shapes"
      :key="s.id"
      class="shape-chip"
      :class="{ active: currentShape === s.id }"
      :aria-label="resolveLabel(s.label, s.id)"
      :data-tip="resolveLabel(s.label, s.id)"
      role="button"
      :tabindex="0"
      @click="selectShape(s.id)"
    >
      <component :is="s.icon" v-if="s.icon" :filled="filled" />
    </div>
  </div>

  <!-- Separator -->
  <div class="shape-panel-sep" :class="{ vertical: props.vertical }" />

  <!-- Fill toggle -->
  <div class="shape-fill-row">
    <span class="shape-fill-label">{{ t('openpen.shape.fill') }}</span>
    <AppToggle
      :model-value="filled"
      :aria-label="t('openpen.shape.fillToggle')"
      @update:model-value="toggleFilled"
    />
  </div>
</template>

<style scoped>
/* ── Shape chips ── */
.shape-grid {
  display: grid;
  grid-template-columns: repeat(5, 40px);
  gap: 6px;
}

.shape-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 8px;
  background: var(--cb-group-bg);
  border: 1px solid var(--border);
  cursor: pointer;
  transition: background 150ms, border-color 150ms;
  color: var(--text-dim);
  position: relative; /* for tooltip ::after positioning */
}

.shape-chip:hover {
  background: var(--cb-hover-bg);
  border-color: var(--border-hi);
}

.shape-chip.active {
  background: var(--accent-bg);
  border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  color: var(--accent);
}

/* ── Separator ── */
.shape-panel-sep {
  width: 1px;
  background: var(--border-hi);
  flex-shrink: 0;
  align-self: stretch;
}

.shape-panel-sep.vertical {
  width: 100%;
  height: 1px;
  align-self: auto;
}

/* ── Fill row ── */
.shape-fill-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.shape-fill-label {
  font-size: 13px;
  color: rgba(148, 163, 184, 1);
  white-space: nowrap;
}

/* ── Tooltip — dark background always, light text always (matches .cb-btn[data-tip]::after convention) ── */
.shape-chip[data-tip]::after {
  content: attr(data-tip);
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--tooltip-bg);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #F1F5F9;
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
  padding: 5px 10px;
  border-radius: 7px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 150ms 400ms; /* 400ms hover delay */
  box-shadow: var(--shadow-sm);
  z-index: 41;
}

.shape-chip[data-tip]:hover::after,
.shape-chip[data-tip]:focus-visible::after {
  opacity: 1;
}

</style>
