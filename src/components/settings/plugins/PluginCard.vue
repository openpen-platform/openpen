<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { listingDescription } from '../../../services/marketplace-listing'
import PluginListingIcon from './PluginListingIcon.vue'
import PluginListingShot from './PluginListingShot.vue'

const { t, locale } = useI18n()

const props = withDefaults(defineProps<{
  entry: CatalogEntry
  installedVersion?: string | null
  incompatible?: boolean
}>(), {
  installedVersion: null,
  incompatible: false,
})

const emit = defineEmits<{
  install: [id: string, version: string]
  click: [entry: CatalogEntry]
}>()

const isInstalled = computed(() => !!props.installedVersion)
const description = computed(() => listingDescription(props.entry, locale.value))

const hasUpdate = computed(() =>
  isInstalled.value &&
  props.entry.latestVersion &&
  props.installedVersion !== props.entry.latestVersion
)
</script>

<template>
  <div
    class="mp-card"
    data-testid="plugin-card"
    :class="{ 'mp-card-incompatible': incompatible }"
    :aria-disabled="incompatible"
    @click="emit('click', entry)"
  >
    <!-- Close-up cover band with the icon overlapping its lower edge -->
    <div class="mp-card-band">
      <PluginListingShot :entry="entry" :index="0" class="mp-card-cover" />
      <PluginListingIcon :entry="entry" class="mp-card-icon" />
    </div>

    <div class="mp-card-body">
    <div class="mp-card-header">
      <div class="mp-card-info">
        <div class="mp-card-name">{{ entry.name }}</div>
        <div class="mp-card-scope">{{ entry.id }}</div>
      </div>
      <span v-if="incompatible" class="mp-badge-incompatible">
        {{ t('pluginRequires', { version: entry.minAppVersion }) }}
      </span>
      <span v-else-if="hasUpdate" class="mp-badge-update" data-testid="plugin-update-badge" style="display:inline-flex;align-items:center;gap:4px;">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>
        </svg>
        Update {{ entry.latestVersion }}
      </span>
      <span v-else-if="isInstalled" class="mp-badge-installed" data-testid="plugin-installed-badge">{{ t('pluginInstalled') }}</span>
    </div>

    <div class="mp-card-desc" data-testid="plugin-card-desc">{{ description }}</div>

    <div class="mp-card-footer">
      <span class="mp-version-chip">
        <template v-if="isInstalled && hasUpdate">{{ installedVersion }} {{ t('pluginInstalledLabel') }}</template>
        <template v-else>{{ entry.latestVersion }}</template>
      </span>
      <span class="mp-card-author">by {{ entry.ownerLogin }}</span>
      <button
        v-if="!isInstalled && !incompatible"
        class="mp-install-btn"
        data-testid="plugin-install-btn"
        :title="t('pluginInstall')"
        @click.stop="emit('install', entry.id, entry.latestVersion)"
      >
        {{ t('pluginInstall') }}
      </button>
      <button
        v-else-if="!isInstalled && incompatible"
        class="mp-install-btn mp-install-btn-disabled"
        data-testid="plugin-install-btn"
        disabled
        :title="t('pluginRequires', { version: entry.minAppVersion })"
      >
        {{ t('pluginInstall') }}
      </button>
    </div>
    </div>
  </div>
</template>

<style scoped>
.mp-card {
  background: var(--row-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  /* clip, not hidden: a scroll container's grid row could shrink below its content */
  overflow: clip;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  transition: border-color var(--t-fast), box-shadow var(--t-fast), background var(--t-fast);
}
.mp-card:hover:not([aria-disabled="true"]) {
  border-color: rgba(129, 140, 248, 0.45);
  box-shadow: 0 2px 12px rgba(129, 140, 248, 0.12);
  background: rgba(129, 140, 248, 0.04);
}
.mp-card-incompatible { opacity: 0.5; cursor: default; }

.mp-card-band { position: relative; flex-shrink: 0; }
.mp-card-cover { width: 100%; height: 112px; }
.mp-card-icon {
  position: absolute; left: 12px; bottom: -18px;
  width: 40px; height: 40px; border-radius: 10px;
  box-shadow: 0 0 0 3px var(--surface-hi);
}
.mp-card-body {
  display: flex; flex-direction: column; gap: 6px;
  padding: 24px 12px 12px; flex: 1 0 auto; min-width: 0;
}

.mp-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.mp-card-info { min-width: 0; }
.mp-card-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.3;
}
.mp-card-scope {
  font-family: 'SF Mono', 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mp-card-desc {
  font-size: 12px;
  color: var(--text-dim);
  line-height: 1.5;
  overflow: hidden;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.mp-card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
}
.mp-card-author {
  font-size: 11px;
  color: var(--text-dim);
  margin-left: auto;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
</style>
