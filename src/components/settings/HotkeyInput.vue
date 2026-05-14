<script setup lang="ts">
import { ref, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { AppTooltip } from '@openpen/module-api/uikit'
import { formatAccelerator as fmtAccel, type Platform } from '../../utils/format-accelerator'

const props = defineProps<{
  modelValue: string
  defaultValue: string
  shortcutId: string
  hasConflict?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'shortcutError': [message: string]
}>()

const { t } = useI18n()

const isCapturing = ref(false)
const isConflict = ref(false)
let conflictTimer: ReturnType<typeof setTimeout> | null = null

function triggerConflictShake() {
  if (conflictTimer) clearTimeout(conflictTimer)
  isConflict.value = true
  conflictTimer = setTimeout(() => { isConflict.value = false }, 600)
}

const platform: Platform = (window.openPenApi?.platform ?? 'darwin') as Platform

const KEY_MAP: Record<string, string> = {
  'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
  'Enter': 'Return', ' ': 'Space', 'Backspace': 'Backspace', 'Delete': 'Delete',
  'Tab': 'Tab', 'Escape': 'Escape', '+': 'Plus',
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'Command', 'Super', 'Hyper', 'OS'])

function formatAccelerator(accel: string): string {
  return fmtAccel(accel, platform)
}

function buildAccelerator(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null

  const modifiers: string[] = []
  if (e.ctrlKey || e.metaKey) modifiers.push('CommandOrControl')
  if (e.altKey) modifiers.push('Alt')
  if (e.shiftKey) modifiers.push('Shift')

  const mainKey = KEY_MAP[e.key] ?? (e.key.length === 1 ? e.key.toUpperCase() : e.key)

  // Single-char keys require at least one modifier
  if (mainKey.length === 1 && modifiers.length === 0) return null

  return [...modifiers, mainKey].join('+')
}

function onDocKeyDown(e: KeyboardEvent) {
  e.preventDefault()
  e.stopPropagation()

  if (e.key === 'Escape') {
    stopCapture()
    return
  }

  const accel = buildAccelerator(e)
  if (!accel) return

  stopCapture()
  applyAccelerator(accel)
}

function startCapture() {
  isCapturing.value = true
  emit('shortcutError', '')
  window.openPenApi?.setShortcutsSuspended(true)
  document.addEventListener('keydown', onDocKeyDown, true)
}

function stopCapture() {
  if (!isCapturing.value) return
  isCapturing.value = false
  document.removeEventListener('keydown', onDocKeyDown, true)
  window.openPenApi?.setShortcutsSuspended(false)
}

async function applyAccelerator(accel: string) {
  if (accel === props.defaultValue) {
    await resetToDefault()
    return
  }

  const result = await window.openPenApi?.setShortcut(props.shortcutId, accel)
    ?? { ok: false, error: 'API unavailable' }

  if (result.ok) {
    emit('update:modelValue', accel)
    emit('shortcutError', '')
  } else {
    emit('shortcutError', t('shortcutConflict'))
    triggerConflictShake()
  }
}

async function resetToDefault() {
  const result = await window.openPenApi?.resetShortcut(props.shortcutId)
    ?? { ok: false, error: 'API unavailable' }
  if (result.ok) {
    emit('update:modelValue', props.defaultValue)
    emit('shortcutError', '')
  }
}

onUnmounted(() => {
  stopCapture()
  if (conflictTimer) clearTimeout(conflictTimer)
})
</script>

<template>
  <div class="hki-root">
    <div class="hki-capture-row">
      <AppTooltip
        v-if="!isCapturing"
        :content="hasConflict ? t('shortcutConflictPlugin') : t('shortcutClickToChange')"
        side="top"
      >
        <button
          class="hki-badge"
          :class="{ 'hki-badge--conflict': isConflict, 'hki-badge--plugin-conflict': hasConflict }"
          :aria-label="hasConflict ? t('shortcutConflictPlugin') : t('shortcutClickToChange')"
          @click="startCapture"
        >
          <svg v-if="hasConflict" class="hki-warn-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 2L14.5 13H1.5L8 2Z"/>
            <path d="M8 6.5V9.5"/>
            <circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none"/>
          </svg>
          {{ formatAccelerator(modelValue) || '—' }}
        </button>
      </AppTooltip>
      <span v-else class="hki-listening">{{ t('shortcutPressKeys') }}</span>

      <button
        v-if="isCapturing"
        class="hki-cancel"
        :aria-label="t('cancel')"
        @click="stopCapture"
      >✕</button>
      <AppTooltip v-else-if="modelValue !== defaultValue" :content="t('shortcutReset')" side="top">
        <button
          class="hki-reset"
          :aria-label="t('shortcutReset')"
          @click="resetToDefault"
        >↺</button>
      </AppTooltip>
    </div>
  </div>
</template>

<style scoped>
.hki-root { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }

.hki-capture-row { display: flex; align-items: center; gap: 6px; }

.hki-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  min-width: 80px;
  border-radius: 7px;
  background: var(--input-bg);
  border: 1px solid var(--border-hi);
  color: var(--text-primary);
  font-size: 13px;
  font-family: 'SF Mono', 'Fira Code', monospace;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 150ms;
}
.hki-badge:hover { border-color: var(--accent); }

.hki-badge--conflict {
  border-color: #F87171;
  animation: hki-shake 0.45s ease-in-out;
}

.hki-badge--plugin-conflict {
  border-color: #F59E0B;
  color: #F59E0B;
  gap: 5px;
}
.hki-badge--plugin-conflict:hover { border-color: #FBBF24; }

.hki-warn-icon {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
}

@keyframes hki-shake {
  0%, 100% { transform: translateX(0); }
  15%       { transform: translateX(-5px); }
  40%       { transform: translateX(5px); }
  65%       { transform: translateX(-3px); }
  85%       { transform: translateX(2px); }
}

.hki-listening {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  min-width: 80px;
  border-radius: 7px;
  border: 1px solid var(--accent);
  color: var(--accent);
  font-size: 12px;
  white-space: nowrap;
  animation: hki-pulse 1s ease-in-out infinite alternate;
}

.hki-cancel,
.hki-reset {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 150ms;
  flex-shrink: 0;
}
.hki-cancel:hover { color: #F87171; }
.hki-reset:hover { color: var(--accent); }

@keyframes hki-pulse {
  from { opacity: 0.65; }
  to   { opacity: 1; }
}
</style>
