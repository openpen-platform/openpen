<script setup lang="ts">
/**
 * HelloButton — demonstrates useModuleContext from a Vue component.
 *
 * Reads `label` from the module's persisted settings and cycles through
 * a list of values on each click, writing back via ctx.updateSettings().
 * No prop-drilling or provide/inject required.
 */
import { useModuleContext, z } from '@openpen/module-api'
import { AppButton } from '@openpen/module-api/uikit'
import { onMounted, onUnmounted, ref } from 'vue'
import { MODULE_ID } from './module-id'

const StarterSchema = z.object({
  label: z.string().default('👋'),
})
type StarterSettings = z.infer<typeof StarterSchema>

const LABELS = ['👋', '⭐', '🎨', '🚀']

const ctx = useModuleContext(MODULE_ID)
const label = ref(ctx.getSettings<StarterSettings>().label)

let unsubscribe: (() => void) | null = null
onMounted(() => {
  unsubscribe = ctx.onSettingsChange<StarterSettings>((s) => {
    label.value = s.label
  })
})
onUnmounted(() => unsubscribe?.())

async function cycleLabel() {
  const next = LABELS[(LABELS.indexOf(label.value) + 1) % LABELS.length]
  await ctx.updateSettings<StarterSettings>({ label: next })
}
</script>

<template>
  <AppButton tooltip="Click to cycle label (settings demo)" @click="cycleLabel">
    {{ label }}
  </AppButton>
</template>

<style scoped>
/*
 * Token demo: border uses the host design token so this button naturally
 * follows dark/light theme transitions without any JS.
 */
:deep(.app-btn) {
  border: 1px solid var(--openpen-color-border-hi);
}
</style>
