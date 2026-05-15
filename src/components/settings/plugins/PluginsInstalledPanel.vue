<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { sanitizeIdForI18n } from '@openpen/module-api'
import { AppBanner } from '@openpen/module-api/uikit'
import type { BannerVariant } from '@openpen/module-api/uikit'
import { BUILT_IN_MODULES } from '../../../core/modules/registry'
import { useModulesPanel } from '../../../composables/useModulesPanel'
import { usePluginMarketplace } from '../../../composables/usePluginMarketplace'
import ModuleRow from '../ModuleRow.vue'
import PluginRemoveConfirmDialog from './PluginRemoveConfirmDialog.vue'
import PluginInstallProgressDialog from './PluginInstallProgressDialog.vue'

const { t, te } = useI18n()
const { currentDisabled, pendingRestart, toggleModule, start, stop } = useModulesPanel()
const marketplace = usePluginMarketplace()

const props = withDefaults(defineProps<{ searchQuery?: string }>(), { searchQuery: '' })

const statusFilter = ref<'all' | 'update' | 'disabled'>('all')

const manifests = ref<ModuleManifest[]>([])
const builtInIds = new Set(BUILT_IN_MODULES.map((m) => m.id))

// Remove dialog state
const removeDialogOpen = ref(false)
const removeTargetId = ref('')
const removeTargetName = ref('')

// Post-operation banner
const operationBannerMessage = ref<string | null>(null)
const operationBannerVariant = ref<BannerVariant>('success')

// Restart banner from install progress
const showInstallProgress = ref(false)

interface InstalledRow {
  id: string
  displayName: string
  description: string
  version: string
  installedAt: string | null
  catalogEntry: CatalogEntry | null
}

function resolvePluginName(manifest: ModuleManifest): string {
  const ns = sanitizeIdForI18n(manifest.id)
  return te(`${ns}.name`) ? t(`${ns}.name`) : manifest.name
}

function resolvePluginDesc(manifest: ModuleManifest): string {
  const ns = sanitizeIdForI18n(manifest.id)
  if (te(`${ns}.description`)) return t(`${ns}.description`)
  if (manifest.description) return manifest.description
  return t('moduleNoDescription')
}

const rows = computed<InstalledRow[]>(() =>
  manifests.value
    .filter((mf) => !builtInIds.has(mf.id))
    .map((mf) => {
      const catalogEntry = marketplace.catalog.value.find((c) => c.id === mf.id) ?? null
      return {
        id: mf.id,
        displayName: resolvePluginName(mf),
        description: resolvePluginDesc(mf),
        version: mf.version ?? '—',
        installedAt: mf.installedAt ?? null,
        catalogEntry,
      }
    })
)

const filteredRows = computed<InstalledRow[]>(() => {
  const q = props.searchQuery.toLowerCase().trim()
  return rows.value.filter((r) => {
    if (statusFilter.value === 'update') {
      const latest = r.catalogEntry?.latestVersion
      if (!latest || latest === r.version) return false
    }
    if (statusFilter.value === 'disabled' && !currentDisabled.value.includes(r.id)) return false
    if (!q) return true
    return (
      r.displayName.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q)
    )
  })
})

function isEnabled(id: string): boolean {
  return !currentDisabled.value.includes(id)
}

function openRemoveDialog(id: string, name: string) {
  removeTargetId.value = id
  removeTargetName.value = name
  removeDialogOpen.value = true
}

function handleRestart() {
  window.openPenApi?.relaunchApp()
}

async function confirmRemove() {
  removeDialogOpen.value = false
  const { ok, error } = await marketplace.removePlugin(removeTargetId.value)
  if (ok) {
    manifests.value = manifests.value.filter((m) => m.id !== removeTargetId.value)
    operationBannerVariant.value = 'success'
    operationBannerMessage.value = t('pluginRemovedBanner', { name: removeTargetName.value })
  } else {
    operationBannerVariant.value = 'error'
    operationBannerMessage.value = error ?? t('pluginRemoveFailed')
  }
}

let unsubManifests: (() => void) | null = null

onMounted(async () => {
  const [mfs] = await Promise.all([
    window.openPenApi?.getModuleManifests() ?? Promise.resolve([]),
    start(),
  ])
  manifests.value = mfs ?? []
  unsubManifests = window.openPenApi?.onModuleManifests((next) => {
    manifests.value = next
  }) ?? null
  marketplace.fetchCatalog()
})

onUnmounted(() => {
  stop()
  unsubManifests?.()
  unsubManifests = null
})
</script>

<template>
  <div class="installed-panel" v-auto-animate>
    <!-- Restart banner (from settings changes) -->
    <AppBanner v-if="pendingRestart" variant="warning" inline style="margin-bottom:12px;">
      {{ t('modulesRestartRequired') }}
    </AppBanner>

    <!-- Post-operation banner (remove/update result) -->
    <AppBanner v-if="operationBannerMessage" :variant="operationBannerVariant" style="margin-bottom:12px;">
      {{ operationBannerMessage }}
      <template #actions>
        <button class="cw-btn cw-btn-cancel" style="padding:4px 10px; font-size:12px;" @click="operationBannerMessage = null">
          {{ t('pluginLater') }}
        </button>
        <button v-if="operationBannerVariant === 'success'" class="cw-btn cw-btn-save" style="padding:4px 12px; font-size:12px;" @click="handleRestart">
          {{ t('pluginRestart') }}
        </button>
      </template>
    </AppBanner>

    <div v-if="rows.length === 0" class="modules-empty" data-testid="plugins-empty-state">
      {{ t('pluginsEmpty') }}
    </div>

    <template v-else>
      <!-- Status filter chips -->
      <div class="browse-chips">
        <button
          class="mp-filter-chip"
          :class="{ active: statusFilter === 'all' }"
          @click="statusFilter = 'all'"
        >{{ t('pluginFilterAll') }}</button>
        <button
          class="mp-filter-chip"
          :class="{ active: statusFilter === 'update' }"
          @click="statusFilter = 'update'"
        >{{ t('pluginFilterUpdate') }}</button>
        <button
          class="mp-filter-chip"
          :class="{ active: statusFilter === 'disabled' }"
          @click="statusFilter = 'disabled'"
        >{{ t('pluginFilterDisabled') }}</button>
      </div>

      <!-- Plugin list -->
      <ul class="pip-list" v-auto-animate>
        <ModuleRow
          v-for="row in filteredRows"
          :key="row.id"
          :id="row.id"
          :display-name="row.displayName"
          :description="row.description"
          :version="row.version"
          :installed-at="row.installedAt"
          :is-enabled="isEnabled(row.id)"
          :removable="true"
          :has-update="!!row.catalogEntry?.latestVersion && row.catalogEntry.latestVersion !== row.version"
          @update:enabled="(v) => toggleModule(row.id, v)"
          @remove="openRemoveDialog(row.id, row.displayName)"
        />
        <li v-if="filteredRows.length === 0" class="pip-filter-empty">
          {{ t('pluginBrowseEmpty') }}
        </li>
      </ul>
    </template>

    <!-- Remove confirmation dialog -->
    <PluginRemoveConfirmDialog
      v-model:open="removeDialogOpen"
      :plugin-id="removeTargetId"
      :plugin-name="removeTargetName"
      @confirm="confirmRemove"
    />

    <!-- Install progress (triggered by update action from installed row) -->
    <PluginInstallProgressDialog
      v-model:open="showInstallProgress"
      :plugin-id="marketplace.installingId.value ?? ''"
      :stage="marketplace.installStage.value"
      :percent="marketplace.installPercent.value"
      :error-message="marketplace.installError.value"
      @dismiss="() => { showInstallProgress = false; marketplace.resetInstallState() }"
      @restart="() => { showInstallProgress = false }"
      @retry="() => {}"
    />
  </div>
</template>

<style scoped>
.installed-panel { display: flex; flex-direction: column; gap: 0; }

.modules-empty {
  padding: 28px 0; text-align: center; font-size: 13px; color: var(--text-muted);
}

.browse-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
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

.pip-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pip-filter-empty {
  padding: 20px 12px; text-align: center; font-size: 13px; color: var(--text-muted);
}
</style>
