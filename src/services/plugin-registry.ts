/**
 * Computed subsets of settings slot entries scoped to plugin-contributed items.
 * Built-in tab ids are excluded from `pluginSettingsTabs` so they are not
 * duplicated alongside the host's hardcoded tabs.
 */
import { computed, type ComputedRef } from 'vue'
import type { SettingsTabContribution, SettingsPanelContribution } from '@openpen/module-api'
import { getSlotEntries } from '../core/runtime/contribution-store'

const HARDCODED_TAB_IDS = new Set(['appearance', 'behavior', 'features', 'about'])

export const pluginSettingsTabs: ComputedRef<SettingsTabContribution[]> = computed(
  () =>
    getSlotEntries<SettingsTabContribution>('ui.settings.tabs')
      .value.map((e) => e.contribution)
      .filter((tab) => !HARDCODED_TAB_IDS.has(tab.id))
)

export const pluginSettingsPanels: ComputedRef<SettingsPanelContribution[]> = computed(
  () =>
    getSlotEntries<SettingsPanelContribution>('ui.settings.panels')
      .value.map((e) => e.contribution)
)
