/**
 * Cross-module preflight validator.
 *
 * Each individual module is already validated by `defineModule()` at its
 * own boundary (id format, contributions presence, slot key existence).
 * This validator runs over the full set of modules loaded by the host
 * and catches problems that only emerge in combination:
 *
 *   - built-in vs plugin id conflict  → plugin silently skipped (reserved namespace)
 *   - plugin vs plugin id conflict    → hard error; none of the conflicting plugins load
 *                                       until the user resolves via PluginConflictDialog
 *   - two modules contributing the same `strokeStyle.provides` key
 *   - two modules contributing the same control-bar item id
 *   - a module using the host-reserved `'default'` group
 *   - a module's `minAppVersion` exceeding the running host version
 *   - a plugin (non-built-in) lacking a declared `version`
 *
 * Plugin id collisions are split into two categories:
 *   `'duplicate-built-in'` — plugin collides with a built-in; plugin is silently
 *     skipped (built-in reserved namespace pattern). App continues loading.
 *   plugin↔plugin collision — ALL conflicting plugins go into `pluginConflicts`;
 *     none are accepted or silently skipped. The host shows PluginConflictDialog.
 *
 * After the user resolves a conflict (choosing which plugin dir to keep), the
 * resolution is persisted in settings.pluginIdConflictResolutions and the app
 * relaunches. On the next boot, `userResolutions` is passed to deduplicateModules
 * and the chosen plugin is accepted while the others are skipped.
 *
 * All other problems remain hard errors collected and returned together so users
 * see every actionable error at once.
 */
import type { OpenPenModule } from '@openpen/module-api'

export type ValidationCategory =
  | 'duplicate-id'
  | 'slot-conflict'
  | 'min-version'
  | 'missing-version'
  | 'invalid-shape'
  | 'setup-failed'

export interface ValidationError {
  /** Module that triggered the error (or '<multiple>' for cross-module collisions). */
  moduleId: string
  /** Human-readable, actionable. */
  message: string
  category: ValidationCategory
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

/**
 * Why a module was skipped during id deduplication.
 *   `'duplicate-built-in'`  — plugin id collides with a bundled built-in;
 *     the built-in always wins. App continues normally.
 *   `'conflict-not-chosen'` — plugin↔plugin conflict was resolved by the user;
 *     this plugin's manifest.dir was not chosen.
 */
export type SkipReason = 'duplicate-built-in' | 'conflict-not-chosen'

export interface SkippedModule {
  module: OpenPenModule
  reason: SkipReason
}

/**
 * A group of plugins that all share the same id and have not yet been resolved
 * by the user. None of these plugins will load until the user picks one via
 * PluginConflictDialog. Each candidate carries an optional `dir` field from
 * its manifest so the dialog can display filesystem paths.
 */
export interface PluginConflict {
  /** The conflicting plugin id (e.g. `@vendor/sticky-notes`). */
  id: string
  /** All plugins claiming this id. The user must pick exactly one. */
  candidates: readonly OpenPenModule[]
}

/**
 * Result of `deduplicateModules`. Splits the input into three buckets:
 *   `accepted`       — modules cleared to load.
 *   `skipped`        — modules that lost a conflict resolution (either to a
 *                      built-in or because the user chose a different dir).
 *   `pluginConflicts`— plugin↔plugin id collisions not yet resolved by the user;
 *                      none of the candidates are in `accepted`.
 */
export interface DeduplicateResult {
  accepted: OpenPenModule[]
  skipped: SkippedModule[]
  pluginConflicts: PluginConflict[]
}

export interface ValidateOptions {
  /**
   * Ids of bundled modules. Any module whose id is NOT in this set is
   * treated as a third-party plugin and required to declare a `version`.
   * Omit to skip the plugin-version check (e.g. in unit tests).
   */
  builtInModuleIds?: ReadonlySet<string>
}

/**
 * Id deduplication with conflict classification.
 *
 * Pass 1: group modules by id and classify each group:
 *   - Single module → no conflict, goes straight to `accepted`.
 *   - Multiple modules where the id is a built-in id → built-in is accepted;
 *     all plugins with that id are skipped with `'duplicate-built-in'`.
 *   - Multiple plugins sharing the same id (no built-in in the group) →
 *     check `userResolutions`:
 *       • If resolved: the plugin whose `(m as any).dir` matches the resolution
 *         is accepted; others are skipped with `'conflict-not-chosen'`.
 *       • If unresolved: all candidates go into `pluginConflicts`; none are
 *         accepted or skipped.
 *
 * `builtInIds` is used to discriminate built-in ids from plugin ids.
 * `userResolutions` maps conflict id → chosen manifest.dir (from settings).
 *
 * Both parameters may be omitted in unit tests.
 */
export function deduplicateModules(
  modules: readonly OpenPenModule[],
  builtInIds: ReadonlySet<string> = new Set(),
  userResolutions: Readonly<Record<string, string>> = {},
): DeduplicateResult {
  // Group modules by id.
  const groups = new Map<string, OpenPenModule[]>()
  for (const m of modules) {
    const arr = groups.get(m.id) ?? []
    arr.push(m)
    groups.set(m.id, arr)
  }

  const accepted: OpenPenModule[] = []
  const skipped: SkippedModule[] = []
  const pluginConflicts: PluginConflict[] = []

  // Preserve original ordering for accepted modules: process groups in the
  // order their first member appeared in the input array.
  const seenOrder = new Map<string, number>()
  for (let i = 0; i < modules.length; i++) {
    if (!seenOrder.has(modules[i].id)) seenOrder.set(modules[i].id, i)
  }

  const sortedIds = [...groups.keys()].sort((a, b) => {
    return (seenOrder.get(a) ?? 0) - (seenOrder.get(b) ?? 0)
  })

  for (const id of sortedIds) {
    const group = groups.get(id)!
    if (group.length === 1) {
      accepted.push(group[0])
      continue
    }

    if (builtInIds.has(id)) {
      // Built-in vs plugin conflict: built-in wins; all plugins skipped.
      for (const m of group) {
        if (builtInIds.has(m.id) && !accepted.some((a) => a.id === id)) {
          // The module object itself might be a built-in or plugin — built-ins
          // appear first in the array, so the first entry in the group is the
          // built-in winner.
          accepted.push(m)
        } else if (!accepted.some((a) => a === m)) {
          skipped.push({ module: m, reason: 'duplicate-built-in' })
        }
      }
      continue
    }

    // All entries in this group are plugins (no built-in owns this id).
    const chosenDir = userResolutions[id]
    if (chosenDir !== undefined) {
      // User already resolved this conflict: accept the chosen dir, skip the rest.
      let resolved = false
      for (const m of group) {
        const dir = (m as unknown as Record<string, unknown>)['dir']
        if (!resolved && typeof dir === 'string' && dir === chosenDir) {
          accepted.push(m)
          resolved = true
        } else {
          skipped.push({ module: m, reason: 'conflict-not-chosen' })
        }
      }
      // If no module matched the chosen dir (e.g. the plugin was removed), treat
      // it as unresolved so the dialog surfaces it again.
      if (!resolved) {
        pluginConflicts.push({ id, candidates: group })
        // Remove the incorrectly-skipped entries for this group.
        const toRemove = new Set(group)
        for (let i = skipped.length - 1; i >= 0; i--) {
          if (toRemove.has(skipped[i].module)) skipped.splice(i, 1)
        }
      }
    } else {
      // Unresolved plugin↔plugin conflict: hold all candidates for dialog.
      pluginConflicts.push({ id, candidates: group })
    }
  }

  return { accepted, skipped, pluginConflicts }
}

export function validateModules(
  modules: readonly OpenPenModule[],
  hostVersion: string,
  opts: ValidateOptions = {}
): ValidationResult {
  const errors: ValidationError[] = []

  errors.push(...checkStrokeStyleConflicts(modules))
  errors.push(...checkControlBarItemIdConflicts(modules))
  errors.push(...checkReservedGroupNames(modules))
  errors.push(...checkMinAppVersion(modules, hostVersion))
  if (opts.builtInModuleIds) {
    errors.push(...checkPluginVersion(modules, opts.builtInModuleIds))
  }

  return { valid: errors.length === 0, errors }
}

function checkPluginVersion(
  modules: readonly OpenPenModule[],
  builtInModuleIds: ReadonlySet<string>
): ValidationError[] {
  const errors: ValidationError[] = []
  for (const m of modules) {
    if (builtInModuleIds.has(m.id)) continue
    if (typeof m.version !== 'string' || m.version.trim().length === 0) {
      errors.push({
        moduleId: m.id,
        category: 'missing-version',
        message: `Plugin "${m.id}" must declare a non-empty "version" string. Built-in modules may inherit the host version, but plugins are required to fill it.`,
      })
    }
  }
  return errors
}

function checkStrokeStyleConflicts(
  modules: readonly OpenPenModule[]
): ValidationError[] {
  const writers = new Map<string, string[]>() // styleKey → [moduleId, ...]
  for (const m of modules) {
    const provides = m.contributes?.strokeStyle?.provides
    if (!provides) continue
    for (const key of provides) {
      const arr = writers.get(key) ?? []
      arr.push(m.id)
      writers.set(key, arr)
    }
  }
  const errors: ValidationError[] = []
  for (const [key, ids] of writers) {
    if (ids.length > 1) {
      errors.push({
        moduleId: ids.join(', '),
        category: 'slot-conflict',
        message: `Stroke style key "${key}" is provided by ${ids.length} modules: ${ids.join(', ')}. Only one module may write any given stroke style key.`,
      })
    }
  }
  return errors
}

function checkControlBarItemIdConflicts(
  modules: readonly OpenPenModule[]
): ValidationError[] {
  const writers = new Map<string, string[]>() // itemId → [moduleId, ...]
  for (const m of modules) {
    const items = m.contributes?.controlBar
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (!item || typeof item.id !== 'string') continue
      const arr = writers.get(item.id) ?? []
      arr.push(m.id)
      writers.set(item.id, arr)
    }
  }
  const errors: ValidationError[] = []
  for (const [itemId, ids] of writers) {
    if (ids.length > 1) {
      errors.push({
        moduleId: ids.join(', '),
        category: 'slot-conflict',
        message: `Control-bar item id "${itemId}" is contributed by ${ids.length} modules: ${ids.join(', ')}. Each control-bar item id must be unique across all loaded modules.`,
      })
    }
  }
  return errors
}

const RESERVED_GROUP_IDS = new Set(['default'])

function checkReservedGroupNames(
  modules: readonly OpenPenModule[]
): ValidationError[] {
  const errors: ValidationError[] = []
  for (const m of modules) {
    const items = m.contributes?.controlBar
    if (!Array.isArray(items)) continue
    for (const item of items) {
      if (!item) continue
      if (typeof item.defaultGroup === 'string' && RESERVED_GROUP_IDS.has(item.defaultGroup)) {
        errors.push({
          moduleId: m.id,
          category: 'invalid-shape',
          message: `Module "${m.id}" control-bar item "${item.id}" sets defaultGroup="${item.defaultGroup}", which is host-reserved. Pick a different group id; the host fills the 'default' group automatically when no other group matches.`,
        })
      }
    }
  }
  return errors
}

function checkMinAppVersion(
  modules: readonly OpenPenModule[],
  hostVersion: string
): ValidationError[] {
  const errors: ValidationError[] = []
  for (const m of modules) {
    if (!m.minAppVersion) continue
    if (compareSemver(m.minAppVersion, hostVersion) > 0) {
      errors.push({
        moduleId: m.id,
        category: 'min-version',
        message: `Module "${m.id}" requires OpenPen ${m.minAppVersion} or newer; running ${hostVersion}. Update OpenPen or use an older module version.`,
      })
    }
  }
  return errors
}

/**
 * Minimal semver comparator: handles `MAJOR.MINOR.PATCH` and ignores
 * pre-release / build metadata. Returns -1 / 0 / 1 like Array#sort.
 *
 * If either side is not a parseable triplet the comparison falls back
 * to string compare (defensive — the validator should never crash on
 * malformed input, just yield a meaningful error elsewhere).
 */
function compareSemver(a: string, b: string): number {
  const ax = parseTriplet(a)
  const bx = parseTriplet(b)
  if (!ax || !bx) return a < b ? -1 : a > b ? 1 : 0
  for (let i = 0; i < 3; i++) {
    if (ax[i] !== bx[i]) return ax[i] - bx[i]
  }
  return 0
}

function parseTriplet(v: string): [number, number, number] | null {
  const m = v.split(/[-+]/)[0].split('.')
  if (m.length !== 3) return null
  const nums = m.map((p) => Number.parseInt(p, 10))
  if (nums.some((n) => Number.isNaN(n))) return null
  return [nums[0], nums[1], nums[2]]
}
