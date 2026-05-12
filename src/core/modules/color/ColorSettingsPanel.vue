<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useModuleContext } from '@openpen/module-api'

const { t } = useI18n()

const PRESETS = [
  { id: 'indigo', label: 'Indigo', value: '#818CF8' },
  { id: 'red',    label: 'Red',    value: '#EF4444' },
  { id: 'green',  label: 'Emerald', value: '#10B981' },
  { id: 'blue',   label: 'Blue',   value: '#3B82F6' },
  { id: 'amber',  label: 'Amber',  value: '#F59E0B' },
]

type ColorSettings = { defaultColor?: string }

const defaultColor = ref('#818CF8')
let unsub: (() => void) | null = null

onMounted(() => {
  const ctx = useModuleContext('@openpen/color')
  const s = ctx.getSettings<ColorSettings>()
  defaultColor.value = s.defaultColor ?? '#818CF8'
  unsub = ctx.onSettingsChange<ColorSettings>((next) => {
    if (next.defaultColor) defaultColor.value = next.defaultColor
  })
})

onUnmounted(() => { unsub?.() })

async function setColor(color: string) {
  const ctx = useModuleContext('@openpen/color')
  defaultColor.value = color
  await ctx.updateSettings<ColorSettings>({ defaultColor: color })
}
</script>

<template>
  <div class="cs-settings">
    <div class="cw-row">
      <div>
        <div class="cw-row-label">{{ t('openpen.color.defaultColorLabel') }}</div>
        <div class="cw-row-sub">{{ t('openpen.color.defaultColorSub') }}</div>
      </div>
      <div class="cs-presets">
        <button
          v-for="p in PRESETS"
          :key="p.id"
          class="cs-chip"
          :class="{ selected: defaultColor.toLowerCase() === p.value.toLowerCase() }"
          :style="{ background: p.value }"
          :aria-label="p.label"
          :aria-pressed="defaultColor.toLowerCase() === p.value.toLowerCase()"
          @click="setColor(p.value)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.cs-settings {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cw-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--row-bg);
  border: 1px solid var(--border);
  gap: 12px;
}
.cw-row-label { font-size: 13.5px; font-weight: 500; }
.cw-row-sub   { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }

.cs-presets {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.cs-chip {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 120ms, box-shadow 120ms;
  padding: 0;
  flex-shrink: 0;
}

.cs-chip:hover {
  transform: scale(1.15);
}

.cs-chip.selected {
  box-shadow: 0 0 0 2px var(--surface-settings), 0 0 0 4px currentColor;
  outline: none;
}
</style>
