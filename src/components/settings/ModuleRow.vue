<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { AppToggle } from '@openpen/module-api/uikit'

interface ModuleRowProps {
  id: string
  displayName: string
  description: string
  version?: string
  installedAt?: string | null
  isEnabled: boolean
  removable?: boolean
  hasUpdate?: boolean
}

const props = defineProps<ModuleRowProps>()
const emit = defineEmits<{
  'update:enabled': [value: boolean]
  remove: []
}>()

const { t, locale } = useI18n()

function formatRelative(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffSec = Math.round(diffMs / 1000)
  const diffMin = Math.round(diffSec / 60)
  const diffHour = Math.round(diffMin / 60)
  const diffDay = Math.round(diffHour / 24)
  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })
  if (Math.abs(diffDay) >= 1) return rtf.format(-diffDay, 'day')
  if (Math.abs(diffHour) >= 1) return rtf.format(-diffHour, 'hour')
  if (Math.abs(diffMin) >= 1) return rtf.format(-diffMin, 'minute')
  return rtf.format(-diffSec, 'second')
}
</script>

<template>
  <li class="modules-row" :data-testid="`module-row-${props.id}`">
    <div class="modules-row-info">
      <div class="modules-row-name" data-testid="module-row-name">{{ props.displayName }}</div>
      <div class="modules-row-desc" data-testid="module-row-desc">{{ props.description }}</div>
      <div class="modules-row-meta">
        <code class="modules-id">{{ props.id }}</code>
        <span v-if="props.version" class="modules-version" data-testid="module-row-version">v{{ props.version }}</span>
        <span v-if="props.hasUpdate" class="mp-badge-update" data-testid="module-row-update-badge">{{ t('pluginFilterUpdate') }}</span>
        <span v-if="props.installedAt" class="modules-installed-at">
          {{ t('moduleInstalledAt', { time: formatRelative(props.installedAt) }) }}
        </span>
      </div>
    </div>
    <div v-if="props.removable" class="modules-row-actions" data-testid="module-row-actions">
      <AppToggle
        :model-value="props.isEnabled"
        :aria-label="props.isEnabled ? t('moduleEnabledLabel') : t('moduleDisabledLabel')"
        testid="module-row-toggle"
        @update:model-value="(v) => emit('update:enabled', v)"
      />
      <button class="mp-remove-btn" data-testid="module-row-remove-btn" @click="emit('remove')">{{ t('pluginRemove') }}</button>
    </div>
    <AppToggle
      v-else
      :model-value="props.isEnabled"
      :aria-label="props.isEnabled ? t('moduleEnabledLabel') : t('moduleDisabledLabel')"
      testid="module-row-toggle"
      @update:model-value="(v) => emit('update:enabled', v)"
    />
  </li>
</template>

<style scoped>
.modules-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--row-bg);
  border: 1px solid var(--border);
}

.modules-row-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.modules-row-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.modules-row-desc {
  font-size: 11.5px;
  color: var(--text-dim);
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 380px;
}

.modules-row-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.modules-id {
  font-size: 11px;
  font-family: 'SF Mono', 'JetBrains Mono', 'Fira Code', monospace;
  color: var(--text-muted);
}

.modules-version {
  font-size: 11px;
  color: var(--text-muted);
}

.modules-installed-at {
  font-size: 11px;
  color: var(--text-muted);
}

.modules-row-actions {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}
</style>
