<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { AppBanner } from '@openpen/module-api/uikit'
import HotkeyInput from './HotkeyInput.vue'
import { DEFAULT_SHORTCUTS } from '../../types/settings'
import type { UserShortcuts } from '../../types/settings'
import type { ShortcutContribution } from '@openpen/module-api'
import { sanitizeIdForI18n } from '@openpen/module-api'
import { getSlotEntries } from '../../core/runtime/contribution-store'
import { resolveLabel } from '../../services/i18n-utils'
import { formatAccelerator, type Platform } from '../../utils/format-accelerator'

const platform: Platform = (window.openPenApi?.platform ?? 'darwin') as Platform

const { t, locale } = useI18n()

const shortcuts = ref<UserShortcuts>({ ...DEFAULT_SHORTCUTS })
const moduleShortcutsOverrides = ref<Record<string, string>>({})
const shortcutConflicts = ref<Set<string>>(new Set())

const shortcutsSnapshot = ref<UserShortcuts | null>(null)
const moduleOverridesSnapshot = ref<Record<string, string> | null>(null)
const shortcutError = ref('')

let unsub: (() => void) | null = null
let unsubModuleShortcuts: (() => void) | null = null
let unsubConflicts: (() => void) | null = null

onMounted(async () => {
  const current = await window.openPenApi?.getShortcuts()
  if (current) {
    shortcuts.value = current
    shortcutsSnapshot.value = { ...current }
  }
  unsub = window.openPenApi?.onShortcutsUpdated((s) => { shortcuts.value = s }) ?? null

  const moduleOverrides = await window.openPenApi?.getModuleShortcuts()
  if (moduleOverrides) {
    moduleShortcutsOverrides.value = moduleOverrides
    moduleOverridesSnapshot.value = { ...moduleOverrides }
  }
  unsubModuleShortcuts = window.openPenApi?.onModuleShortcutsUpdated((overrides) => {
    moduleShortcutsOverrides.value = overrides
  }) ?? null

  const conflicts = await window.openPenApi?.getShortcutConflicts()
  if (conflicts) shortcutConflicts.value = new Set(conflicts)
  unsubConflicts = window.openPenApi?.onShortcutConflictsUpdated((c) => {
    shortcutConflicts.value = new Set(c)
  }) ?? null
})

onUnmounted(() => {
  unsub?.()
  unsubModuleShortcuts?.()
  unsubConflicts?.()
})

function updateShortcut(id: keyof UserShortcuts, accel: string) {
  shortcuts.value = { ...shortcuts.value, [id]: accel }
}

const SYSTEM_ROWS: Array<{ id: keyof UserShortcuts; labelKey: string; subKey: string }> = [
  { id: 'toggleDrawingMode', labelKey: 'shortcutToggleDrawingMode', subKey: 'shortcutToggleDrawingModeSub' },
  { id: 'undo',              labelKey: 'shortcutUndo',              subKey: 'shortcutUndoSub' },
  { id: 'redo',              labelKey: 'shortcutRedo',              subKey: 'shortcutRedoSub' },
  { id: 'quitApp',           labelKey: 'shortcutQuitApp',           subKey: 'shortcutQuitAppSub' },
]

interface ModuleShortcutEntry {
  contribution: ShortcutContribution
  namespacedId: string
}

interface ModuleShortcutGroup {
  moduleId: string
  moduleLabel: string
  shortcuts: ModuleShortcutEntry[]
}

const moduleShortcutGroups = computed<ModuleShortcutGroup[]>(() => {
  const entries = getSlotEntries<ShortcutContribution>('system.shortcuts').value
  const groups = new Map<string, ModuleShortcutGroup>()

  for (const entry of entries) {
    const sc = entry.contribution
    if (!sc.label) continue

    const moduleId = entry.moduleId
    if (!groups.has(moduleId)) {
      const ns = sanitizeIdForI18n(moduleId)
      const moduleLabel = t(`${ns}.name`, moduleId)
      groups.set(moduleId, { moduleId, moduleLabel, shortcuts: [] })
    }
    groups.get(moduleId)!.shortcuts.push({
      contribution: sc,
      namespacedId: `${moduleId}/${sc.id}`,
    })
  }

  return Array.from(groups.values())
})

const hasChanges = computed(() => {
  if (!shortcutsSnapshot.value) return false

  const builtinChanged = SYSTEM_ROWS.some((row) => shortcuts.value[row.id] !== shortcutsSnapshot.value![row.id])

  const snap = moduleOverridesSnapshot.value ?? {}
  const cur = moduleShortcutsOverrides.value
  const moduleChanged =
    Object.keys(snap).length !== Object.keys(cur).length ||
    Object.keys(cur).some((k) => cur[k] !== snap[k]) ||
    Object.keys(snap).some((k) => !(k in cur))

  return builtinChanged || moduleChanged
})
</script>

<template>
  <div class="shortcuts-tab">
    <AppBanner v-if="shortcutError" variant="error" inline>{{ shortcutError }}</AppBanner>
    <AppBanner v-else-if="hasChanges" variant="info" inline>{{ t('shortcutNote') }}</AppBanner>

    <!-- System shortcuts -->
    <div class="cw-section">
      <div class="cw-section-title">{{ t('sectionSystem') }}</div>

      <div v-for="row in SYSTEM_ROWS" :key="row.id" class="cw-row">
        <div>
          <div class="cw-row-label">{{ t(row.labelKey) }}</div>
          <div class="cw-row-sub">{{ t(row.subKey) }}</div>
        </div>
        <HotkeyInput
          :model-value="shortcuts[row.id]"
          :default-value="DEFAULT_SHORTCUTS[row.id]"
          :shortcut-id="row.id"
          @update:model-value="updateShortcut(row.id, $event)"
          @shortcut-error="shortcutError = $event"
        />
      </div>
    </div>

    <!-- Module-contributed shortcuts -->
    <div v-for="group in moduleShortcutGroups" :key="group.moduleId" class="cw-section">
      <div class="cw-section-title">{{ group.moduleLabel }}</div>
      <div v-for="sc in group.shortcuts" :key="sc.namespacedId" class="cw-row">
        <div>
          <div class="cw-row-label">{{ resolveLabel(sc.contribution.label!, locale) }}</div>
          <div v-if="sc.contribution.sublabel" class="cw-row-sub">{{ resolveLabel(sc.contribution.sublabel, locale) }}</div>
        </div>
        <HotkeyInput
          v-if="sc.contribution.userCustomizable"
          :model-value="moduleShortcutsOverrides[sc.namespacedId] ?? sc.contribution.keys"
          :default-value="sc.contribution.keys"
          :shortcut-id="sc.namespacedId"
          :has-conflict="shortcutConflicts.has(sc.namespacedId)"
          @update:model-value="(v: string) => { moduleShortcutsOverrides[sc.namespacedId] = v }"
          @shortcut-error="shortcutError = $event"
        />
        <kbd v-else class="sc-key">{{ formatAccelerator(sc.contribution.keys, platform) }}</kbd>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shortcuts-tab {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.cw-section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 8px;
}
.cw-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--row-bg);
  border: 1px solid var(--border);
  margin-bottom: 6px;
  gap: 12px;
}
.cw-row-label { font-size: 13.5px; font-weight: 500; }
.cw-row-sub   { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }

.sc-key {
  font-family: -apple-system, 'SF Mono', ui-monospace, monospace;
  font-size: 11px;
  padding: 3px 7px;
  border-radius: 5px;
  background: var(--row-bg);
  border: 1px solid var(--border);
  color: var(--text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
