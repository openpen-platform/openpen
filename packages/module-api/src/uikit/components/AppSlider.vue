<script setup lang="ts">
/**
 * AppSlider — High-level wrapper (Layer 1).
 *
 * Wraps Reka UI Slider (SliderRoot / SliderTrack / SliderRange / SliderThumb).
 *
 * Visual: 4px track, 14×14 white thumb, accent fill,
 * hover scale(1.2) at var(--openpen-duration-fast) easing.
 * Optional value bubble above the thumb while it is being dragged (`valueLabel`).
 *
 * Styles use --openpen-* design tokens.
 * No Reka UI types are leaked in the public API.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import {
  SliderRoot,
  SliderTrack,
  SliderRange,
  SliderThumb,
} from '../primitives'

// ── Public API (MUST NOT reference reka-ui types) ─────────────────────────────

const props = withDefaults(defineProps<{
  modelValue: number
  min?: number
  max?: number
  step?: number
  /** Container width (e.g. '100%', '72px'). In vertical mode this sets the height. */
  width?: string
  /**
   * Accessible name announced by screen readers when the thumb is focused.
   * Pass it whenever the slider has no visible label of its own.
   */
  ariaLabel?: string
  orientation?: 'horizontal' | 'vertical'
  trackHeight?: string
  trackRadius?: string
  thumbWidth?: string
  thumbHeight?: string
  thumbRadius?: string
  /**
   * Reverse the value-to-position mapping. With orientation='vertical', sets
   * top=min and bottom=max (drag down to increase). With orientation='horizontal',
   * sets right=min and left=max (drag left to increase). Useful when an icon
   * legend implies the opposite direction of the underlying control.
   *
   * Delegates to reka-ui SliderRoot's native `inverted` prop, which swaps
   * startEdge/endEdge on SliderRange — no manual value transformation needed.
   */
  inverted?: boolean
  /**
   * Text for the value bubble (e.g. "4px"). When set, a small bubble with this
   * text appears above the thumb while the slider is being dragged and hides on
   * release; it is also exposed to assistive technology as `aria-valuetext`.
   * Horizontal sliders only. Leave unset for no bubble.
   */
  valueLabel?: string
}>(), {
  min: 0,
  max: 100,
  step: 1,
  width: '100%',
  ariaLabel: undefined,
  orientation: 'horizontal',
  trackHeight: '4px',
  trackRadius: '2px',
  thumbWidth: '14px',
  thumbHeight: '14px',
  thumbRadius: '50%',
  inverted: false,
  valueLabel: undefined,
})

const emit = defineEmits<{
  'update:modelValue': [value: number]
}>()

// ── Internal state ────────────────────────────────────────────────────────────

const isVertical = computed(() => props.orientation === 'vertical')

// The bubble follows the pointer press on the whole slider (thumb or track), not
// the thumb's :active state, because pressing the track also starts a drag.
const dragging = ref(false)
const showBubble = computed(
  () => dragging.value && !!props.valueLabel && !isVertical.value,
)

function endDrag() {
  dragging.value = false
  document.removeEventListener('pointerup', endDrag)
  document.removeEventListener('pointercancel', endDrag)
}

function onPointerDown() {
  dragging.value = true
  document.addEventListener('pointerup', endDrag)
  document.addEventListener('pointercancel', endDrag)
}

onBeforeUnmount(endDrag)

/** Root element inline style */
const rootStyle = computed(() => {
  if (isVertical.value) {
    return {
      '--thumb-w': props.thumbWidth,
      '--thumb-h': props.thumbHeight,
      '--thumb-r': props.thumbRadius,
      '--track-height': props.trackHeight,
      '--track-radius': props.trackRadius,
      height: props.width,
      width: '16px',
    }
  }
  return {
    '--thumb-w': props.thumbWidth,
    '--thumb-h': props.thumbHeight,
    '--thumb-r': props.thumbRadius,
    '--track-height': props.trackHeight,
    '--track-radius': props.trackRadius,
    width: props.width,
  }
})

function onValueChange(val: number[] | undefined) {
  if (val && val.length > 0) {
    emit('update:modelValue', val[0])
  }
}
</script>

<template>
  <SliderRoot
    class="app-slider-root"
    data-testid="app-slider-root"
    :class="{ 'app-slider-root--vertical': isVertical, 'app-slider-root--inverted': inverted }"
    :style="rootStyle"
    :model-value="[modelValue]"
    :min="min"
    :max="max"
    :step="step"
    :orientation="orientation"
    :inverted="inverted"
    @update:model-value="onValueChange"
    @pointerdown="onPointerDown"
  >
    <SliderTrack class="app-slider-track" data-testid="app-slider-track">
      <SliderRange class="app-slider-range" data-testid="app-slider-range" />
    </SliderTrack>
    <SliderThumb
      class="app-slider-thumb"
      data-testid="app-slider-thumb"
      :aria-label="ariaLabel"
      :aria-valuetext="valueLabel"
    >
      <span
        v-if="showBubble"
        class="app-slider-bubble"
        data-testid="app-slider-bubble"
        aria-hidden="true"
      >{{ valueLabel }}</span>
    </SliderThumb>
  </SliderRoot>
</template>

<style scoped>
/* ── Value bubble (shown while dragging) ───────────────────────────────────── */
.app-slider-bubble {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  padding: 2px 6px;
  border-radius: var(--openpen-radius-sm);
  background: var(--openpen-color-tooltip-bg);
  color: var(--openpen-color-tooltip-text);
  border: 1px solid var(--openpen-color-tooltip-border);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
  z-index: 1;
}

/* ── Root container ────────────────────────────────────────────────────────── */
.app-slider-root {
  position: relative;
  display: flex;
  align-items: center;
  user-select: none;
  touch-action: none;
  flex-shrink: 0;
  cursor: pointer;
}

.app-slider-root[data-orientation='horizontal'] {
  height: var(--track-height, 4px);
}

.app-slider-root[data-orientation='vertical'] {
  flex-direction: column;
  width: var(--track-height, 4px);
}

/* ── Track ─────────────────────────────────────────────────────────────────── */
.app-slider-track {
  position: relative;
  flex-grow: 1;
  border-radius: var(--track-radius, 2px);
  background: var(--openpen-color-border-hi);
}

.app-slider-root[data-orientation='horizontal'] .app-slider-track {
  height: var(--track-height, 4px);
}

.app-slider-root[data-orientation='vertical'] .app-slider-track {
  width: var(--track-height, 4px);
}

/* ── Range (filled portion) ─────────────────────────────────────────────────── */
.app-slider-range {
  position: absolute;
  border-radius: var(--track-radius, 2px);
  background: var(--openpen-color-accent);
}

.app-slider-root[data-orientation='horizontal'] .app-slider-range {
  height: 100%;
  top: 0;
  left: 0;
}

.app-slider-root[data-orientation='vertical'] .app-slider-range {
  width: 100%;
  bottom: 0;
  left: 0;
}

/* ── Thumb ─────────────────────────────────────────────────────────────────── */
.app-slider-thumb {
  display: block;
  width: var(--thumb-w, 14px);
  height: var(--thumb-h, 14px);
  border-radius: var(--thumb-r, 50%);
  background: #fff;
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.50);
  cursor: pointer;
  outline: none;
  transition: transform var(--openpen-duration-fast) var(--openpen-easing-standard);
}

.app-slider-thumb:hover {
  transform: scale(1.2);
}

.app-slider-thumb:focus-visible {
  box-shadow: 0 0 0 3px var(--openpen-color-accent-glow);
}
</style>
