import { z } from 'zod'
import type { Component } from 'vue'
import type { LocaleMap } from '../locale'

// ── Schema ────────────────────────────────────────────────────────────────

export const GroupInsetSchema = z.object({
  enabled: z.boolean(),
  /** Optional CSS color override for the inset background; defaults to --openpen-color-control-group. */
  color: z.string().optional(),
})

export const LayoutGroupSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Group id must be kebab-case'),
  items: z.array(z.string()),
  separator: z.enum(['auto', 'always', 'never']).optional(),
  /**
   * Optional inset rendering for this group. When `enabled: true`, the group
   * MUST render with a visible bg + border + padding container (the design's
   * "grouped tools" look) AND its inner items MUST shrink so the group's
   * outer height matches an unwrapped 36px button — i.e. enabling inset
   * MUST NOT increase control-bar height.
   */
  inset: GroupInsetSchema.optional(),
})

export const ControlBarLayoutSchema = z.object({
  version: z.literal(1),
  groups: z
    .array(LayoutGroupSchema)
    .refine((groups) => groups.some((g) => g.id === 'default'), {
      message: "Layout must contain a 'default' group",
    })
    .refine(
      (groups) => {
        const ids = groups.map((g) => g.id)
        return new Set(ids).size === ids.length
      },
      { message: 'Group ids must be unique' },
    )
    .refine(
      (groups) => {
        const allItems = groups.flatMap((g) => g.items)
        return new Set(allItems).size === allItems.length
      },
      { message: 'Item ids must not appear in multiple groups' },
    ),
})

// ── TypeScript types ──────────────────────────────────────────────────────

export interface GroupInset {
  enabled: boolean
  /** Optional CSS color override for the inset background; defaults to --openpen-color-control-group. */
  color?: string
}

export interface LayoutGroup {
  id: string
  items: string[]
  separator?: 'auto' | 'always' | 'never'
  /** When `enabled: true`, render the group with the visible "grouped tools" container. */
  inset?: GroupInset
}

export interface ControlBarLayout {
  version: 1
  groups: LayoutGroup[]
}

// ── Contribution type ─────────────────────────────────────────────────────

export interface ControlBarContribution {
  /** Item id — MUST be globally unique across all modules. */
  id: string
  /** Vue component rendered for this item. */
  component: Component
  /**
   * Preferred group id on first install.
   * MUST NOT be 'default' (reserved).
   * When omitted, item falls into the 'default' group.
   */
  defaultGroup?: string
  /**
   * Hints used when host auto-creates the defaultGroup.
   * Ignored if the group already exists in the layout.
   */
  groupHint?: {
    separator?: 'auto' | 'always' | 'never'
    label?: string | LocaleMap
  }
}

// ── Default layout ────────────────────────────────────────────────────────

/** Baseline layout used on first launch: a single empty `'default'` group. */
export const DEFAULT_CONTROL_BAR_LAYOUT: ControlBarLayout = {
  version: 1,
  groups: [{ id: 'default', items: [], separator: 'auto' }],
}

// ── Reconcile helpers ─────────────────────────────────────────────────────

/**
 * Apply L3a non-destructive repairs to a parsed layout:
 * - Ensure 'default' group exists
 * - Replace invalid separator values with 'auto'
 * Returns the (possibly mutated copy) and whether any repair was made.
 *
 * @internal Host-only utility; not part of the plugin author API.
 */
export function repairLayoutL3a(layout: ControlBarLayout): {
  layout: ControlBarLayout
  repaired: boolean
} {
  let repaired = false
  const groups = layout.groups.map((g) => {
    if (g.separator !== undefined && !['auto', 'always', 'never'].includes(g.separator)) {
      repaired = true
      return { ...g, separator: 'auto' as const }
    }
    return g
  })
  if (!groups.some((g) => g.id === 'default')) {
    groups.push({ id: 'default', items: [], separator: 'auto' })
    repaired = true
  }
  return { layout: { ...layout, groups }, repaired }
}

/**
 * Apply L3b potentially-destructive repairs:
 * - De-duplicate item ids across groups (keep last occurrence)
 * - Trim ghost ids when count ≥ 20 (noop — ghost trimming is a UX action)
 * Returns the repaired layout and whether any repair was made.
 *
 * @internal Host-only utility; not part of the plugin author API.
 */
export function repairLayoutL3b(
  layout: ControlBarLayout,
  knownItemIds: Set<string>,
): { layout: ControlBarLayout; repaired: boolean } {
  let repaired = false
  const seen = new Set<string>()
  // Process groups in reverse so the last occurrence wins.
  const reversedGroups = [...layout.groups].reverse()
  const deduped = reversedGroups.map((g) => {
    const items = g.items.filter((id) => {
      if (seen.has(id)) {
        repaired = true
        return false
      }
      seen.add(id)
      return true
    })
    return { ...g, items }
  })
  const groups = deduped.reverse()

  // Count ghosts across layout
  const totalItems = groups.flatMap((g) => g.items)
  const ghostCount = totalItems.filter((id) => !knownItemIds.has(id)).length
  if (ghostCount >= 20) {
    repaired = true
    // Remove ghosts from all groups
    const cleaned = groups.map((g) => ({
      ...g,
      items: g.items.filter((id) => knownItemIds.has(id)),
    }))
    return { layout: { ...layout, groups: cleaned }, repaired }
  }

  return { layout: { ...layout, groups }, repaired }
}
