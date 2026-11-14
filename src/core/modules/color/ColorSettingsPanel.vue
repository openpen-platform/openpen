<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useModuleContext } from '@openpen/module-api'
import { AppSwatchPicker } from '@openpen/module-api/uikit'
import { ACCENT_PRESETS } from './accent-presets'

const { t } = useI18n()

const PRESET_SWATCHES = ACCENT_PRESETS.map((p) => ({ value: p.value, label: p.label, testid: `cs-preset-${p.id}` }))
const gradientFor = (c: { value: string }) =>
  ACCENT_PRESETS.find((p) => p.value === c.value)?.gradient ?? c.value

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
      <AppSwatchPicker
        :model-value="defaultColor" :colors="PRESET_SWATCHES" size="small" spacing="small"
        :background="gradientFor" :ariaLabel="t('openpen.color.defaultColorLabel')"
        testid="cs-presets" @update:model-value="setColor" />
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

</style>
