<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { StrokeColor } from '@openpen/module-api'
import {
  hexToHsv, hsvToHex, isValidHex,
  hsvToRgb, rgbToHex,
} from '@openpen/module-api/host'

const props = withDefaults(defineProps<{
  modelValue?: StrokeColor
}>(), {
  modelValue: '#818cf8',
})

const emit = defineEmits(['update:modelValue'])
const { t } = useI18n()

const activeTab = ref<'solid' | 'gradient'>('solid')

const hue = ref(240)
const saturation = ref(56)
const value = ref(97)
const hexInput = ref('#818cf8')

const gradFrom = ref('#818cf8')
const gradTo = ref('#ef4444')
const gradTarget = ref<'from' | 'to'>('from')

const svCanvasRef = ref<HTMLCanvasElement | null>(null)
const hueCanvasRef = ref<HTMLCanvasElement | null>(null)

const PRESETS = [
  '#F87171', '#FB923C', '#FBBF24', '#34D399',
  '#60A5FA', '#818CF8', '#F472B6', '#FFFFFF',
]

const hueColor = computed(() => {
  const [r, g, b] = hsvToRgb(hue.value, 100, 100)
  return rgbToHex(r, g, b)
})

const gradPreviewStyle = computed(() =>
  `linear-gradient(to right, ${gradFrom.value}, ${gradTo.value})`
)

const solidToneThumbLeft = computed(() => `${value.value}%`)
const hueThumbLeft = computed(() => `${(hue.value / 360) * 100}%`)
const svThumbLeft = computed(() => `${saturation.value}%`)
const svThumbTop = computed(() => `${100 - value.value}%`)
const currentSolidHex = computed(() => hsvToHex(hue.value, saturation.value, value.value))

function parseModelValue() {
  const val = props.modelValue
  if (typeof val === 'object' && val !== null && val.type === 'linear') {
    activeTab.value = 'gradient'
    gradFrom.value = val.from
    gradTo.value = val.to
    const [h, s, v] = hexToHsv(val.from)
    hue.value = h; saturation.value = s; value.value = v
    hexInput.value = val.from
  } else {
    activeTab.value = 'solid'
    const hex = typeof val === 'string' ? val : '#818cf8'
    const [h, s, v] = hexToHsv(hex)
    hue.value = h; saturation.value = s; value.value = v
    hexInput.value = hex
  }
}

function drawSVCanvas() {
  const canvas = svCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width: w, height: h } = canvas
  const gradH = ctx.createLinearGradient(0, 0, w, 0)
  gradH.addColorStop(0, '#fff')
  gradH.addColorStop(1, hueColor.value)
  ctx.fillStyle = gradH
  ctx.fillRect(0, 0, w, h)
  const gradV = ctx.createLinearGradient(0, 0, 0, h)
  gradV.addColorStop(0, 'rgba(0,0,0,0)')
  gradV.addColorStop(1, 'rgba(0,0,0,1)')
  ctx.fillStyle = gradV
  ctx.fillRect(0, 0, w, h)
}

function drawHueCanvas() {
  const canvas = hueCanvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width: w, height: h } = canvas
  const grad = ctx.createLinearGradient(0, 0, w, 0)
  const stops = [0, 60, 120, 180, 240, 300, 360]
  for (const deg of stops) {
    const [r, g, b] = hsvToRgb(deg, 100, 100)
    grad.addColorStop(deg / 360, rgbToHex(r, g, b))
  }
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, h)
}

function setSVFromCanvas(px: number, py: number) {
  const canvas = svCanvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const s = Math.max(0, Math.min(100, ((px - rect.left) / rect.width) * 100))
  const v = Math.max(0, Math.min(100, 100 - ((py - rect.top) / rect.height) * 100))
  saturation.value = s
  value.value = v
  onColorChange()
}

function setHueFromCanvas(px: number) {
  const canvas = hueCanvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const h = Math.max(0, Math.min(360, ((px - rect.left) / rect.width) * 360))
  hue.value = h
  onColorChange()
  nextTick(drawSVCanvas)
}

function onColorChange() {
  const hex = hsvToHex(hue.value, saturation.value, value.value)
  hexInput.value = hex
  emitCurrent(hex)
}

function emitCurrent(hex: string) {
  if (activeTab.value === 'solid') {
    emit('update:modelValue', hex)
  } else {
    if (gradTarget.value === 'from') {
      gradFrom.value = hex
    } else {
      gradTo.value = hex
    }
    emit('update:modelValue', { type: 'linear', from: gradFrom.value, to: gradTo.value })
  }
}

function onHexInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value
  hexInput.value = raw
  const val = raw.startsWith('#') ? raw : '#' + raw
  if (isValidHex(val)) {
    const [h, s, v] = hexToHsv(val)
    hue.value = h; saturation.value = s; value.value = v
    emitCurrent(val)
    nextTick(drawSVCanvas)
  }
}

function selectPreset(hex: string) {
  const [h, s, v] = hexToHsv(hex)
  hue.value = h; saturation.value = s; value.value = v
  hexInput.value = hex
  emitCurrent(hex)
  nextTick(drawSVCanvas)
}

function switchTab(tab: 'solid' | 'gradient') {
  activeTab.value = tab
  if (tab === 'gradient') {
    if (typeof props.modelValue !== 'object') {
      gradFrom.value = currentSolidHex.value
    }
    emit('update:modelValue', { type: 'linear', from: gradFrom.value, to: gradTo.value })
    selectGradTarget('from')
    nextTick(() => {
      drawSVCanvas()
      drawHueCanvas()
    })
  } else {
    emit('update:modelValue', currentSolidHex.value)
  }
}

function selectGradTarget(target: 'from' | 'to') {
  gradTarget.value = target
  const hex = target === 'from' ? gradFrom.value : gradTo.value
  const [h, s, v] = hexToHsv(hex)
  hue.value = h; saturation.value = s; value.value = v
  hexInput.value = hex
  nextTick(drawSVCanvas)
}

let svDragging = false
let hueDragging = false
let solidHueDragging = false
let solidToneDragging = false

function onSVPointerDown(e: PointerEvent) {
  svDragging = true;
  (e.currentTarget as Element).setPointerCapture(e.pointerId)
  setSVFromCanvas(e.clientX, e.clientY)
}
function onSVPointerMove(e: PointerEvent) { if (svDragging) setSVFromCanvas(e.clientX, e.clientY) }
function onSVPointerUp() { svDragging = false }

function onHuePointerDown(e: PointerEvent) {
  hueDragging = true;
  (e.currentTarget as Element).setPointerCapture(e.pointerId)
  setHueFromCanvas(e.clientX)
}
function onHuePointerMove(e: PointerEvent) { if (hueDragging) setHueFromCanvas(e.clientX) }
function onHuePointerUp() { hueDragging = false }

function setSolidHueFromBar(px: number, target: Element) {
  const rect = target.getBoundingClientRect()
  const h = Math.max(0, Math.min(360, ((px - rect.left) / rect.width) * 360))
  hue.value = h
  onColorChange()
  nextTick(drawSVCanvas)
}

function setSolidToneFromBar(px: number, target: Element) {
  const rect = target.getBoundingClientRect()
  const nextValue = Math.max(0, Math.min(100, ((px - rect.left) / rect.width) * 100))
  value.value = nextValue
  onColorChange()
}

function onSolidHuePointerDown(e: PointerEvent) {
  solidHueDragging = true;
  (e.currentTarget as Element).setPointerCapture(e.pointerId)
  setSolidHueFromBar(e.clientX, e.currentTarget as Element)
}
function onSolidHuePointerMove(e: PointerEvent) { if (solidHueDragging) setSolidHueFromBar(e.clientX, e.currentTarget as Element) }
function onSolidHuePointerUp() { solidHueDragging = false }

function onSolidTonePointerDown(e: PointerEvent) {
  solidToneDragging = true;
  (e.currentTarget as Element).setPointerCapture(e.pointerId)
  setSolidToneFromBar(e.clientX, e.currentTarget as Element)
}
function onSolidTonePointerMove(e: PointerEvent) { if (solidToneDragging) setSolidToneFromBar(e.clientX, e.currentTarget as Element) }
function onSolidTonePointerUp() { solidToneDragging = false }

watch(hue, () => nextTick(drawSVCanvas))

onMounted(() => {
  parseModelValue()
  nextTick(() => {
    drawSVCanvas()
    drawHueCanvas()
  })
})

watch(() => props.modelValue, () => {
  parseModelValue()
  nextTick(() => {
    drawSVCanvas()
    drawHueCanvas()
  })
}, { deep: true })
</script>

<template>
  <div class="color-picker-popup" data-testid="cp-popup" @pointerdown.stop>
    <div class="cp-tabs">
      <button class="cp-tab" data-testid="cp-tab-solid" :class="{ active: activeTab === 'solid' }" @click="switchTab('solid')">{{ t('openpen.color.tabSolid') }}</button>
      <button class="cp-tab" data-testid="cp-tab-gradient" :class="{ active: activeTab === 'gradient' }" @click="switchTab('gradient')">{{ t('openpen.color.tabGradient') }}</button>
    </div>

    <div v-if="activeTab === 'solid'" class="cp-solid-panel">
      <h4 class="cp-solid-title">{{ t('openpen.color.sectionColor') }}</h4>
      <div class="cp-sv-wrapper">
        <canvas ref="svCanvasRef" class="cp-sv-canvas" data-testid="cp-sv-canvas" width="220" height="120"
          @pointerdown="onSVPointerDown" @pointermove="onSVPointerMove"
          @pointerup="onSVPointerUp" @pointercancel="onSVPointerUp" />
        <div class="cp-sv-thumb" :style="{ left: svThumbLeft, top: svThumbTop }" aria-hidden="true" />
      </div>
      <div class="cp-solid-hue" data-testid="cp-solid-hue" :title="t('openpen.color.hueDrag')"
        @pointerdown="onSolidHuePointerDown" @pointermove="onSolidHuePointerMove"
        @pointerup="onSolidHuePointerUp" @pointercancel="onSolidHuePointerUp">
        <div class="cp-solid-bar-thumb" :style="{ left: hueThumbLeft, background: hueColor }" />
      </div>
      <div class="cp-solid-tone" :title="t('openpen.color.toneDrag')" :style="{ '--cp-tone-color': hueColor }"
        @pointerdown="onSolidTonePointerDown" @pointermove="onSolidTonePointerMove"
        @pointerup="onSolidTonePointerUp" @pointercancel="onSolidTonePointerUp">
        <div class="cp-solid-bar-thumb" :style="{ left: solidToneThumbLeft, background: currentSolidHex }" />
      </div>
      <div class="cp-presets" role="group" :aria-label="t('openpen.color.presets')">
        <button v-for="p in PRESETS" :key="p" class="cp-color-preset" :data-testid="`cp-preset-${p.replace('#','')}`"
          :style="{ background: p }"
          :class="{ active: currentSolidHex.toUpperCase() === p.toUpperCase() }"
          :aria-label="p" @click="selectPreset(p)" />
      </div>
      <div class="cp-solid-hex-row">
        <input class="cp-solid-hex-input" data-testid="cp-solid-hex-input" type="text" :value="hexInput.toUpperCase()"
          maxlength="7" spellcheck="false" :aria-label="t('openpen.color.hexValue')" @input="onHexInput" />
        <div class="cp-solid-hex-preview" :style="{ background: currentSolidHex }" />
      </div>
    </div>

    <div v-else class="cp-grad-panel">
      <h4 class="cp-solid-title">{{ t('openpen.color.sectionGradient') }}</h4>
      <div class="cp-grad-targets">
        <div class="cp-grad-stop">
          <button class="cp-grad-well" data-testid="cp-grad-well-from" :class="{ active: gradTarget === 'from' }"
            :style="{ background: gradFrom }" :aria-label="t('openpen.color.gradientFromColor')"
            @click="selectGradTarget('from')" />
          <span class="cp-grad-label">{{ t('openpen.color.gradientFrom') }}</span>
        </div>
        <div class="cp-grad-preview" data-testid="cp-grad-preview" :style="{ background: gradPreviewStyle }" :aria-label="t('openpen.color.gradientPreview')" />
        <div class="cp-grad-stop">
          <button class="cp-grad-well" data-testid="cp-grad-well-to" :class="{ active: gradTarget === 'to' }"
            :style="{ background: gradTo }" :aria-label="t('openpen.color.gradientToColor')"
            @click="selectGradTarget('to')" />
          <span class="cp-grad-label">{{ t('openpen.color.gradientTo') }}</span>
        </div>
      </div>
      <div class="cp-sv-wrapper">
        <canvas ref="svCanvasRef" class="cp-sv-canvas" data-testid="cp-sv-canvas" width="220" height="120"
          @pointerdown="onSVPointerDown" @pointermove="onSVPointerMove"
          @pointerup="onSVPointerUp" @pointercancel="onSVPointerUp" />
        <div class="cp-sv-thumb" :style="{ left: svThumbLeft, top: svThumbTop }" aria-hidden="true" />
      </div>
      <div class="cp-hue-wrapper">
        <canvas ref="hueCanvasRef" class="cp-hue-canvas" width="220" height="14"
          @pointerdown="onHuePointerDown" @pointermove="onHuePointerMove"
          @pointerup="onHuePointerUp" @pointercancel="onHuePointerUp" />
        <div class="cp-hue-thumb" :style="{ left: hueThumbLeft }" aria-hidden="true" />
      </div>
      <div class="cp-presets" role="group" :aria-label="t('openpen.color.presets')">
        <button v-for="p in PRESETS" :key="p" class="cp-color-preset" :data-testid="`cp-preset-${p.replace('#','')}`"
          :style="{ background: p }"
          :class="{ active: currentSolidHex.toUpperCase() === p.toUpperCase() }"
          :aria-label="p" @click="selectPreset(p)" />
      </div>
      <div class="cp-solid-hex-row">
        <input class="cp-solid-hex-input" type="text" :value="hexInput.toUpperCase()"
          maxlength="7" spellcheck="false" :aria-label="t('openpen.color.hexValue')" @input="onHexInput" />
        <div class="cp-solid-hex-preview" :style="{ background: currentSolidHex }" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.color-picker-popup {
  width: 240px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  pointer-events: auto;
  -webkit-app-region: no-drag;
  user-select: none;
}

.cp-tabs {
  display: flex;
  gap: 2px;
  background: var(--cb-group-bg);
  border-radius: 8px;
  padding: 2px;
  margin-bottom: 2px;
}

.cp-tab {
  flex: 1;
  height: 30px;
  border: none;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  background: transparent;
  color: var(--text-dim);
  transition: background 150ms, color 150ms;
}

.cp-tab.active {
  background: var(--accent-bg);
  color: var(--accent);
}

.cp-solid-panel,
.cp-grad-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cp-solid-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.cp-solid-hue,
.cp-solid-tone {
  position: relative;
  width: 100%;
  height: 14px;
  border-radius: 7px;
  cursor: crosshair;
}

.cp-solid-hue {
  background: linear-gradient(to right, #f87171, #fbbf24, #34d399, #60a5fa, #a78bfa, #f472b6);
}

.cp-solid-tone {
  background-image:
    linear-gradient(to right, rgba(0, 0, 0, 0), var(--cp-tone-color)),
    repeating-conic-gradient(rgba(255, 255, 255, 0.15) 0% 25%, transparent 0% 50%);
  background-size: 100% 100%, 8px 8px;
}

.cp-solid-bar-thumb {
  position: absolute;
  top: 50%;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 1;
}

.cp-solid-hex-row {
  display: flex;
  gap: 8px;
  margin-bottom: 2px;
}

.cp-solid-hex-input {
  flex: 1;
  background: var(--input-bg);
  border: 1px solid var(--border-hi);
  border-radius: 7px;
  color: var(--text-primary);
  font-size: 12px;
  font-family: 'SF Mono', monospace;
  padding: 6px 10px;
  outline: none;
  text-transform: uppercase;
}

.cp-solid-hex-preview {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  border: 1px solid var(--border-hi);
  flex-shrink: 0;
}

.cp-grad-targets {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.cp-grad-stop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  flex-shrink: 0;
}

.cp-grad-well {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  border: 2px solid var(--border-hi);
  cursor: pointer;
  transition: border-color 150ms, transform 150ms;
  flex-shrink: 0;
}

.cp-grad-well.active {
  border-color: var(--accent);
  transform: scale(1.1);
}

.cp-grad-label {
  font-size: 10px;
  color: var(--text-muted);
}

.cp-grad-preview {
  flex: 1;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--border);
}

.cp-sv-wrapper {
  position: relative;
  width: 100%;
  height: 120px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  cursor: crosshair;
}

.cp-sv-canvas {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 6px;
}

.cp-sv-thumb {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.cp-hue-wrapper {
  position: relative;
  width: 100%;
  height: 14px;
  border-radius: 7px;
  overflow: hidden;
  flex-shrink: 0;
  cursor: crosshair;
}

.cp-hue-canvas {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 7px;
}

.cp-hue-thumb {
  position: absolute;
  top: 50%;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.5);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.cp-presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 2px;
}

.cp-color-preset {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  cursor: pointer;
  border: 2px solid transparent;
  transition: transform 150ms, border-color 150ms;
}

.cp-color-preset:hover {
  transform: scale(1.18);
  border-color: rgba(255, 255, 255, 0.4);
}

.cp-color-preset.active {
  border-color: rgba(255, 255, 255, 0.7);
}
</style>
