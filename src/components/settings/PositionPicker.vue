<script setup lang="ts">
/**
 * PositionPicker — 3×3 grid selector for the notification position setting.
 *
 * Not part of uikit; no contract test required.
 * The selected cell is highlighted with the --accent colour.
 */
import type { NotificationPosition } from '../../../shared/settings-defaults'

defineProps<{ modelValue: NotificationPosition }>()
const emit = defineEmits<{ 'update:modelValue': [NotificationPosition] }>()

/** Grid token order: row-major, left-to-right, top-to-bottom. */
const CELLS: NotificationPosition[] = [
  'top-left',    'top-center',    'top-right',
  'middle-left', 'center',        'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]

function select(pos: NotificationPosition): void {
  emit('update:modelValue', pos)
}
</script>

<template>
  <div class="position-picker" role="radiogroup" aria-label="Notification position">
    <button
      v-for="cell in CELLS"
      :key="cell"
      type="button"
      class="position-cell"
      :class="{ 'position-cell--active': modelValue === cell }"
      :aria-label="cell"
      :aria-checked="modelValue === cell"
      role="radio"
      @click="select(cell)"
    />
  </div>
</template>

<style scoped>
.position-picker {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  width: 72px;
  flex-shrink: 0;
}

.position-cell {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid var(--border-hi, rgba(100, 116, 139, 0.3));
  background: var(--input-bg, rgba(15, 23, 42, 0.6));
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
  padding: 0;
  outline: none;
}

.position-cell:hover {
  border-color: var(--accent, #818CF8);
  background: rgba(129, 140, 248, 0.15);
}

.position-cell--active {
  background: var(--accent, #818CF8);
  border-color: var(--accent, #818CF8);
}

.position-cell:focus-visible {
  outline: 2px solid var(--accent, #818CF8);
  outline-offset: 2px;
}
</style>
