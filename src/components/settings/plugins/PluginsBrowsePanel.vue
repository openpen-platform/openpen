<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePluginMarketplace } from '../../../composables/usePluginMarketplace'
import PluginCard from './PluginCard.vue'
import PluginDetailDialog from './PluginDetailDialog.vue'
import PluginInstallProgressDialog from './PluginInstallProgressDialog.vue'

const { t } = useI18n()
const marketplace = usePluginMarketplace()

const props = withDefaults(defineProps<{ searchQuery?: string }>(), { searchQuery: '' })
const activeFilter = ref<'all' | 'draw' | 'tool' | 'integration'>('all')

const detailDialogOpen = ref(false)
const detailEntry = ref<CatalogEntry | null>(null)

const installProgressOpen = ref(false)
const installTargetId = ref('')
const installTargetVersion = ref('')

const filteredCatalog = computed(() => {
  const q = props.searchQuery.toLowerCase().trim()
  return marketplace.catalog.value.filter((entry) => {
    if (entry.state === 'tombstoned') return false
    if (activeFilter.value !== 'all' && entry.category !== activeFilter.value) return false
    if (!q) return true
    return (
      entry.name.toLowerCase().includes(q) ||
      entry.description.toLowerCase().includes(q) ||
      entry.ownerLogin.toLowerCase().includes(q) ||
      entry.id.toLowerCase().includes(q)
    )
  })
})

function openDetail(entry: CatalogEntry) {
  detailEntry.value = entry
  detailDialogOpen.value = true
}

async function startInstall(id: string, version: string) {
  detailDialogOpen.value = false
  installTargetId.value = id
  installTargetVersion.value = version
  installProgressOpen.value = true
  await marketplace.installFromCatalog(id)
}

function dismissProgress() {
  installProgressOpen.value = false
  marketplace.resetInstallState()
}

async function refresh() {
  await marketplace.fetchCatalog()
}

onMounted(async () => {
  if (marketplace.catalog.value.length === 0) {
    await marketplace.fetchCatalog()
  }
})
</script>

<template>
  <div class="browse-panel" v-auto-animate>
    <!-- Loading state -->
    <div v-if="marketplace.loading.value" class="browse-loading">
      {{ t('pluginBrowseLoading') }}
    </div>

    <!-- Error state -->
    <div v-else-if="marketplace.error.value" class="browse-error">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" style="flex-shrink:0;">
        <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      {{ marketplace.error.value }}
      <button class="browse-retry-btn" @click="refresh">{{ t('pluginRetry') }}</button>
    </div>

    <!-- Loaded -->
    <template v-else>
      <!-- Filter chips -->
      <div class="browse-chips">
        <button
          class="mp-filter-chip"
          :class="{ active: activeFilter === 'all' }"
          :aria-label="t('pluginFilterAll')"
          @click="activeFilter = 'all'"
        >
          {{ t('pluginFilterAll') }}
        </button>
        <button
          class="mp-filter-chip"
          :class="{ active: activeFilter === 'draw' }"
          :aria-label="t('pluginFilterDraw')"
          @click="activeFilter = 'draw'"
        >
          {{ t('pluginFilterDraw') }}
        </button>
        <button
          class="mp-filter-chip"
          :class="{ active: activeFilter === 'tool' }"
          :aria-label="t('pluginFilterTool')"
          @click="activeFilter = 'tool'"
        >
          {{ t('pluginFilterTool') }}
        </button>
        <button
          class="mp-filter-chip"
          :class="{ active: activeFilter === 'integration' }"
          :aria-label="t('pluginFilterIntegration')"
          @click="activeFilter = 'integration'"
        >
          {{ t('pluginFilterIntegration') }}
        </button>
      </div>

      <!-- Empty state -->
      <div v-if="filteredCatalog.length === 0" class="browse-empty">
        {{ t('pluginBrowseEmpty') }}
      </div>

      <!-- Card grid (scrollable) -->
      <div v-else class="mp-card-grid mp-card-grid-scroll">
        <PluginCard
          v-for="entry in filteredCatalog"
          :key="entry.id"
          :entry="entry"
          :installed-version="marketplace.installedVersions.value[entry.id] ?? null"
          :incompatible="!!entry.incompatible"
          @click="openDetail"
          @install="startInstall"
        />
      </div>
    </template>

    <!-- Detail dialog -->
    <PluginDetailDialog
      v-model:open="detailDialogOpen"
      :entry="detailEntry"
      :installed-version="detailEntry ? (marketplace.installedVersions.value[detailEntry.id] ?? null) : null"
      @install="startInstall"
      @update="startInstall"
      @uninstall="(id) => { detailDialogOpen = false }"
    />

    <!-- Install progress dialog -->
    <PluginInstallProgressDialog
      v-model:open="installProgressOpen"
      :plugin-id="installTargetId"
      :version="installTargetVersion"
      :stage="marketplace.installStage.value"
      :percent="marketplace.installPercent.value"
      :error-message="marketplace.installError.value"
      @dismiss="dismissProgress"
      @retry="() => startInstall(installTargetId, installTargetVersion)"
      @restart="() => { dismissProgress() }"
    />
  </div>
</template>

<style scoped>
.browse-panel { display: flex; flex-direction: column; gap: 10px; }

.browse-loading, .browse-empty {
  padding: 28px 0; text-align: center; font-size: 13px; color: var(--text-muted);
}
.browse-error {
  display: flex; align-items: center; gap: 8px; padding: 10px 14px;
  font-size: 12.5px; color: var(--danger);
  background: rgba(248, 113, 113, 0.06); border: 1px solid rgba(248, 113, 113, 0.20);
  border-radius: var(--radius-sm);
}
.browse-retry-btn {
  margin-left: auto; font-size: 12px; font-weight: 500; color: var(--accent);
  background: transparent; border: none; cursor: pointer; padding: 0 4px;
}
.browse-retry-btn:hover { text-decoration: underline; }

.browse-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.mp-filter-chip {
  padding: 4px 12px; font-size: 12px; font-weight: 500; color: var(--text-muted);
  border: 1px solid var(--border); background: transparent; cursor: pointer;
  border-radius: var(--radius-full);
  transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast);
}
.mp-filter-chip:hover { color: var(--text-dim); border-color: var(--border-hi); }
.mp-filter-chip.active {
  background: var(--accent-bg); color: var(--accent); border-color: rgba(129, 140, 248, 0.40);
}

.mp-card-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
/* Prevent grid items from overflowing their cell (min-width: auto default breaks grid) */
.mp-card-grid > * { min-width: 0; }

.mp-card-grid-scroll {
  max-height: 400px;
  overflow-y: auto;
  overflow-x: hidden;
  /* Hide scrollbar until hover */
  scrollbar-width: thin;
  scrollbar-color: transparent transparent;
}
.mp-card-grid-scroll:hover {
  scrollbar-color: rgba(129, 140, 248, 0.25) transparent;
}
.mp-card-grid-scroll::-webkit-scrollbar { width: 4px; }
.mp-card-grid-scroll::-webkit-scrollbar-track { background: transparent; }
.mp-card-grid-scroll::-webkit-scrollbar-thumb {
  background: transparent;
  border-radius: 9999px;
  transition: background 0.2s;
}
.mp-card-grid-scroll:hover::-webkit-scrollbar-thumb {
  background: rgba(129, 140, 248, 0.25);
}
.mp-card-grid-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(129, 140, 248, 0.5);
}
</style>
