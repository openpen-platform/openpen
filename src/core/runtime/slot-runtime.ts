/**
 * Composables that Vue components use to consume slot contributions.
 *
 * These are intentionally thin wrappers over `contribution-store` —
 * they exist so components don't need to know about `ContributionEntry`
 * or do their own filtering / sorting. Anything more elaborate (e.g.
 * applying user toolbar overrides) layers on top of these primitives
 * inside the host's runtime, never inside individual components.
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { ControlBarContribution, GroupInset } from '@openpen/module-api'
import {
  getSlotEntries,
  type ContributionEntry,
} from './contribution-store'

/**
 * Reactive list of contribution payloads for a slot, without module
 * ownership info. Use this when components only care about *what* was
 * contributed, not *who* contributed it.
 */
export function useSlot<T = unknown>(
  slotId: string
): ComputedRef<readonly T[]> {
  const entries = getSlotEntries<T>(slotId)
  return computed(() => entries.value.map((e) => e.contribution))
}

/**
 * Reactive list of full entries (including `moduleId`). Use this when
 * you need to attribute behaviour to a specific module — e.g. tracing
 * which module owns a misbehaving contribution.
 */
export function useSlotEntries<T = unknown>(
  slotId: string
): ComputedRef<readonly ContributionEntry<T>[]> {
  return computed(() => getSlotEntries<T>(slotId).value)
}

/**
 * A single group of control-bar contributions, ready for rendering.
 */
export interface ControlBarGroup {
  id: string
  items: readonly ControlBarContribution[]
  separator?: 'auto' | 'always' | 'never'
  inset?: GroupInset
}

/**
 * Decide whether to render the leading separator before `group` given
 * its position in the visible group list.
 *
 * - `'never'`            → no separator
 * - `'always'`           → separator (even on the first group; user
 *                          intent is explicit)
 * - `'auto'` (default)   → separator only when there is a previous
 *                          visible group AND that previous group's
 *                          separator is not `'always'` (avoids stacking
 *                          adjacent loud separators)
 *
 * Empty groups are filtered upstream by `useControlBarItems().groups`,
 * so every entry passed in already has visible items — no extra
 * emptiness check is performed here.
 */
export function shouldShowLeadingSeparator(
  group: ControlBarGroup,
  index: number,
  groups: readonly ControlBarGroup[],
): boolean {
  const sep = group.separator ?? 'auto'
  if (sep === 'never') return false
  if (sep === 'always') return true
  // 'auto'
  if (index === 0) return false
  return groups[index - 1]?.separator !== 'always'
}

type RawLayoutGroup = {
  id: string
  items: string[]
  separator?: 'auto' | 'always' | 'never'
  inset?: GroupInset
}

/**
 * Reactive ordered list of control bar items, grouped by layout group.
 *
 * Items are returned in layout group order (as persisted in config.json).
 * Items not present in any group fall into the 'default' group at the
 * end. This composable does NOT subscribe to IPC — the caller is
 * responsible for calling `refreshLayout()` when a `layout:updated`
 * event is received.
 *
 * `groups` is the primary API: it returns items clustered by group so the
 * host can render each group in a `<div class="cb-group">` wrapper.
 * `items` is kept for backwards-compat (flat ordered list).
 */
export function useControlBarItems(): {
  items: ComputedRef<readonly ControlBarContribution[]>
  groups: ComputedRef<readonly ControlBarGroup[]>
  layout: Ref<readonly RawLayoutGroup[]>
  refreshLayout: (groups: readonly RawLayoutGroup[]) => void
} {
  const entries = getSlotEntries<ControlBarContribution>('ui.control-bar')
  const layoutGroups = ref<readonly RawLayoutGroup[]>([
    { id: 'default', items: [] },
  ])

  function refreshLayout(newGroups: readonly RawLayoutGroup[]) {
    layoutGroups.value = newGroups
  }

  // Flat ordered list (items from all groups in order, unplaced appended last).
  const items = computed(() => {
    const all = entries.value.map((e) => e.contribution)
    const byId = new Map(all.map((c) => [c.id, c]))

    const ordered: ControlBarContribution[] = []
    const placed = new Set<string>()
    for (const group of layoutGroups.value) {
      for (const id of group.items) {
        const item = byId.get(id)
        if (item && !placed.has(id)) {
          ordered.push(item)
          placed.add(id)
        }
      }
    }
    for (const item of all) {
      if (!placed.has(item.id)) ordered.push(item)
    }
    return ordered
  })

  // Grouped list: each entry has the group id, separator hint, and its items.
  // Unplaced items (not in any layout group) are appended to the 'default' group.
  const groups = computed((): readonly ControlBarGroup[] => {
    const all = entries.value.map((e) => e.contribution)
    const byId = new Map(all.map((c) => [c.id, c]))
    const placed = new Set<string>()

    const result: ControlBarGroup[] = []

    for (const layoutGroup of layoutGroups.value) {
      const groupItems: ControlBarContribution[] = []
      for (const id of layoutGroup.items) {
        const item = byId.get(id)
        if (item && !placed.has(id)) {
          groupItems.push(item)
          placed.add(id)
        }
      }
      if (groupItems.length > 0) {
        result.push({
          id: layoutGroup.id,
          items: groupItems,
          separator: layoutGroup.separator,
          inset: layoutGroup.inset,
        })
      }
    }

    // Unplaced items (newly registered without a layout entry) go into 'default'.
    const unplaced = all.filter((item) => !placed.has(item.id))
    if (unplaced.length > 0) {
      const existing = result.find((g) => g.id === 'default')
      if (existing) {
        ;(existing.items as ControlBarContribution[]).push(...unplaced)
      } else {
        result.push({ id: 'default', items: unplaced, separator: 'auto' })
      }
    }

    return result
  })

  return { items, groups, layout: layoutGroups, refreshLayout }
}
