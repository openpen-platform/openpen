<script setup lang="ts">
/*
 * StrokeWidthSlider (module) — stroke-width control item for ui.control-bar.
 *
 * Supports four layout modes based on bar orientation and the module's `style` setting:
 *   horizontal + slider  → small dot + 72px range + large dot
 *   horizontal + popup   → hamburger button + popup above (via AppPopover)
 *   vertical + slider    → embedded in vbar, rotate(-90deg)
 *   vertical + popup     → hamburger button + side popup (via AppPopover)
 *
 * Popup lifecycle (mutual exclusion with color/shape, outside-click, animating
 * guard, passthrough) is delegated to AppPopover from @openpen/module-api/uikit.
 *
 * Uses inject rather than importing host composables directly:
 *   - STROKE_STYLE_CONTEXT_KEY  → lineWidth read/write
 *   - SNAP_EDGE_KEY             → close popup on snap edge change (stale anchor)
 *   - IS_VERTICAL_KEY           → vertical layout detection
 *   - MODAL_MANAGER_KEY         → close popup on snap edge change
 */
import { computed, inject, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  STROKE_STYLE_CONTEXT_KEY,
  SNAP_EDGE_KEY,
  IS_VERTICAL_KEY,
  MODAL_MANAGER_KEY,
  useModuleContext,
} from '@openpen/module-api'
import { AppSlider, AppPopover } from '@openpen/module-api/uikit'

const { t } = useI18n()

const strokeStyleCtx = inject(STROKE_STYLE_CONTEXT_KEY)
const snapEdge = inject(SNAP_EDGE_KEY)
const isVertical = inject(IS_VERTICAL_KEY)
const modalManager = inject(MODAL_MANAGER_KEY)

const lineWidth = computed(() => strokeStyleCtx?.lineWidth.value ?? 4)
const widthValue = computed({
  get: () => lineWidth.value,
  set: (v) => strokeStyleCtx?.setLineWidth(Number(v)),
})

const strokeStyle = ref<'slider' | 'popup'>('slider')
let unsubSettings: (() => void) | null = null

// Close popup when snap edge changes (stale anchor coords).
watch(() => snapEdge?.value, () => { modalManager?.close('stroke-width') })
// Close inline slider popup when style switches to slider.
watch(strokeStyle, (s) => { if (s === 'slider') modalManager?.close('stroke-width') })

onMounted(() => {
  // Module context registration completes after the host's onMounted resolves,
  // which fires after all child components mount. Defer to the next macrotask
  // so the context is guaranteed to be available.
  setTimeout(() => {
    try {
      const ctx = useModuleContext('@openpen/stroke-width')
      const s = ctx.getSettings<{ defaultWidth?: number; style?: 'slider' | 'popup' }>()
      if (s.style) strokeStyle.value = s.style
      if (typeof s.defaultWidth === 'number') strokeStyleCtx?.setLineWidth(s.defaultWidth)
      unsubSettings = ctx.onSettingsChange<{ style?: 'slider' | 'popup' }>((next) => {
        if (next.style) strokeStyle.value = next.style
      })
    } catch {
      // Module not loaded in this window type (e.g. overlay-only context).
    }
  }, 0)
})

onUnmounted(() => {
  unsubSettings?.()
})
</script>

<template>
  <div class="stroke-width-slider-wrap">
    <!-- Horizontal layout + slider style -->
    <div
      v-if="!isVertical && strokeStyle === 'slider'"
      class="cb-stroke"
      :aria-label="t('openpen.stroke-width.adjust')"
    >
      <span class="stroke-dot" style="width:3px;height:3px;" aria-hidden="true" />
      <AppSlider v-model="widthValue" :min="1" :max="20" :step="1" width="72px" />
      <span class="stroke-dot" style="width:8px;height:8px;" aria-hidden="true" />
    </div>

    <!-- Horizontal layout + popup style -->
    <div
      v-else-if="!isVertical && strokeStyle === 'popup'"
      class="sw-hpopup-wrap"
    >
      <AppPopover popover-id="stroke-width" placement="auto">
        <template #trigger="{ active }">
          <button
            class="sw-hbtn"
            :class="{ active }"
            :data-tip="t('openpen.stroke-width.button')"
            :aria-label="t('openpen.stroke-width.button')"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M3 12h18M3 18h18" stroke-width="1.5"/>
            </svg>
            <span class="sw-hbtn-val">{{ lineWidth }}px</span>
          </button>
        </template>
        <template #content>
          <div class="sw-hpopup">
            <span class="sw-popup-title">{{ t('openpen.stroke-width.title') }}</span>
            <AppSlider
              v-model="widthValue"
              :min="1"
              :max="20"
              :step="1"
              track-height="8px"
              track-radius="4px"
              thumb-width="24px"
              thumb-height="16px"
              thumb-radius="8px"
            />
            <div class="sw-popup-labels">
              <span>1px</span>
              <span>4px</span>
              <span>20px</span>
            </div>
          </div>
        </template>
      </AppPopover>
    </div>

    <!-- Vertical layout + slider style -->
    <div
      v-else-if="isVertical && strokeStyle === 'slider'"
      class="vbar-stroke"
    >
      <span class="stroke-dot" style="width:3px;height:3px;" aria-hidden="true" />
      <AppSlider v-model="widthValue" :min="1" :max="20" :step="1" orientation="vertical" width="64px" :inverted="true" />
      <span class="stroke-dot" style="width:8px;height:8px;" aria-hidden="true" />
    </div>

    <!-- Vertical layout + popup style -->
    <div v-else class="sw-vbtn-wrap">
      <AppPopover popover-id="stroke-width" placement="auto">
        <template #trigger="{ active }">
          <button
            class="sw-vbtn"
            :class="{ active }"
            :data-tip="t('openpen.stroke-width.button')"
            :aria-label="t('openpen.stroke-width.button')"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 6h18M3 12h18M3 18h18" stroke-width="1.5"/>
            </svg>
          </button>
        </template>
        <template #content>
          <div class="sw-popup">
            <span class="sw-popup-title">{{ t('openpen.stroke-width.title') }}</span>
            <AppSlider
              v-model="widthValue"
              :min="1"
              :max="20"
              :step="1"
              track-height="8px"
              track-radius="4px"
              thumb-width="24px"
              thumb-height="16px"
              thumb-radius="8px"
            />
            <div class="sw-popup-labels">
              <span>1px</span>
              <span>4px</span>
              <span>20px</span>
            </div>
          </div>
        </template>
      </AppPopover>
    </div>
  </div>
</template>

<style scoped>
.stroke-width-slider-wrap {
  display: contents;
}

.cb-stroke {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 6px;
  -webkit-app-region: no-drag;
}

.stroke-dot {
  background: var(--text-dim);
  border-radius: 50%;
  flex-shrink: 0;
  display: block;
}

.sw-hpopup-wrap {
  -webkit-app-region: no-drag;
}

.sw-hbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 36px;
  width: auto;
  padding: 0 8px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: background 150ms, color 150ms;
  flex-shrink: 0;
}

.sw-hbtn:hover {
  background: var(--cb-hover-bg);
  color: var(--text-primary);
}

.sw-hbtn.active,
.sw-vbtn.active {
  background: var(--accent-bg);
  color: var(--accent);
  box-shadow: 0 0 0 1px rgba(129, 140, 248, 0.30);
}

.sw-hbtn-val {
  font-size: 12px;
  font-weight: 500;
  color: currentColor;
}

.vbar-stroke {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 4px 0;
  -webkit-app-region: no-drag;
}

.sw-vbtn-wrap {
  -webkit-app-region: no-drag;
}

.sw-vbtn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
  transition: background 150ms, color 150ms;
  flex-shrink: 0;
  padding: 0;
}

.sw-vbtn:hover {
  background: var(--cb-hover-bg);
  color: var(--text-primary);
}

/* sw-popup / sw-hpopup: explicit min-width so AppSlider width:100% has a
   reference dimension (without this the popover content has no intrinsic
   width → AppSlider collapses to its minimum). 180px accommodates title +
   slider track + labels comfortably (AppSlider thumb offset means 180px is
   the safe floor for a usable range input). */
.sw-popup,
.sw-hpopup {
  min-width: 180px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sw-popup-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 10px;
}

.sw-popup-labels {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--text-muted);
  padding: 0 2px;
}
</style>
