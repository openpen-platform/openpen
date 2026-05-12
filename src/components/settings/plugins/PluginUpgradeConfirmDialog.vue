<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  open: boolean
  pluginId: string
  displayName: string
  currentVersion: string
  nextVersion: string
  description?: string
  changelog?: string[]
}>()

const hasChangelog = () => Array.isArray(props.changelog) && props.changelog.length > 0

const emit = defineEmits<{
  'update:open': [boolean]
  confirm: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="puc-overlay" @click.self="emit('update:open', false)">
      <div class="puc-modal mp-detail-modal">
        <div class="puc-header">
          <div>
            <div class="puc-name">{{ displayName }}</div>
            <div class="puc-scope">{{ pluginId }}</div>
          </div>
          <button class="puc-close" :aria-label="t('close')" @click="emit('update:open', false)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="puc-callout">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;">
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>
          </svg>
          <div>
            <div class="puc-callout-next">v{{ nextVersion }} {{ t('pluginUpdateAvailable') }}</div>
            <div class="puc-callout-current">{{ t('pluginCurrentVersion', { version: currentVersion }) }}</div>
          </div>
        </div>

        <div v-if="hasChangelog()" class="puc-changelog">
          <div class="puc-changelog-title">v{{ nextVersion }} changelog</div>
          <ul class="puc-changelog-list">
            <li v-for="(line, i) in changelog" :key="i">{{ line }}</li>
          </ul>
        </div>
        <p v-else-if="description" class="puc-desc">{{ description }}</p>
        <p v-else class="puc-desc puc-desc-empty">{{ t('pluginUpgradeNoChangelog') }}</p>

        <div class="puc-actions">
          <button class="cw-btn cw-btn-cancel" @click="emit('update:open', false)">
            {{ t('cancel') }}
          </button>
          <button class="cw-btn cw-btn-save" @click="emit('confirm')">
            {{ t('pluginUpdateTo', { version: nextVersion }) }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.puc-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.puc-modal {
  display: flex; flex-direction: column; gap: 14px;
  min-width: 340px; max-width: 440px; width: 90%;
  background: var(--surface-hi); border: 1px solid var(--border-hi);
  border-radius: var(--radius); padding: 20px 22px;
  box-shadow: var(--shadow), 0 0 40px rgba(0, 0, 0, 0.35);
  backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
}

.puc-header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
}
.puc-name { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 3px; }
.puc-scope {
  font-family: 'SF Mono', 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px; color: var(--text-muted);
}
.puc-close {
  width: 26px; height: 26px; border-radius: 6px; border: none;
  background: transparent; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: var(--text-muted); flex-shrink: 0;
  transition: background var(--t-fast);
}
.puc-close:hover { background: var(--row-bg); }

.puc-callout {
  display: flex; align-items: center; gap: 10px; padding: 10px 14px;
  background: rgba(251, 191, 36, 0.10);
  border: 1px solid rgba(251, 191, 36, 0.30);
  border-radius: var(--radius-sm);
}
.puc-callout svg { color: #fbbf24; }
.puc-callout-next { font-size: 12.5px; font-weight: 600; color: #fbbf24; }
.puc-callout-current { font-size: 11.5px; color: #fbbf24; opacity: 0.85; }

:global([data-theme="light"]) .puc-callout svg,
:global([data-theme="light"]) .puc-callout-next,
:global([data-theme="light"]) .puc-callout-current { color: #b45309; }

.puc-changelog { font-size: 12.5px; color: var(--text-dim); line-height: 1.65; }
.puc-changelog-title { font-weight: 600; color: var(--text-primary); margin-bottom: 6px; }
.puc-changelog-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
.puc-changelog-list li::marker { color: var(--text-muted); }

.puc-desc { font-size: 13px; color: var(--text-dim); line-height: 1.65; margin: 0; }
.puc-desc-empty { font-style: italic; color: var(--text-muted); }

.puc-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
