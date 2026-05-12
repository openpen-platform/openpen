/**
 * Top-level orchestrator that takes a collection of `OpenPenModule`
 * objects (built-in + plugin), validates them as a set, then registers
 * the survivors into both the module-registry and the contribution-store.
 *
 * Id conflict handling: duplicate module ids are resolved by first-wins
 * deduplication before any other validation runs. Skipped modules are
 * reported in the result but do not block the load of non-conflicting modules.
 *
 * Per-module setup failures (throw or 5s timeout) trigger rollback of just
 * that module — its contributions, event subscriptions, shortcuts, and
 * onDispose-registered cleanups are released and the module is dropped from
 * `loaded`. Other modules continue loading.
 *
 * Discovery (where the module objects come from — built-in registry
 * import, plugin manifest scanning, etc.) is the caller's job. Keeping
 * it out of here lets us test loader behaviour with synthetic modules.
 */
import {
  CONTRIBUTION_KEY_TO_SLOT_ID,
  type OpenPenModule,
  type ModuleSetupContext,
  type EventSubscriptionContribution,
  type ShortcutContribution,
  type LifecycleContribution,
} from '@openpen/module-api'
import { registerModule, unregisterModule as registryUnregister } from './module-registry'
import { registerContribution, unregisterModule as contributionUnregister } from './contribution-store'
import {
  deduplicateModules,
  validateModules,
  type ValidationError,
  type SkippedModule,
  type PluginConflict,
} from './module-validator'
import { on as eventBusOn } from './event-bus'
import { clearSettingsCache } from './module-settings-cache'
// Imported via the externalised root barrel (NOT the /host sub-path) so the
// host's writes hit the same module-context-registry instance that runtime-
// bundle code reads from via useModuleContext. See project_dev_prod_parity.md.
import { setModuleContext, clearModuleContext } from '@openpen/module-api'

/**
 * Per-module unsubscribe handles for `system.events` contributions.
 * Tracked separately from contribution-store entries because event
 * subscriptions live in the event-bus, not in the slot store.
 */
const moduleEventUnsubs = new Map<string, Array<() => void>>()

/**
 * Per-module dispose callbacks registered via `ctx.onDispose()`.
 * Stored in registration order; executed in reverse (LIFO) on unload.
 */
const moduleDisposeFns = new Map<string, Array<() => void | Promise<void>>>()

/**
 * Namespaced shortcut id (`${moduleId}/${localId}`) → handler + scope.
 * Keyed map so the global dispatcher (initShortcutDispatcher) can route
 * a `module:shortcut-triggered` IPC back to the right handler and skip
 * fires that don't match the current scope (drawing-mode gating).
 */
interface ShortcutEntry {
  handler: () => void
  scope: 'global' | 'drawing'
}
const shortcutHandlers = new Map<string, ShortcutEntry>()
let shortcutDispatcherUnsub: (() => void) | null = null
let shortcutDrawingUnsub: (() => void) | null = null
let isDrawingModeForShortcuts = false

export interface LoadOptions {
  modules: readonly OpenPenModule[]
  hostVersion: string
  /**
   * Factory for the context handed to each module's `setup()`. When
   * omitted, `setup()` is not invoked (useful in tests when the full
   * renderer-side host context is not needed).
   */
  makeSetupContext?: (moduleId: string) => ModuleSetupContext
  /**
   * Ids of modules that are bundled with the host (i.e. live under
   * src/core/modules/). Used by the validator to enforce the rule
   * that every plugin (anything NOT in this set) declares a version.
   * When omitted the plugin-version check is skipped entirely —
   * appropriate for tests that don't care about origin discrimination.
   */
  builtInModuleIds?: ReadonlySet<string>
  /**
   * User-chosen resolutions for previously-seen plugin id collisions.
   * Maps conflicting plugin id → the manifest.dir of the plugin to keep.
   * Loaded from settings.pluginIdConflictResolutions at boot time.
   * When provided, conflicts matching a resolution are auto-resolved without
   * showing the dialog. When absent or empty, unresolved conflicts block boot.
   */
  userResolutions?: Readonly<Record<string, string>>
}

export interface LoadResult {
  /** Ids of modules successfully registered. */
  loaded: string[]
  /** Hard validation errors (schema, slot-conflict, min-version, etc.). Non-empty means those specific modules failed. */
  errors: ValidationError[]
  /**
   * Modules skipped due to id conflicts.
   * Built-in vs plugin conflicts are silently skipped (reserved namespace).
   * Resolved plugin↔plugin conflicts skip the unchosen candidates.
   * These are not hard errors — the app continues loading normally.
   */
  skipped: SkippedModule[]
  /**
   * Unresolved plugin↔plugin id collisions. When non-empty, NO modules
   * (including built-ins) are loaded; PluginConflictDialog must be shown.
   */
  pluginConflicts: PluginConflict[]
}

export async function loadModules(opts: LoadOptions): Promise<LoadResult> {
  const { modules, hostVersion, makeSetupContext, builtInModuleIds, userResolutions } = opts

  // Id deduplication with conflict classification:
  //   - built-in vs plugin: plugin skipped with 'duplicate-built-in'
  //   - plugin vs plugin (unresolved): goes into pluginConflicts → blocks boot
  //   - plugin vs plugin (resolved by user): winner accepted, losers skipped with 'conflict-not-chosen'
  const { accepted: dedupedModules, skipped, pluginConflicts } = deduplicateModules(
    modules,
    builtInModuleIds ?? new Set(),
    userResolutions ?? {},
  )

  // Log each skipped module for developer diagnostics.
  for (const { module: m, reason } of skipped) {
    console.warn(
      `[module-loader] Skipping module "${m.id}" (${reason}): id already claimed.`,
    )
  }

  // Unresolved plugin↔plugin conflicts block the entire load. No modules —
  // including built-ins — are registered until the user resolves the collision.
  if (pluginConflicts.length > 0) {
    return { loaded: [], errors: [], skipped, pluginConflicts }
  }

  const validation = validateModules(dedupedModules, hostVersion, { builtInModuleIds })
  if (!validation.valid) {
    return { loaded: [], errors: validation.errors, skipped, pluginConflicts: [] }
  }

  const loaded: string[] = []
  const errors: ValidationError[] = []
  const loadedModules: OpenPenModule[] = []
  for (const m of dedupedModules) {
    try {
      registerModule(m)
      registerContributions(m)
      loaded.push(m.id)
      loadedModules.push(m)
    } catch (err) {
      // Per-module rollback: tear down whatever the failing module
      // had time to register so the contribution-store / event-bus /
      // shortcut bridge don't keep dangling state. The remaining
      // modules continue loading — one bad plugin must not brick
      // the rest of the host.
      rollbackModule(m.id)
      const message = err instanceof Error ? err.message : String(err)
      errors.push({
        moduleId: m.id,
        category: 'invalid-shape',
        message: `Failed to register contributions: ${message}`,
      })
      console.error(`[module-loader] rolling back "${m.id}":`, err)
    }
  }

  if (makeSetupContext) {
    // Pass 1: build and register ALL module contexts before any setup() runs.
    // Contributions (including settingsPanels) were registered in the loop above,
    // so Vue may flush a re-render on the first setup() await. Pre-registering all
    // contexts ensures panel components can call useModuleContext() safely regardless
    // of which module's setup() triggered the flush.
    //
    // All loaded modules receive a context (so components can call getSettings /
    // updateSettings even if the module has no setup() function). Only modules that
    // declare setup() are added to ctxMap for Pass 2 invocation.
    const ctxMap = new Map<string, ModuleSetupContext>()
    for (const m of loadedModules) {
      const disposeFns: Array<() => void | Promise<void>> = []
      moduleDisposeFns.set(m.id, disposeFns)
      const ctx: ModuleSetupContext = {
        ...makeSetupContext(m.id),
        onDispose: (fn) => disposeFns.push(fn),
      }
      setModuleContext(m.id, ctx)
      if (m.setup) {
        ctxMap.set(m.id, ctx)
      }
    }

    // Pass 2: invoke setup() for each module in order.
    for (const m of loadedModules) {
      const ctx = ctxMap.get(m.id)
      if (!ctx || !m.setup) continue
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`setup() timed out after 5000ms for module "${m.id}"`)),
          5000,
        ),
      )
      try {
        await Promise.race([m.setup(ctx), timeout])
      } catch (err) {
        console.error(`[module-loader] setup() threw for module "${m.id}":`, err)
        rollbackModule(m.id)
        const loadedIdx = loaded.indexOf(m.id)
        if (loadedIdx !== -1) loaded.splice(loadedIdx, 1)
        const loadedModulesIdx = loadedModules.indexOf(m)
        if (loadedModulesIdx !== -1) loadedModules.splice(loadedModulesIdx, 1)
        const message = err instanceof Error ? err.message : String(err)
        errors.push({
          moduleId: m.id,
          category: 'setup-failed',
          message: `setup() failed: ${message}`,
        })
      }
    }
  }

  return { loaded, errors, skipped, pluginConflicts: [] }
}

function rollbackModule(moduleId: string): void {
  // Run dispose callbacks in reverse (LIFO) so later-registered resources
  // are released before earlier ones.
  const disposeFns = moduleDisposeFns.get(moduleId)
  if (disposeFns) {
    for (let i = disposeFns.length - 1; i >= 0; i--) {
      try {
        disposeFns[i]()
      } catch {
        /* best-effort */
      }
    }
    moduleDisposeFns.delete(moduleId)
  }
  try {
    unsubscribeModuleEvents(moduleId)
  } catch {
    /* best-effort */
  }
  try {
    unregisterModuleShortcuts(moduleId)
  } catch {
    /* best-effort */
  }
  // Strip any contributions already registered into slots.
  contributionUnregister(moduleId)
  // Drop the module from the registry if it was registered.
  registryUnregister(moduleId)
  // Clear settings cache and subscribers so unloaded modules don't
  // receive stale change notifications.
  clearSettingsCache(moduleId)
  // Remove from the useModuleContext registry so components that
  // try to call useModuleContext after rollback get a clear error.
  clearModuleContext(moduleId)
}

function registerContributions(module: OpenPenModule): void {
  const c = module.contributes
  if (!c) return
  for (const [key, value] of Object.entries(c)) {
    const slotId = CONTRIBUTION_KEY_TO_SLOT_ID[key]
    if (!slotId) continue // defineModule already rejected, but defend
    if (Array.isArray(value)) {
      for (const item of value) {
        registerContribution(slotId, module.id, item)
      }
    } else if (value !== undefined) {
      registerContribution(slotId, module.id, value)
    }
  }

  // Side-effect wiring for system.events: subscribe each handler to the
  // event-bus, retain unsubscribe handles for cleanup at unregister time.
  const events = c.events as EventSubscriptionContribution[] | undefined
  if (Array.isArray(events) && events.length > 0) {
    const unsubs: Array<() => void> = []
    for (const sub of events) {
      if (typeof sub?.event === 'string' && typeof sub?.handler === 'function') {
        unsubs.push(eventBusOn(sub.event, sub.handler))
      }
    }
    if (unsubs.length > 0) moduleEventUnsubs.set(module.id, unsubs)
  }

  // Side-effect wiring for system.shortcuts: register each accelerator
  // through the main-side bridge under a namespaced id, retain the
  // handler for the global dispatcher to find on trigger.
  const shortcuts = c.shortcuts as ShortcutContribution[] | undefined
  if (Array.isArray(shortcuts) && shortcuts.length > 0) {
    for (const s of shortcuts) {
      if (
        typeof s?.id !== 'string' ||
        typeof s?.keys !== 'string' ||
        typeof s?.handler !== 'function'
      ) {
        continue
      }
      const namespacedId = `${module.id}/${s.id}`
      const scope: 'global' | 'drawing' = s.scope === 'drawing' ? 'drawing' : 'global'
      shortcutHandlers.set(namespacedId, { handler: s.handler, scope })
      window.openPenApi?.registerShortcut(namespacedId, s.keys)
    }
  }
}

/**
 * Unsubscribe every event-bus handler that the given module registered.
 * Called by the runtime cleanup path; leaving stale handlers attached
 * after a module unloads would let unregistered code execute on emit.
 */
export function unsubscribeModuleEvents(moduleId: string): void {
  const subs = moduleEventUnsubs.get(moduleId)
  if (!subs) return
  for (const unsub of subs) {
    try {
      unsub()
    } catch {
      /* ignore — best-effort cleanup */
    }
  }
  moduleEventUnsubs.delete(moduleId)
}

/**
 * Unregister every shortcut a module registered with the main bridge,
 * and forget the local handlers. Idempotent; safe for unknown modules.
 */
export function unregisterModuleShortcuts(moduleId: string): void {
  const prefix = `${moduleId}/`
  for (const namespacedId of [...shortcutHandlers.keys()]) {
    if (namespacedId.startsWith(prefix)) {
      shortcutHandlers.delete(namespacedId)
      window.openPenApi?.unregisterShortcut(namespacedId)
    }
  }
}

/**
 * Wire the global shortcut dispatcher. Called once from `bootstrap.init`;
 * the `module:shortcut-triggered` IPC fires with a namespaced id and
 * the dispatcher invokes the matching local handler. No-op outside of
 * an Electron preload (e.g. test environments without `openPenApi`).
 */
export function initShortcutDispatcher(): void {
  if (shortcutDispatcherUnsub) return
  // Track drawing-mode flag for `scope: 'drawing'` shortcut gating.
  shortcutDrawingUnsub =
    window.openPenApi?.onDrawingModeChanged((enabled) => {
      isDrawingModeForShortcuts = enabled
    }) ?? null
  shortcutDispatcherUnsub =
    window.openPenApi?.onShortcutTriggered(({ id }) => {
      const entry = shortcutHandlers.get(id)
      if (!entry) return
      if (entry.scope === 'drawing' && !isDrawingModeForShortcuts) return
      try {
        entry.handler()
      } catch (err) {
        console.error(`[module-loader] shortcut "${id}" handler threw:`, err)
      }
    }) ?? null
}

/** Tear down the global shortcut dispatcher (cleanup path). */
export function teardownShortcutDispatcher(): void {
  shortcutDispatcherUnsub?.()
  shortcutDispatcherUnsub = null
  shortcutDrawingUnsub?.()
  shortcutDrawingUnsub = null
  shortcutHandlers.clear()
}

/**
 * Fire `onReady` for every loaded module that declared one. Called from
 * bootstrap once `loadModules` returns successfully. Errors are caught
 * per-module so one failing hook never blocks the rest.
 */
export async function fireLifecycleOnReady(modules: readonly OpenPenModule[]): Promise<void> {
  for (const m of modules) {
    const lc = m.contributes?.lifecycle as LifecycleContribution | undefined
    if (!lc?.onReady) continue
    try {
      await lc.onReady()
    } catch (err) {
      console.error(`[module-loader] lifecycle.onReady threw for "${m.id}":`, err)
    }
  }
}

/**
 * Fire `onSuspend` for all modules with the hook. Called when the host
 * broadcasts the suspend lifecycle event (e.g. window hidden, app
 * backgrounded).
 */
export async function fireLifecycleOnSuspend(modules: readonly OpenPenModule[]): Promise<void> {
  for (const m of modules) {
    const lc = m.contributes?.lifecycle as LifecycleContribution | undefined
    if (!lc?.onSuspend) continue
    try {
      await lc.onSuspend()
    } catch (err) {
      console.error(`[module-loader] lifecycle.onSuspend threw for "${m.id}":`, err)
    }
  }
}

/**
 * Fire `onQuit` for all modules with the hook. Called when the host
 * broadcasts the quit lifecycle event (app about to exit).
 */
export async function fireLifecycleOnQuit(modules: readonly OpenPenModule[]): Promise<void> {
  for (const m of modules) {
    const lc = m.contributes?.lifecycle as LifecycleContribution | undefined
    if (!lc?.onQuit) continue
    try {
      await lc.onQuit()
    } catch (err) {
      console.error(`[module-loader] lifecycle.onQuit threw for "${m.id}":`, err)
    }
  }
}

/** Test-only: drop all per-module tracking maps without unsubscribing. */
export function resetModuleEventSubsForTest(): void {
  moduleEventUnsubs.clear()
  shortcutHandlers.clear()
  moduleDisposeFns.clear()
}
