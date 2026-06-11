<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, shallowRef } from 'vue'
import type { Component } from 'vue'
import { useI18n } from 'vue-i18n'
import { VueDraggable } from 'vue-draggable-plus'
import {
  DEFAULT_CONTROL_BAR_LAYOUT,
  repairLayoutL3a,
  repairLayoutL3b,
  type ControlBarLayout,
  type LayoutGroup,
} from '@openpen/module-api'
import { useDialog } from '@openpen/module-api/uikit'
import { getSlotEntries } from '../../core/runtime/contribution-store'

const { t } = useI18n()
const dialog = useDialog()

const DEFAULT_GROUP_ID = 'default'
const SEPARATOR_VALUES = ['auto', 'always', 'never'] as const

// ── Known contributions (source of truth for ghost detection + previews) ────
//
// Each control-bar contribution carries its own id, owning moduleId, and Vue
// component. We render the component itself for visual parity with the live
// control bar; ghost ids (no matching contribution) fall back to the raw id.
const contributionEntries = getSlotEntries<{ id: string; component: Component }>('ui.control-bar')

const componentById = computed(() => {
  const map = new Map<string, Component>()
  for (const entry of contributionEntries.value) {
    map.set(entry.contribution.id, entry.contribution.component)
  }
  return map
})

function isGhost(itemId: string): boolean {
  return !componentById.value.has(itemId)
}

function previewComponent(itemId: string): Component | null {
  return componentById.value.get(itemId) ?? null
}

/** Item id doubles as a stable, human-recognizable label (e.g. 'freehand'). */
function itemLabel(itemId: string): string {
  return itemId
}

// ── Working layout (display copy — main process is authoritative) ───────────
//
// `setLayout` writes to config.json and broadcasts back through
// `onLayoutUpdated`. The renderer never persists layout itself; this ref is a
// view model that VueDraggable mutates in place, after which `persist()` ships
// the reconciled result to main.
const workingGroups = ref<LayoutGroup[]>([])
const layoutVersion = shallowRef<1>(1)

/** True while applying a broadcast from main, to suppress the echo persist. */
let applyingRemote = false

function adoptLayout(layout: ControlBarLayout): void {
  layoutVersion.value = layout.version
  workingGroups.value = layout.groups.map((g) => ({
    id: g.id,
    items: [...g.items],
    separator: g.separator,
    inset: g.inset,
  }))
}

function currentLayout(): ControlBarLayout {
  return {
    version: layoutVersion.value,
    groups: workingGroups.value.map((g) => ({
      id: g.id,
      items: [...g.items],
      separator: g.separator,
      inset: g.inset,
    })),
  }
}

/**
 * Reconcile the working layout into a schema-valid shape, then push it to
 * main. Reconciliation guarantees the 'default' group exists and that no item
 * id appears in two groups (the latter can happen mid-drag before the source
 * list updates). The L3b pass receives the full known-id set but only trims
 * ghosts past the corruption threshold — explicit ghost removal is a separate
 * user action below.
 */
async function persist(): Promise<void> {
  if (applyingRemote) return
  const knownIds = new Set(componentById.value.keys())
  const ghostIds = workingGroups.value.flatMap((g) => g.items).filter((id) => !knownIds.has(id))
  // Preserve ghost ids through reconcile: they are valid persisted state.
  const knownPlusGhost = new Set([...knownIds, ...ghostIds])
  const afterL3a = repairLayoutL3a(currentLayout()).layout
  const reconciled = repairLayoutL3b(afterL3a, knownPlusGhost).layout
  adoptLayout(reconciled)
  // JSON round-trip strips Vue reactive Proxies before IPC. The reconcile
  // helpers shallow-spread group objects whose items/inset still reference the
  // reactive working copy, so passing `reconciled` straight to ipcRenderer.invoke
  // throws "An object could not be cloned" and the layout never persists.
  await window.openPenApi?.setLayout(JSON.parse(JSON.stringify(reconciled)))
}

// A cross-group drag fires the source list's `@end` and the target list's
// `@add` for one logical move; debouncing collapses that pair (and any rapid
// successive drags) into a single disk write. Intra-group reorder fires only
// `@end`, still one write.
const PERSIST_DEBOUNCE_MS = 500
let persistTimer: ReturnType<typeof setTimeout> | null = null

function persistDebounced(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    void persist()
  }, PERSIST_DEBOUNCE_MS)
}

function flushPersist(): void {
  if (!persistTimer) return
  clearTimeout(persistTimer)
  persistTimer = null
  void persist()
}

// ── Group operations ────────────────────────────────────────────────────────

function isProtected(groupId: string): boolean {
  return groupId === DEFAULT_GROUP_ID
}

function uniqueGroupId(): string {
  const existing = new Set(workingGroups.value.map((g) => g.id))
  let n = 1
  let candidate = `group-${n}`
  while (existing.has(candidate)) {
    n += 1
    candidate = `group-${n}`
  }
  return candidate
}

async function addGroup(): Promise<void> {
  const id = uniqueGroupId()
  const defaultIdx = workingGroups.value.findIndex((g) => g.id === DEFAULT_GROUP_ID)
  const newGroup: LayoutGroup = { id, items: [], separator: 'auto' }
  if (defaultIdx >= 0) {
    workingGroups.value.splice(defaultIdx, 0, newGroup)
  } else {
    workingGroups.value.push(newGroup)
  }
  await persist()
}

async function deleteGroup(groupId: string): Promise<void> {
  if (isProtected(groupId)) return
  const ok = await dialog.confirm({
    title: t('layoutDeleteGroupConfirmTitle'),
    message: t('layoutDeleteGroupConfirmMessage'),
    okLabel: t('layoutConfirmOk'),
    cancelLabel: t('layoutConfirmCancel'),
    danger: true,
  })
  if (!ok) return
  const group = workingGroups.value.find((g) => g.id === groupId)
  const orphans = group ? [...group.items] : []
  workingGroups.value = workingGroups.value.filter((g) => g.id !== groupId)
  // Re-home orphaned items into 'default'.
  const fallback = workingGroups.value.find((g) => g.id === DEFAULT_GROUP_ID)
  if (fallback && orphans.length > 0) fallback.items.push(...orphans)
  await persist()
}

async function setSeparator(groupId: string, value: 'auto' | 'always' | 'never'): Promise<void> {
  const group = workingGroups.value.find((g) => g.id === groupId)
  if (!group) return
  group.separator = value
  await persist()
}

// ── Ghost operations ─────────────────────────────────────────────────────────

const hasGhosts = computed(() => {
  const known = componentById.value
  return workingGroups.value.some((g) => g.items.some((id) => !known.has(id)))
})

async function removeGhost(groupId: string, itemId: string): Promise<void> {
  const group = workingGroups.value.find((g) => g.id === groupId)
  if (!group) return
  group.items = group.items.filter((id) => id !== itemId)
  await persist()
}

async function cleanGhosts(): Promise<void> {
  const ok = await dialog.confirm({
    title: t('layoutCleanGhostsConfirmTitle'),
    message: t('layoutCleanGhostsConfirmMessage'),
    okLabel: t('layoutConfirmOk'),
    cancelLabel: t('layoutConfirmCancel'),
    danger: true,
  })
  if (!ok) return
  const known = componentById.value
  const cleaned = workingGroups.value
    .map((g) => ({ ...g, items: g.items.filter((id) => known.has(id)) }))
    .filter((g) => g.id === DEFAULT_GROUP_ID || g.items.length > 0)
  workingGroups.value = cleaned
  await persist()
}

async function resetLayout(): Promise<void> {
  const ok = await dialog.confirm({
    title: t('layoutResetConfirmTitle'),
    message: t('layoutResetConfirmMessage'),
    okLabel: t('layoutConfirmOk'),
    cancelLabel: t('layoutConfirmCancel'),
    danger: true,
  })
  if (!ok) return
  adoptLayout(DEFAULT_CONTROL_BAR_LAYOUT)
  await persist()
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

let unsubscribe: (() => void) | null = null

onMounted(async () => {
  const layout = await window.openPenApi?.getLayout()
  if (layout) adoptLayout(layout)
  unsubscribe = window.openPenApi?.onLayoutUpdated((next) => {
    applyingRemote = true
    adoptLayout(next)
    applyingRemote = false
  }) ?? null
})

onUnmounted(() => {
  flushPersist()
  unsubscribe?.()
})
</script>

<template>
  <div class="layout-tab" data-testid="settings-layout-tab-panel">
    <div class="lt-header">
      <div>
        <div class="lt-title">{{ t('layoutTitle') }}</div>
        <p class="lt-desc">{{ t('layoutDescription') }}</p>
      </div>
    </div>

    <div class="lt-toolbar">
      <button
        class="lt-action-btn"
        data-testid="settings-layout-add-group-btn"
        @click="addGroup"
      >
        {{ t('layoutAddGroup') }}
      </button>
      <button
        class="lt-action-btn"
        :disabled="!hasGhosts"
        data-testid="settings-layout-clean-ghosts-btn"
        @click="cleanGhosts"
      >
        {{ t('layoutCleanGhosts') }}
      </button>
      <button
        class="lt-action-btn lt-action-danger"
        data-testid="settings-layout-reset-btn"
        @click="resetLayout"
      >
        {{ t('layoutReset') }}
      </button>
    </div>

    <VueDraggable
      v-model="workingGroups"
      :animation="160"
      :force-fallback="true"
      handle=".lt-group-handle"
      group="layout-groups"
      class="lt-groups"
      data-testid="settings-layout-group-list"
      @end="persistDebounced"
    >
      <div
        v-for="group in workingGroups"
        :key="group.id"
        class="lt-group"
        :class="{ 'lt-group-protected': isProtected(group.id) }"
        :data-testid="`settings-layout-group-${group.id}`"
      >
        <div class="lt-group-head">
          <span class="lt-group-handle" aria-hidden="true">⋮⋮</span>
          <span class="lt-group-id">
            {{ group.id === 'default' ? t('layoutGroupDefault') : group.id }}
          </span>
          <span v-if="isProtected(group.id)" class="lt-protected-chip">
            {{ t('layoutGroupProtected') }}
          </span>

          <span class="lt-spacer" />

          <label class="lt-sep">
            <span class="lt-sep-label">{{ t('layoutSeparatorLabel') }}</span>
            <select
              class="lt-sep-select"
              :value="group.separator ?? 'auto'"
              :data-testid="`settings-layout-group-${group.id}-separator-select`"
              @change="setSeparator(group.id, ($event.target as HTMLSelectElement).value as 'auto' | 'always' | 'never')"
            >
              <option v-for="opt in SEPARATOR_VALUES" :key="opt" :value="opt">
                {{ t(`layoutSeparator${opt.charAt(0).toUpperCase() + opt.slice(1)}` as never) }}
              </option>
            </select>
          </label>

          <button
            v-if="!isProtected(group.id)"
            class="lt-group-delete"
            :data-testid="`settings-layout-delete-group-${group.id}-btn`"
            @click="deleteGroup(group.id)"
          >
            {{ t('layoutDeleteGroup') }}
          </button>
        </div>

        <VueDraggable
          v-model="group.items"
          :animation="160"
          :force-fallback="true"
          group="layout-items"
          class="lt-items"
          :class="{ 'lt-items-empty': group.items.length === 0 }"
          @end="persistDebounced"
          @add="persistDebounced"
        >
          <div
            v-for="itemId in group.items"
            :key="itemId"
            class="lt-item"
            :class="{ 'lt-item-ghost': isGhost(itemId) }"
            :data-testid="isGhost(itemId) ? `settings-layout-ghost-${itemId}` : `settings-layout-item-${itemId}`"
          >
            <span class="lt-item-grip" aria-hidden="true">⋮⋮</span>

            <span v-if="previewComponent(itemId)" class="lt-item-preview">
              <component :is="previewComponent(itemId)" />
            </span>

            <span class="lt-item-label">{{ itemLabel(itemId) }}</span>

            <template v-if="isGhost(itemId)">
              <span class="lt-ghost-badge">{{ t('layoutGhostBadge') }}</span>
              <button
                class="lt-ghost-remove"
                :data-testid="`settings-layout-remove-ghost-${itemId}-btn`"
                @click="removeGhost(group.id, itemId)"
              >
                {{ t('layoutRemoveGhost') }}
              </button>
            </template>
          </div>

          <div v-if="group.items.length === 0" class="lt-empty-hint">
            {{ t('layoutEmptyGroup') }}
          </div>
        </VueDraggable>
      </div>
    </VueDraggable>
  </div>
</template>

<style scoped>
.layout-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.lt-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.lt-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 8px;
}
.lt-desc {
  font-size: 12.5px;
  color: var(--text-dim);
  margin: 0;
  line-height: 1.5;
}

.lt-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.lt-action-btn {
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-hi);
  background: var(--cancel-btn-bg);
  color: var(--text-dim);
  transition: background 150ms, color 150ms;
}
.lt-action-btn:hover:not(:disabled) {
  background: var(--cancel-btn-hover-bg);
  color: var(--text-primary);
}
.lt-action-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.lt-action-danger {
  border-color: rgba(248, 113, 113, 0.4);
  color: #f87171;
}
.lt-action-danger:hover:not(:disabled) {
  background: rgba(248, 113, 113, 0.12);
  color: #f87171;
}

.lt-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.lt-group {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--row-bg);
  padding: 10px 12px;
}
.lt-group-protected {
  border-color: var(--border-hi);
}

.lt-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.lt-group-handle {
  cursor: grab;
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  user-select: none;
}
.lt-group-handle:active {
  cursor: grabbing;
}
.lt-group-id {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.lt-protected-chip {
  font-size: 10.5px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 99px;
  background: rgba(99, 102, 241, 0.12);
  color: var(--accent);
  border: 1px solid rgba(99, 102, 241, 0.22);
}
.lt-spacer {
  flex: 1;
}

.lt-sep {
  display: flex;
  align-items: center;
  gap: 6px;
}
.lt-sep-label {
  font-size: 11.5px;
  color: var(--text-muted);
}
.lt-sep-select {
  font-size: 12px;
  padding: 3px 6px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--cancel-btn-bg);
  color: var(--text-dim);
  cursor: pointer;
}

.lt-group-delete {
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  transition: background 150ms, color 150ms, border-color 150ms;
}
.lt-group-delete:hover {
  border-color: rgba(248, 113, 113, 0.4);
  color: #f87171;
}

.lt-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 44px;
  padding: 6px;
  border-radius: 8px;
}
.lt-items-empty {
  border: 1px dashed var(--border);
}

.lt-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px 4px 6px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--cancel-btn-bg);
  cursor: grab;
}
.lt-item:active {
  cursor: grabbing;
}
.lt-item-ghost {
  background: rgba(120, 120, 120, 0.12);
  border-style: dashed;
  opacity: 0.85;
}
.lt-item-grip {
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1;
  user-select: none;
}
/* The live preview is identity-only; never let drag clicks reach the
   contributed button (it would emit tool / IPC side-effects). */
.lt-item-preview {
  display: inline-flex;
  align-items: center;
  pointer-events: none;
}
.lt-item-label {
  font-size: 12px;
  color: var(--text-dim);
}
.lt-ghost-badge {
  font-size: 11px;
  color: #f59e0b;
  font-weight: 600;
}
.lt-ghost-remove {
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
}
.lt-ghost-remove:hover {
  border-color: rgba(248, 113, 113, 0.4);
  color: #f87171;
}

.lt-empty-hint {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
  padding: 6px 4px;
}
</style>
