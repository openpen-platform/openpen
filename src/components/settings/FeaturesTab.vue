<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { SettingsPanelContribution } from '@openpen/module-api'
import { getSlotEntries } from '../../core/runtime/contribution-store'
import { resolveLabel } from '../../services/i18n-utils'

const { t, locale } = useI18n()

const panels = computed<SettingsPanelContribution[]>(() =>
  getSlotEntries<SettingsPanelContribution>('ui.settings.panels').value.map((e) => e.contribution)
)
</script>

<template>
  <div class="features-tab">
    <template v-if="panels.length > 0">
      <div v-for="panel in panels" :key="panel.id" class="feature-section">
        <div class="feature-section-title">{{ resolveLabel(panel.label, locale) }}</div>
        <component :is="panel.component" />
      </div>
    </template>
    <div v-else class="features-empty">
      <p>{{ t('featuresEmpty') }}</p>
    </div>
  </div>
</template>

<style scoped>
.features-tab {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.feature-section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.features-empty {
  text-align: center;
  padding: 32px 0;
  color: var(--text-muted);
  font-size: 13px;
}
</style>
