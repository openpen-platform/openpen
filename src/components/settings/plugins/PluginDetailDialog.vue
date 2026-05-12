<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  open: boolean
  entry: CatalogEntry | null
  installedVersion: string | null
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  install: [id: string, version: string]
  update: [id: string, version: string]
  uninstall: [id: string]
}>()

const isInstalled = computed(() => !!props.installedVersion)
const hasUpdate = computed(() =>
  isInstalled.value &&
  props.entry?.latestVersion &&
  props.entry.latestVersion !== props.installedVersion
)
</script>

<template>
  <Teleport to="body">
    <div v-if="open && entry" class="pd-overlay" @click.self="emit('update:open', false)">
      <div class="pd-modal mp-detail-modal">
        <!-- Header -->
        <div class="pd-header">
          <div>
            <div class="pd-name">{{ entry.name }}</div>
            <div class="pd-scope">{{ entry.id }}</div>
            <div class="pd-author">
              by {{ entry.ownerLogin }}
              <template v-if="entry.repo">
                · <a :href="entry.repo" target="_blank" rel="noopener noreferrer" class="pd-link">
                  {{ entry.repo.replace('https://github.com/', 'github.com/') }}
                </a>
              </template>
            </div>
          </div>
          <button class="pd-close" :aria-label="t('close')" @click="emit('update:open', false)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Update available callout -->
        <div v-if="hasUpdate" class="pd-update-callout">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" style="flex-shrink:0;">
            <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>
          </svg>
          <div>
            <div class="pd-update-version">{{ entry.latestVersion }} {{ t('pluginUpdateAvailable') }}</div>
            <div class="pd-update-current">{{ t('pluginCurrentVersion', { version: installedVersion }) }}</div>
          </div>
        </div>

        <!-- Description -->
        <p class="pd-desc">{{ entry.description }}</p>

        <!-- Screenshot placeholders -->
        <div class="pd-screenshots">
          <div class="pd-screenshot-ph">{{ t('pluginScreenshot') }} 1</div>
          <div class="pd-screenshot-ph">{{ t('pluginScreenshot') }} 2</div>
          <div class="pd-screenshot-ph">{{ t('pluginScreenshot') }} 3</div>
        </div>

        <!-- Meta -->
        <div class="pd-meta">
          <span class="pd-meta-chip">{{ t('pluginMinVersion', { version: entry.minAppVersion }) }}</span>
          <span v-if="entry.forkOf" class="pd-meta-chip">Fork of {{ entry.forkOf }}</span>
        </div>

        <!-- Actions -->
        <div class="pd-actions">
          <button v-if="isInstalled" class="cw-btn cw-btn-cancel" @click="entry && emit('uninstall', entry.id)">
            {{ t('pluginUninstall') }}
          </button>
          <button
            v-if="hasUpdate"
            class="cw-btn cw-btn-save"
            @click="entry && emit('update', entry.id, entry.latestVersion)"
          >
            {{ t('pluginUpdateTo', { version: entry.latestVersion }) }}
          </button>
          <button
            v-else-if="isInstalled"
            class="cw-btn cw-btn-save"
            disabled
          >
            {{ t('pluginInstalled') }}
          </button>
          <button
            v-else
            class="cw-btn cw-btn-save"
            @click="entry && emit('install', entry.id, entry.latestVersion)"
          >
            {{ t('pluginInstall') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pd-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.pd-modal {
  display: flex; flex-direction: column; gap: 14px;
  min-width: 340px; max-width: 480px; width: 90%;
  background: var(--surface-hi); border: 1px solid var(--border-hi);
  border-radius: var(--radius); padding: 20px 22px;
  box-shadow: var(--shadow), 0 0 40px rgba(0,0,0,0.35);
  backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
}
.pd-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.pd-name { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 3px; }
.pd-scope {
  font-family: 'SF Mono', 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px; color: var(--text-muted); margin-bottom: 4px;
}
.pd-author { font-size: 12px; color: var(--text-dim); }
.pd-link { color: var(--accent); text-decoration: none; }
.pd-link:hover { text-decoration: underline; }
.pd-close {
  width: 26px; height: 26px; border-radius: 6px; border: none;
  background: transparent; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: var(--text-muted); flex-shrink: 0;
  transition: background var(--t-fast);
}
.pd-close:hover { background: var(--row-bg); }

.pd-update-callout {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  background: rgba(251, 191, 36, 0.10); border: 1px solid rgba(251, 191, 36, 0.30);
  border-radius: var(--radius-sm);
}
.pd-update-version { font-size: 12px; font-weight: 600; color: #b45309; }
.pd-update-current { font-size: 11px; color: #b45309; opacity: 0.85; }

.pd-desc { font-size: 13px; color: var(--text-dim); line-height: 1.65; margin: 0; }

.pd-screenshots { display: flex; gap: 8px; }
.pd-screenshot-ph {
  flex: 1; height: 72px; background: var(--row-bg); border: 1px solid var(--border);
  border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center;
  font-size: 11px; color: var(--text-muted);
}

.pd-meta { display: flex; gap: 8px; flex-wrap: wrap; }
.pd-meta-chip {
  font-size: 11px; color: var(--text-muted); background: var(--row-bg);
  border: 1px solid var(--border); padding: 3px 9px; border-radius: 999px;
}

.pd-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
