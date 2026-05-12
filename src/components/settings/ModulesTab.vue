<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import ModulesBuiltInPanel from './ModulesBuiltInPanel.vue'
import PluginsInstalledPanel from './plugins/PluginsInstalledPanel.vue'
import PluginsBrowsePanel from './plugins/PluginsBrowsePanel.vue'
import PluginAddCustomDialog from './plugins/PluginAddCustomDialog.vue'
import PluginInstallProgressDialog from './plugins/PluginInstallProgressDialog.vue'
import PluginActionConfirmDialog from './plugins/PluginActionConfirmDialog.vue'
import PluginUpgradeConfirmDialog from './plugins/PluginUpgradeConfirmDialog.vue'
import { usePluginMarketplace } from '../../composables/usePluginMarketplace'
import type { LocalInstallKind } from '../../composables/usePluginMarketplace'

const { t } = useI18n()

type ModulesTab = 'builtin' | 'installed' | 'marketplace'

const activeTab = ref<ModulesTab>('marketplace')
const searchQuery = ref('')
const addCustomOpen = ref(false)
const marketplace = usePluginMarketplace()
const { installStage, installPercent, installError } = marketplace

const progressOpen = ref(false)
const progressPluginId = ref('')

const pendingLocalSource = ref<string | null>(null)
const pendingLocalNext = ref<{ id: string; version: string; displayName: string } | null>(null)
const pendingLocalCurrent = ref<string | undefined>(undefined)
const localInstallKind = ref<LocalInstallKind | null>(null)

interface ConfirmDialogState {
  severity: 'neutral' | 'danger'
  title: string
  body: string
  confirmLabel: string
  onConfirm: () => void
}
const confirmDialog = ref<ConfirmDialogState | null>(null)

interface UpgradeDialogState {
  pluginId: string
  displayName: string
  currentVersion: string
  nextVersion: string
  description?: string
  changelog?: string[]
}
const upgradeDialog = ref<UpgradeDialogState | null>(null)

const effectiveOperationKind = computed<'install' | 'upgrade' | 'reinstall' | 'downgrade'>(() => {
  const k = localInstallKind.value
  if (k === 'upgrade' || k === 'reinstall' || k === 'downgrade') return k
  return 'install'
})

function basenameLabel(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? p
}

async function runLocalInstall() {
  confirmDialog.value = null
  if (!pendingLocalSource.value) return
  progressPluginId.value = pendingLocalNext.value?.displayName ?? basenameLabel(pendingLocalSource.value)
  progressOpen.value = true
  const res = await marketplace.addFromLocal(pendingLocalSource.value)
  if (res.ok) activeTab.value = 'installed'
}

async function handleInstallLocal(sourcePath: string) {
  addCustomOpen.value = false
  const inspect = await marketplace.inspectLocal(sourcePath)
  if (!inspect.ok) {
    localInstallKind.value = null
    progressPluginId.value = basenameLabel(sourcePath)
    progressOpen.value = true
    marketplace.markFailed(inspect.error)
    return
  }
  const { kind, next, current } = inspect.result
  pendingLocalSource.value = sourcePath
  pendingLocalNext.value = next
  pendingLocalCurrent.value = current
  localInstallKind.value = kind
  if (kind === 'fresh') {
    await runLocalInstall()
  } else if (kind === 'upgrade') {
    upgradeDialog.value = {
      pluginId: next.id,
      displayName: next.displayName,
      currentVersion: current ?? '',
      nextVersion: next.version,
      description: next.description,
      changelog: next.changelog,
    }
  } else if (kind === 'reinstall') {
    confirmDialog.value = {
      severity: 'neutral',
      title: t('pluginReinstallConfirmTitle'),
      body: t('pluginReinstallConfirmBody', { name: next.displayName, version: next.version }),
      confirmLabel: t('pluginReinstallConfirmAction'),
      onConfirm: runLocalInstall,
    }
  } else {
    confirmDialog.value = {
      severity: 'danger',
      title: t('pluginDowngradeConfirmTitle'),
      body: t('pluginDowngradeConfirmBody', { name: next.displayName, currentVersion: current, nextVersion: next.version }),
      confirmLabel: t('pluginDowngradeConfirmAction'),
      onConfirm: runLocalInstall,
    }
  }
}

async function handleInstallGitHub(repoUrl: string) {
  addCustomOpen.value = false
  localInstallKind.value = null
  progressPluginId.value = basenameLabel(repoUrl)
  progressOpen.value = true
  const res = await marketplace.addFromGitHubRepo(repoUrl)
  if (res.ok) activeTab.value = 'installed'
}

function handleProgressDismiss() {
  progressOpen.value = false
  localInstallKind.value = null
  marketplace.resetInstallState()
}

function handleProgressRestart() {
  window.openPenApi?.relaunchApp()
}

function handleProgressRetry() {
  progressOpen.value = false
  localInstallKind.value = null
  marketplace.resetInstallState()
  addCustomOpen.value = true
}

function handleConfirm() {
  const cb = confirmDialog.value?.onConfirm
  confirmDialog.value = null
  cb?.()
}

function handleUpgradeConfirm() {
  upgradeDialog.value = null
  void runLocalInstall()
}
</script>

<template>
  <div>
    <!-- Unified search -->
    <div class="mt-search-wrap">
      <svg class="mt-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" style="pointer-events:none;">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        v-model="searchQuery"
        type="text"
        class="mt-search-input"
        :placeholder="t('pluginSearch')"
        :aria-label="t('pluginSearch')"
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    <!-- Tab row + Add source -->
    <div class="mt-tab-row">
      <nav class="mt-sub-tabs" aria-label="Modules sub-navigation">
        <button
          class="mt-sub-tab"
          :class="{ active: activeTab === 'marketplace' }"
          @click="activeTab = 'marketplace'"
        >{{ t('pluginsSubtabMarketplace') }}</button>
        <button
          class="mt-sub-tab"
          :class="{ active: activeTab === 'installed' }"
          @click="activeTab = 'installed'"
        >{{ t('pluginsSubtabInstalled') }}</button>
        <button
          class="mt-sub-tab"
          :class="{ active: activeTab === 'builtin' }"
          @click="activeTab = 'builtin'"
        >{{ t('modulesSubtabBuiltIn') }}</button>
      </nav>
      <button
        v-if="activeTab !== 'builtin'"
        class="mt-add-source-btn"
        @click="addCustomOpen = true"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        {{ t('pluginsAddSource') }}
      </button>
    </div>

    <!-- Panel content -->
    <div v-auto-animate>
      <ModulesBuiltInPanel
        v-if="activeTab === 'builtin'"
        :search-query="searchQuery"
      />
      <PluginsInstalledPanel
        v-else-if="activeTab === 'installed'"
        :search-query="searchQuery"
      />
      <PluginsBrowsePanel
        v-else-if="activeTab === 'marketplace'"
        :search-query="searchQuery"
      />
    </div>

    <!-- Add custom source modal -->
    <PluginAddCustomDialog
      v-model:open="addCustomOpen"
      @install-local="handleInstallLocal"
      @install-git-hub="handleInstallGitHub"
    />

    <!-- Reinstall / downgrade confirm -->
    <PluginActionConfirmDialog
      v-if="confirmDialog"
      :open="!!confirmDialog"
      :severity="confirmDialog.severity"
      :title="confirmDialog.title"
      :body="confirmDialog.body"
      :confirm-label="confirmDialog.confirmLabel"
      @update:open="(v) => { if (!v) confirmDialog = null }"
      @confirm="handleConfirm"
    />

    <!-- Upgrade confirm dialog -->
    <PluginUpgradeConfirmDialog
      v-if="upgradeDialog"
      :open="!!upgradeDialog"
      :plugin-id="upgradeDialog.pluginId"
      :display-name="upgradeDialog.displayName"
      :current-version="upgradeDialog.currentVersion"
      :next-version="upgradeDialog.nextVersion"
      :description="upgradeDialog.description"
      :changelog="upgradeDialog.changelog"
      @update:open="(v) => { if (!v) upgradeDialog = null }"
      @confirm="handleUpgradeConfirm"
    />

    <!-- Install progress modal -->
    <PluginInstallProgressDialog
      :open="progressOpen"
      :plugin-id="progressPluginId"
      :version="pendingLocalNext?.version"
      :current-version="pendingLocalCurrent"
      :stage="installStage"
      :percent="installPercent"
      :error-message="installError"
      :operation-kind="effectiveOperationKind"
      @dismiss="handleProgressDismiss"
      @restart="handleProgressRestart"
      @retry="handleProgressRetry"
    />
  </div>
</template>

<style scoped>
.mt-search-wrap {
  position: relative;
  margin-bottom: 12px;
}
.mt-search-icon {
  position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted);
}
.mt-search-input {
  width: 100%; padding: 7px 12px 7px 32px; background: var(--input-bg);
  border: 1px solid var(--border-hi); border-radius: var(--radius-sm);
  color: var(--text-primary); font-size: 13px; outline: none; box-sizing: border-box;
}
.mt-search-input:focus { border-color: rgba(129, 140, 248, 0.5); }

.mt-tab-row {
  display: flex; align-items: center; gap: 8px; margin-bottom: 16px;
}

.mt-sub-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
}

.mt-sub-tab {
  padding: 5px 14px;
  font-size: 12.5px;
  font-weight: 500;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--radius-full);
  cursor: pointer;
  white-space: nowrap;
  outline: none;
  transition: background var(--t-fast), color var(--t-fast);
}

.mt-sub-tab:hover { color: var(--text-dim); }

.mt-sub-tab.active {
  background: var(--surface-hi);
  color: var(--text-primary);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.20);
}

.mt-add-source-btn {
  margin-left: auto; display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px; font-size: 13px; font-weight: 500; color: var(--accent);
  background: transparent; border: 1px solid rgba(129, 140, 248, 0.45);
  border-radius: var(--radius-full); cursor: pointer; flex-shrink: 0;
  transition: background var(--t-fast), border-color var(--t-fast);
}
.mt-add-source-btn:hover {
  background: var(--accent-bg); border-color: rgba(129, 140, 248, 0.70);
}
</style>
