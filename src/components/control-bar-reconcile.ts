/**
 * reconcileLayoutGroups — pure layout reconciliation logic.
 *
 * Extracted from ControlBar.vue so it can be unit-tested independently.
 * All side-effects (IPC calls, Vue reactivity) remain in the SFC.
 */

import type { ControlBarContribution } from '@openpen/module-api'

export type LayoutGroupShape = {
  id: string
  items: string[]
  separator?: 'auto' | 'always' | 'never'
  inset?: { enabled: boolean; color?: string }
}
export type MutableLayout = { version: 1; groups: LayoutGroupShape[] }

/**
 * Groups that MUST render with the visible inset container (background + border)
 * when auto-created by reconcile. The 'tools' group is the canonical case:
 * freehand / line / shape are visually bound together as a grouped unit.
 */
export const DESIGN_INSET_GROUPS: ReadonlySet<string> = new Set(['tools'])

/**
 * Sort comparator for auto-appended control-bar items within a single group pass.
 *
 * Order:
 *   1. Built-in items sort before plugin items (ascending by builtInOrder index).
 *   2. Plugin items sort by installedAt ascending (ISO strings compare lexically).
 *   3. Tie-break (same installedAt or both missing): id alpha-ascending.
 *
 * @param builtInOrder  Map of contribution id → index in BUILT_IN_MODULES registry.
 * @param installedAtMap  Map of plugin id → installedAt ISO string (or null).
 */
function makeItemComparator(
  builtInOrder: Map<string, number>,
  installedAtMap: Map<string, string | null>
): (a: string, b: string) => number {
  return (a, b) => {
    const aBuiltin = builtInOrder.has(a)
    const bBuiltin = builtInOrder.has(b)

    if (aBuiltin && bBuiltin) {
      return (builtInOrder.get(a) ?? Infinity) - (builtInOrder.get(b) ?? Infinity)
    }
    if (aBuiltin) return -1
    if (bBuiltin) return 1

    // Both are plugin items: sort by installedAt, then id.
    const aAt = installedAtMap.get(a) ?? null
    const bAt = installedAtMap.get(b) ?? null
    if (aAt !== null && bAt !== null) {
      if (aAt < bAt) return -1
      if (aAt > bAt) return 1
    } else if (aAt !== null) {
      return -1
    } else if (bAt !== null) {
      return 1
    }
    return a < b ? -1 : a > b ? 1 : 0
  }
}

/**
 * Auto-create layout groups and append items for module contributions that
 * declare a defaultGroup not yet present in the layout. New groups are
 * inserted before 'default' so they render in declaration order.
 *
 * Newly-appended items within each group are sorted: built-in first
 * (ascending registry order), then plugin (ascending installedAt, id tie-break).
 * User-positioned items (already present in any group at call time) are never
 * reordered.
 *
 * Returns the same layout object if no mutation is needed, otherwise a new
 * layout object with the new groups / items appended.
 *
 * @param layout          Current layout (treated as read-only).
 * @param contributions   All active control-bar contributions.
 * @param builtInOrder    Map of contribution id → index in built-in registry.
 * @param installedAtMap  Map of plugin id → installedAt ISO string (or null).
 */
export function reconcileLayoutGroups(
  layout: { version: 1; groups: readonly LayoutGroupShape[] },
  contributions: readonly ControlBarContribution[],
  builtInOrder: Map<string, number>,
  installedAtMap: Map<string, string | null>
): MutableLayout {
  // Build a working copy of groups (so we can mutate items arrays).
  const groups: MutableLayout['groups'] =
    layout.groups.map((g) => ({ ...g, items: [...g.items] }))

  const groupById = new Map(groups.map((g) => [g.id, g]))
  let mutated = false

  // Track which items are newly appended per group this pass, for sort.
  const newItemsPerGroup = new Map<string, string[]>()

  for (const contrib of contributions) {
    const gid = contrib.defaultGroup
    if (!gid || gid === 'default') continue

    // If the item is already in any group, skip (user-configured position).
    const alreadyPlaced = groups.some((g) => g.items.includes(contrib.id))
    if (alreadyPlaced) continue

    if (!groupById.has(gid)) {
      // Auto-create the group and insert before 'default'.
      const sep = contrib.groupHint?.separator ?? 'auto'
      const newGroup: LayoutGroupShape = { id: gid, items: [], separator: sep }
      if (DESIGN_INSET_GROUPS.has(gid)) newGroup.inset = { enabled: true }
      const defaultIdx = groups.findIndex((g) => g.id === 'default')
      const insertAt = defaultIdx >= 0 ? defaultIdx : groups.length
      groups.splice(insertAt, 0, newGroup)
      groupById.set(gid, newGroup)
    }

    // Collect newly-appended ids per group for post-pass sort.
    const bucket = newItemsPerGroup.get(gid) ?? []
    bucket.push(contrib.id)
    newItemsPerGroup.set(gid, bucket)
    mutated = true
  }

  if (!mutated) return layout as MutableLayout

  // Sort only the newly-appended items for each group; preserve existing item order.
  const compare = makeItemComparator(builtInOrder, installedAtMap)
  for (const [gid, newIds] of newItemsPerGroup) {
    const group = groupById.get(gid)!
    const sortedNew = [...newIds].sort(compare)
    group.items.push(...sortedNew)
  }

  return { version: layout.version, groups }
}
