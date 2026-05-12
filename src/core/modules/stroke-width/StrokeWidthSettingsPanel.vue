<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useModuleContext } from '@openpen/module-api'
import { AppSlider, AppSegmented } from '@openpen/module-api/uikit'

const { t } = useI18n()

type StrokeWidthSettings = { defaultWidth?: number; style?: 'slider' | 'popup' }

const defaultWidth = ref(4)
const style = ref<'slider' | 'popup'>('slider')

let unsub: (() => void) | null = null

onMounted(() => {
  const ctx = useModuleContext('@openpen/stroke-width')
  const s = ctx.getSettings<StrokeWidthSettings>()
  defaultWidth.value = s.defaultWidth ?? 4
  style.value = s.style ?? 'slider'
  unsub = ctx.onSettingsChange<StrokeWidthSettings>((next) => {
    if (next.defaultWidth != null) defaultWidth.value = next.defaultWidth
    if (next.style) style.value = next.style
  })
})

onUnmounted(() => { unsub?.() })

async function setDefaultWidth(v: number) {
  const ctx = useModuleContext('@openpen/stroke-width')
  defaultWidth.value = v
  await ctx.updateSettings<StrokeWidthSettings>({ defaultWidth: v })
}

async function setStyle(v: string) {
  const ctx = useModuleContext('@openpen/stroke-width')
  const next = v as 'slider' | 'popup'
  style.value = next
  await ctx.updateSettings<StrokeWidthSettings>({ style: next })
}

const styleOptions = computed(() => [
  { value: 'slider', label: t('openpen.stroke-width.styleSlider') },
  { value: 'popup',  label: t('openpen.stroke-width.stylePopup') },
])
</script>

<template>
  <div class="sw-settings">
    <div class="cw-row">
      <div>
        <div class="cw-row-label">{{ t('openpen.stroke-width.defaultWidth') }}</div>
        <div class="cw-row-sub">{{ t('openpen.stroke-width.defaultWidthSub') }}</div>
      </div>
      <div class="stroke-row">
        <AppSlider
          :model-value="defaultWidth"
          :min="1"
          :max="20"
          :step="1"
          width="80px"
          track-height="8px"
          track-radius="4px"
          thumb-width="24px"
          thumb-height="16px"
          thumb-radius="8px"
          @update:model-value="setDefaultWidth($event)"
        />
        <span class="stroke-val">{{ defaultWidth }}</span>
      </div>
    </div>

    <div class="cw-row">
      <div>
        <div class="cw-row-label">{{ t('openpen.stroke-width.style') }}</div>
        <div class="cw-row-sub">{{ t('openpen.stroke-width.styleSub') }}</div>
      </div>
      <AppSegmented
        :model-value="style"
        :options="styleOptions"
        @update:model-value="setStyle($event)"
      />
    </div>
  </div>
</template>

<style scoped>
.sw-settings {
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

.stroke-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.stroke-val {
  font-size: 12px;
  color: var(--text-muted);
  min-width: 20px;
  text-align: right;
}
</style>
