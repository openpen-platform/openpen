<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { AppDialog, AppBanner } from '@openpen/module-api/uikit'
import { sanitizeIdForI18n, resolveLabel } from '@openpen/module-api'
import type { OpenPenModule } from '@openpen/module-api'
import { BUILT_IN_MODULES } from '../../core/modules/registry'
import { useModulesPanel } from '../../composables/useModulesPanel'
import ModuleRow from './ModuleRow.vue'

const props = withDefaults(defineProps<{ searchQuery?: string }>(), { searchQuery: '' })

const { t, te, locale } = useI18n()
const { currentDisabled, pendingRestart, toggleModule, start, stop } = useModulesPanel()

const moduleById = new Map<string, OpenPenModule>(BUILT_IN_MODULES.map((m) => [m.id, m]))

interface BuiltInRow {
  id: string
  displayName: string
  description: string
}

function resolveName(id: string): string {
  const ns = sanitizeIdForI18n(id)
  if (te(`${ns}.name`)) return t(`${ns}.name`)
  const meta = moduleById.get(id)?.metadata
  if (meta?.name) {
    const label = resolveLabel(meta.name, locale.value)
    if (label) return label
  }
  return id
}

function resolveDescription(id: string): string {
  const ns = sanitizeIdForI18n(id)
  if (te(`${ns}.description`)) return t(`${ns}.description`)
  const meta = moduleById.get(id)?.metadata
  if (meta?.description) {
    const label = resolveLabel(meta.description, locale.value)
    if (label) return label
  }
  return t('moduleNoDescription')
}

const allRows = computed<BuiltInRow[]>(() =>
  BUILT_IN_MODULES.map((m) => ({
    id: m.id,
    displayName: resolveName(m.id),
    description: resolveDescription(m.id),
  })),
)

const rows = computed<BuiltInRow[]>(() => {
  const q = props.searchQuery.toLowerCase().trim()
  if (!q) return allRows.value
  return allRows.value.filter(
    (r) =>
      r.displayName.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      r.description.toLowerCase().includes(q),
  )
})

function isEnabled(id: string): boolean {
  return !currentDisabled.value.includes(id)
}

const pendingConfirm = ref<{ id: string; name: string } | null>(null)
const confirmDialogOpen = computed(() => pendingConfirm.value !== null)

function handleToggle(id: string, name: string, nextEnabled: boolean): void {
  if (!nextEnabled) {
    pendingConfirm.value = { id, name }
  } else {
    void toggleModule(id, true)
  }
}

async function confirmDisable(): Promise<void> {
  if (!pendingConfirm.value) return
  await toggleModule(pendingConfirm.value.id, false)
  pendingConfirm.value = null
}

function cancelDisable(): void {
  pendingConfirm.value = null
}

onMounted(() => { void start() })
onUnmounted(() => { stop() })
</script>

<template>
  <div class="cw-section" v-auto-animate>
    <AppBanner variant="info" inline style="margin-bottom:12px;">
      {{ t('modulesBuiltInDescription') }}
    </AppBanner>

    <AppBanner v-if="pendingRestart" variant="warning" inline style="margin-bottom:12px;" data-testid="modules-restart-banner">
      {{ t('modulesRestartRequired') }}
    </AppBanner>

    <div v-if="rows.length === 0" class="modules-empty" data-testid="modules-empty">
      {{ t('pluginBrowseEmpty') }}
    </div>

    <ul v-else class="modules-list" data-testid="modules-list">
      <ModuleRow
        v-for="row in rows"
        :key="row.id"
        :id="row.id"
        :display-name="row.displayName"
        :description="row.description"
        :is-enabled="isEnabled(row.id)"
        @update:enabled="(v) => handleToggle(row.id, row.displayName, v)"
      />
    </ul>

    <AppDialog
      modal-id="settings-disable-builtin"
      :title="t('disableBuiltInTitle')"
      :open="confirmDialogOpen"
      persistent
      danger
      @update:open="(v) => { if (!v) cancelDisable() }"
    >
      <template #trigger>
        <!-- programmatically controlled — no trigger slot needed -->
        <span />
      </template>
      <p class="dialog-body-text">
        {{ pendingConfirm ? t('disableBuiltInBody', { name: pendingConfirm.name }) : '' }}
      </p>
      <template #footer>
        <button class="dialog-btn dialog-btn-cancel" @click="cancelDisable">
          {{ t('cancel') }}
        </button>
        <button class="dialog-btn dialog-btn-danger" @click="confirmDisable">
          {{ t('disableBuiltInConfirm') }}
        </button>
      </template>
    </AppDialog>
  </div>
</template>

<style scoped>
.cw-section { margin-bottom: 24px; }

.cw-section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.modules-empty {
  padding: 28px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}

.modules-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.dialog-body-text {
  font-size: 13px;
  color: var(--text-primary);
  line-height: 1.6;
  margin: 0;
}

.dialog-btn {
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 150ms;
}

.dialog-btn-cancel {
  background: var(--cancel-btn-bg);
  color: var(--text-dim);
  border: 1px solid var(--border);
}

.dialog-btn-cancel:hover {
  background: var(--cancel-btn-hover-bg);
  color: var(--text-primary);
}

.dialog-btn-danger {
  background: #dc2626;
  color: #fff;
}

.dialog-btn-danger:hover {
  background: #b91c1c;
}
</style>
