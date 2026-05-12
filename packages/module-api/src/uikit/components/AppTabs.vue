<script setup lang="ts">
/**
 * AppTabs — High-level wrapper (Layer 1).
 *
 * Wraps Reka UI Tabs (TabsRoot / TabsList / TabsTrigger / TabsContent).
 * Intended for settings UI tabbed navigation and any plugin tab panel.
 *
 * Plugin authors get a controlled tab switcher with OpenPen styling without
 * knowing about Reka UI internals.
 *
 * Styles use --openpen-* design tokens.
 * No Reka UI types are leaked in the public API.
 *
 * Usage:
 *   <AppTabs
 *     v-model="activeTab"
 *     :tabs="[{ id: 'general', label: 'General' }, { id: 'advanced', label: 'Advanced' }]"
 *   >
 *     <template #default="{ activeTabId }">
 *       <div v-if="activeTabId === 'general'">...</div>
 *       <div v-if="activeTabId === 'advanced'">...</div>
 *     </template>
 *   </AppTabs>
 */
import {
  TabsRoot,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '../primitives'

// ── OpenPen-owned types (MUST NOT reference reka-ui types) ────────────────────

export interface AppTabItem {
  /** Unique identifier for this tab. Used as the v-model value. */
  id: string
  /** Human-readable label rendered in the tab trigger button. */
  label: string
}

export interface AppTabsProps {
  /** Currently active tab id (controlled mode). */
  modelValue: string
  /** Ordered list of tab descriptors. */
  tabs: AppTabItem[]
}

export interface AppTabsSlots {
  /**
   * Default slot for tab content area.
   * Receives the currently active tab id via scoped slot.
   */
  default: (scope: { activeTabId: string }) => unknown
}

const props = defineProps<AppTabsProps>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

defineSlots<AppTabsSlots>()

function onTabChange(val: string | number | undefined) {
  if (typeof val === 'string') {
    emit('update:modelValue', val)
  }
}
</script>

<template>
  <TabsRoot
    :model-value="props.modelValue"
    class="openpen-tabs"
    @update:model-value="onTabChange"
  >
    <TabsList class="openpen-tabs-list">
      <TabsTrigger
        v-for="tab in props.tabs"
        :key="tab.id"
        :value="tab.id"
        class="openpen-tabs-trigger"
      >
        {{ tab.label }}
      </TabsTrigger>
    </TabsList>

    <!-- Single content outlet: plugin author renders tab content via scoped slot. -->
    <TabsContent
      v-for="tab in props.tabs"
      :key="tab.id"
      :value="tab.id"
      class="openpen-tabs-content"
    >
      <slot :active-tab-id="tab.id" />
    </TabsContent>
  </TabsRoot>
</template>

<style scoped>
/* ── Tab root ───────────────────────────────────────────────────────────────── */
.openpen-tabs {
  display: flex;
  flex-direction: column;
  gap: var(--openpen-space-sm);
}

/* ── Tab list (trigger bar) ─────────────────────────────────────────────────── */
.openpen-tabs-list {
  display: flex;
  flex-direction: row;
  gap: 2px;
  padding: 3px;
  background: var(--openpen-color-control-group);
  border: 1px solid var(--openpen-color-border);
  border-radius: var(--openpen-radius-md);
}

/* ── Individual trigger ─────────────────────────────────────────────────────── */
.openpen-tabs-trigger {
  flex: 1;
  padding: var(--openpen-space-xs) var(--openpen-space-sm);
  border: none;
  border-radius: calc(var(--openpen-radius-md) - 3px);
  background: transparent;
  color: var(--openpen-color-text-dim);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background var(--openpen-duration-fast) var(--openpen-easing-standard),
    color var(--openpen-duration-fast) var(--openpen-easing-standard);
  white-space: nowrap;
  /* Remove default button outline; focus-visible ring below handles a11y. */
  outline: none;
}

.openpen-tabs-trigger:hover {
  background: var(--openpen-color-control-hover);
  color: var(--openpen-color-text-primary);
}

.openpen-tabs-trigger[data-state='active'] {
  background: var(--openpen-color-accent-bg);
  color: var(--openpen-color-accent);
  box-shadow: 0 0 0 1px var(--openpen-color-accent-glow);
}

.openpen-tabs-trigger:focus-visible {
  box-shadow: 0 0 0 2px var(--openpen-color-accent);
}

/* ── Tab content ────────────────────────────────────────────────────────────── */
.openpen-tabs-content {
  /* Content area has no chrome by default; plugin authors add their own. */
  outline: none;
}

.openpen-tabs-content:focus-visible {
  box-shadow: 0 0 0 2px var(--openpen-color-accent);
  border-radius: var(--openpen-radius-sm);
}
</style>
