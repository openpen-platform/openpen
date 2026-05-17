/**
 * Renderer-side module bootstrap.
 *
 * Called once at app start (after Vue is mounted). Loads the
 * built-in module registry plus any plugin manifests broadcast
 * from the main process, then hands the merged set to
 * `module-loader` for validation and contribution registration.
 *
 * Plugins are loaded via dynamic `import()` of their `rendererEntry`
 * URL (`openpen-plugin://<id>/<file>`). Failures are logged but do
 * not abort the rest of the boot — a malformed plugin shouldn't
 * brick the app.
 *
 * Returns a teardown function for tests / future hot-reload.
 */
import type { OpenPenModule, ModuleSetupContext } from '@openpen/module-api'
import { sanitizeIdForI18n } from '@openpen/module-api'
import { ref, readonly } from 'vue'
import { BUILT_IN_MODULES } from '../modules/registry'
import { pushNotification } from '../../services/notification-service'
import { i18n } from '../../i18n/index'
import {
  loadModules,
  unsubscribeModuleEvents,
  unregisterModuleShortcuts,
  initShortcutDispatcher,
  teardownShortcutDispatcher,
  fireLifecycleOnReady,
  fireLifecycleOnSuspend,
  fireLifecycleOnQuit,
} from './module-loader'
import {
  resetModuleRegistry,
  getAllModules,
  getModule,
} from './module-registry'
import { resetContributionStore, unregisterModule } from './contribution-store'
import { clearEventBus } from './event-bus'
import {
  setSettingsCache,
  getSettingsCache,
  notifySettingsChange,
  subscribeSettingsChange,
  resetSettingsCacheForTest,
} from './module-settings-cache'
import { initStrokeStyleFromSettings } from '../../composables/useStrokeStyle'
import type { PluginConflict } from './module-validator'

// ── Plugin conflict state ─────────────────────────────────────────────────────
//
// Reactive ref populated by initModuleRuntime when unresolved plugin↔plugin
// id collisions are detected. App.vue reads this via `usePluginConflicts()`
// and renders PluginConflictDialog when non-empty.

const pluginConflictsRef = ref<PluginConflict[]>([])

/** Read-only reactive access to unresolved plugin id conflicts. */
export function usePluginConflicts() {
  return readonly(pluginConflictsRef)
}

/**
 * Return only modules whose ids are not in the disabled set.
 * Built-ins are filtered the same as plugins — no special-casing.
 */
export function filterDisabledModules(
  modules: readonly OpenPenModule[],
  disabledIds: readonly string[],
): OpenPenModule[] {
  const set = new Set(disabledIds)
  return modules.filter((m) => !set.has(m.id))
}

let unsubManifests: (() => void) | null = null
let unsubLifecycle: (() => void) | null = null
let unsubModuleSettingsChanged: (() => void) | null = null
let loadedModulesForLifecycle: readonly OpenPenModule[] = []

/**
 * Window type → renderer responsibility.
 *   - `overlay`  : owns shortcut dispatch (single dispatcher avoids
 *                  double-firing when the main process broadcasts a
 *                  `module:shortcut-triggered` to every window).
 *   - `main`     : renders ControlBar / StatusBar / ModalStack.
 *   - `settings` : renders SettingsView.
 *
 * All three load modules so each window's contribution-store reflects
 * the same module set; the dispatcher gating keeps shortcut handlers
 * from running once per window.
 */
export type WindowType = 'main' | 'overlay' | 'settings'

const FALLBACK_HOST_VERSION = '0.0.0'

async function readHostVersion(): Promise<string> {
  try {
    const v = await window.openPenApi?.getAppVersion()
    return typeof v === 'string' && v.length > 0 ? v : FALLBACK_HOST_VERSION
  } catch {
    return FALLBACK_HOST_VERSION
  }
}

/**
 * Wait for the next plugin-manifests broadcast from main, then load
 * built-in modules together with plugin modules. Returns once the
 * load is complete.
 */
export async function initModuleRuntime(opts: {
  /** Locale used for module setup contexts. */
  locale: string
  /** Window kind — gates which renderer owns shortcut dispatch. */
  windowType: WindowType
}): Promise<void> {
  if (opts.windowType === 'overlay') {
    initShortcutDispatcher()
  }

  const [manifests, hostVersion] = await Promise.all([waitForManifests(), readHostVersion()])
  const pluginModules = await importPluginModules(manifests)
  const allModules = [...BUILT_IN_MODULES, ...pluginModules]

  const settings = await window.openPenApi?.getSettings()
  const disabledIds = (settings?.disabledModules ?? []) as readonly string[]
  const userResolutions = (settings?.pluginIdConflictResolutions ?? {}) as Record<string, string>
  const enabledModules = filterDisabledModules(allModules, disabledIds)

  // Hydrate the renderer-side settings cache before any module's setup() runs.
  await prepareModuleSettings(enabledModules)

  // Settings window has no stroke style surface (no ControlBar, no canvas).
  // Skipping it keeps the seed scoped to windows that actually consume
  // stroke style; see initStrokeStyleFromSettings for the seed contract.
  if (opts.windowType !== 'settings') {
    initStrokeStyleFromSettings()
  }

  // Merge locale dictionaries before setup() runs so ctx.t() resolves
  // namespaced keys correctly inside setup. Modules that fail validation
  // leave their dictionaries merged but unused — harmless dead namespaces
  // that the next runtime restart wipes.
  mergeModuleLocales(enabledModules)

  // Wire global IPC fan-out for settings broadcasts from main (once per runtime).
  if (!unsubModuleSettingsChanged) {
    unsubModuleSettingsChanged =
      window.openPenApi?.onModuleSettingsChanged(({ moduleId, settings: moduleSettings }) => {
        notifySettingsChange(moduleId, moduleSettings)
      }) ?? null
  }

  const result = await loadModules({
    modules: enabledModules,
    hostVersion,
    makeSetupContext: makeSetupContextFactory(opts.locale),
    builtInModuleIds: new Set(BUILT_IN_MODULES.map((m) => m.id)),
    userResolutions,
  })

  // Unresolved plugin↔plugin conflicts: surface via PluginConflictDialog.
  // No modules have been loaded at this point (loadModules returns early).
  // App.vue watches _pluginConflicts and renders the dialog when non-empty.
  if (result.pluginConflicts.length > 0) {
    console.warn(
      `[bootstrap] ${result.pluginConflicts.length} unresolved plugin id conflict(s) detected. Showing resolution dialog.`,
      result.pluginConflicts.map((c) => c.id),
    )
    pluginConflictsRef.value = result.pluginConflicts
    // Do not proceed with lifecycle dispatch — no modules loaded.
    return
  }

  // Surface built-in vs plugin conflict skips as warning toasts.
  for (const { module: m, reason } of result.skipped) {
    if (reason === 'duplicate-built-in') {
      console.warn(`[bootstrap] Plugin "${m.id}" was skipped: id conflicts with a built-in module.`)
      pushNotification(
        {
          message: `Plugin "${m.id}" was skipped`,
          description: `Its id conflicts with a built-in module. Rename the plugin id to a unique value (e.g. use a vendor namespace like "@vendor/feature").`,
          variant: 'warning',
          duration: 8000,
        },
        { source: 'bootstrap' },
      )
    }
  }

  if (result.errors.length > 0) {
    console.error('[bootstrap] Some modules failed to load:', result.errors)
    // Surface each failure as a danger toast — silently swallowing
    // load errors leaves users wondering why a button didn't appear.
    // The toast points to the offending moduleId so the user can
    // identify which plugin to disable / report.
    for (const err of result.errors) {
      pushNotification(
        {
          message: `Module "${err.moduleId}" failed to load`,
          description: err.message,
          variant: 'danger',
          duration: 6000,
        },
        { source: 'bootstrap' },
      )
    }
    // Per-module isolation in loadModules means good modules still
    // loaded. We only abort lifecycle dispatch if NOTHING loaded.
    if (result.loaded.length === 0) return
  }

  const successfulModules = enabledModules.filter((m) => result.loaded.includes(m.id))
  loadedModulesForLifecycle = successfulModules

  // Subscribe to host lifecycle broadcasts. Only the overlay window's
  // copy is the "owner" (matching the shortcut dispatcher gating) so
  // hooks don't fire once per window.
  if (opts.windowType === 'overlay') {
    unsubLifecycle?.()
    unsubLifecycle =
      window.openPenApi?.onLifecycleEvent((event) => {
        if (event === 'suspend') {
          void fireLifecycleOnSuspend(loadedModulesForLifecycle)
        } else if (event === 'quit') {
          void fireLifecycleOnQuit(loadedModulesForLifecycle)
        }
      }) ?? null
  }

  await fireLifecycleOnReady(successfulModules)
}

/**
 * Pull plugin manifests from the main process. The push-broadcast
 * (`module:manifests`) usually fires before the renderer is ready to
 * listen, so we invoke for the current snapshot instead. Returns an
 * empty array outside of an Electron preload (test harnesses).
 */
async function waitForManifests(): Promise<readonly ModuleManifest[]> {
  if (!window.openPenApi?.getModuleManifests) return []
  try {
    return await window.openPenApi.getModuleManifests()
  } catch {
    return []
  }
}

async function importPluginModules(manifests: readonly ModuleManifest[]): Promise<OpenPenModule[]> {
  const out: OpenPenModule[] = []
  for (const m of manifests) {
    if (!m.rendererEntry) continue
    try {
      const mod = await import(/* @vite-ignore */ m.rendererEntry)
      const def = (mod.default ?? mod) as OpenPenModule | undefined
      if (def && typeof def === 'object' && typeof def.id === 'string') {
        out.push(def)
      } else {
        console.error(
          `[bootstrap] Plugin "${m.id}" did not default-export a valid OpenPenModule.`,
        )
      }
    } catch (err) {
      console.error(`[bootstrap] Failed to import plugin "${m.id}":`, err)
    }
  }
  return out
}

/**
 * Hydrate the renderer-side settings cache for each module before setup()
 * runs. Handles schema migration and Zod-default application.
 */
async function prepareModuleSettings(modules: readonly OpenPenModule[]): Promise<void> {
  for (const m of modules) {
    try {
      // 1. Read persisted blob + stored version.
      const { data: rawData, schemaVersion: storedVersion } = await (
        window.openPenApi?.getModuleSettings(m.id) ??
        Promise.resolve({ data: {}, schemaVersion: 1 })
      )
      const targetVersion = m.settingsVersion ?? 1

      // 2. Migration: run when stored version is behind and a migrate hook exists.
      let didMigrate = false
      let data: Record<string, unknown> = rawData
      if (storedVersion < targetVersion && typeof m.migrate === 'function') {
        data = m.migrate(storedVersion, data)
        didMigrate = true
      }

      // 3. Schema parse: apply Zod defaults and validate.
      let parsed: unknown = data
      if (m.settingsSchema) {
        const result = m.settingsSchema.safeParse(data)
        if (result.success) {
          parsed = result.data
        } else {
          // Parse with empty object so Zod's .default() fills everything.
          console.warn(
            `[bootstrap] Settings for "${m.id}" failed schema validation; applying defaults.`,
            result.error,
          )
          const fallback = m.settingsSchema.safeParse({})
          parsed = fallback.success ? fallback.data : {}
          // Recover: persist the clean defaults.
          await window.openPenApi?.setModuleSettings(
            m.id,
            parsed as Record<string, unknown>,
            targetVersion,
          )
        }
      }

      // 4. Persist if migration ran or version advanced.
      if (didMigrate || storedVersion < targetVersion) {
        await window.openPenApi?.setModuleSettings(
          m.id,
          parsed as Record<string, unknown>,
          targetVersion,
        )
      }

      // 5. Store in renderer cache.
      setSettingsCache(m.id, parsed)
    } catch (err) {
      console.error(`[bootstrap] prepareModuleSettings failed for "${m.id}":`, err)
      // Cache empty object so getSettings() never throws.
      setSettingsCache(m.id, {})
    }
  }
}

function makeSetupContextFactory(locale: string): (moduleId: string) => ModuleSetupContext {
  return (moduleId: string): ModuleSetupContext => ({
    moduleId,
    locale,
    // Return the live cache entry hydrated before setup() was called.
    getSettings: <T = unknown>(): T => (getSettingsCache(moduleId) ?? {}) as unknown as T,
    // Shallow-merge patch, validate, persist, update cache, notify subscribers.
    updateSettings: async <T = unknown>(patch: Partial<T>): Promise<void> => {
      const m = getModule(moduleId)
      if (!m?.settingsSchema) {
        throw new Error(
          `[module-api] ctx.updateSettings() requires a settingsSchema on the module definition for "${moduleId}".`,
        )
      }
      const current = (getSettingsCache(moduleId) ?? {}) as Record<string, unknown>
      const merged = { ...current, ...(patch as Record<string, unknown>) }
      const result = m.settingsSchema.safeParse(merged)
      if (!result.success) {
        throw result.error
      }
      await window.openPenApi?.setModuleSettings(
        moduleId,
        result.data as Record<string, unknown>,
        m.settingsVersion ?? 1,
      )
      // Local cache update only; subscriber notification is owned by the
      // MODULE.SETTINGS_CHANGED broadcast handler in initModuleRuntime so
      // every window — including this one — receives exactly one event per
      // write.
      setSettingsCache(moduleId, result.data)
    },
    // Subscribe to settings changes for this module.
    onSettingsChange: <T = unknown>(cb: (settings: T) => void): (() => void) => {
      return subscribeSettingsChange(moduleId, (value) => cb(value as T))
    },
    // moduleId-bound main-handler dispatch. Captures the module's id
    // in closure so plugins cannot dial other modules' handlers
    // through this surface (the underlying `openPenApi.moduleCall` is
    // still reachable for transport, but the documented / DX-blessed
    // path is this bound helper).
    callMain: async <T = unknown>(action: string, payload?: unknown): Promise<T> => {
      const result = await window.openPenApi?.moduleCall(moduleId, action, payload)
      return result as T
    },
    // onDispose is injected by module-loader; this stub is overwritten
    // immediately after the context is constructed.
    onDispose: () => {},
    // Notification API: plugins trigger a toast via ctx.notify(payload).
    notify: (payload) => pushNotification(payload, { source: moduleId }),
    // i18n helper: key is automatically namespaced under the module's
    // sanitized namespace (e.g. `@openpen/freehand` → `openpen.freehand.key`).
    t: (key: string, params?: Record<string, unknown>): string => {
      const namespacedKey = `${sanitizeIdForI18n(moduleId)}.${key}`
      // vue-i18n composition mode: global.t second arg accepts NamedValue (= Record<string, unknown>)
      return params
        ? (i18n.global.t as (k: string, named: Record<string, unknown>) => string)(
            namespacedKey,
            params,
          )
        : i18n.global.t(namespacedKey)
    },
  })
}

/**
 * Merge each successfully-loaded module's locale dictionaries into the
 * vue-i18n global messages under the namespace [locale][moduleId].
 * Components call t('<moduleId>.<key>') to access these strings.
 */
function mergeModuleLocales(modules: readonly OpenPenModule[]): void {
  for (const m of modules) {
    const locales = m.contributes?.locales
    if (!locales || typeof locales !== 'object') continue
    // en.json is the canonical English fallback — used as the base dict to fill
    // gaps when a per-locale dict is missing keys.
    const baseDict = locales['en'] ?? {}
    const idParts = sanitizeIdForI18n(m.id).split('.')
    for (const [locale, dict] of Object.entries(locales)) {
      const merged = locale === 'en' ? dict : { ...baseDict, ...dict }
      // Build nested object so vue-i18n's dot-separated path lookup
      // (`t('openpen.freehand.name')` → messages.en.openpen.freehand.name)
      // resolves correctly. A flat `'openpen.freehand'` key would not.
      let nested: Record<string, unknown> = merged as Record<string, unknown>
      for (let i = idParts.length - 1; i >= 0; i--) {
        nested = { [idParts[i]]: nested }
      }
      i18n.global.mergeLocaleMessage(locale, nested)
    }
  }
}

/** Tear down listeners and registry state. Used in tests / reloads. */
export function cleanupModuleRuntime(): void {
  unsubManifests?.()
  unsubManifests = null
  unsubLifecycle?.()
  unsubLifecycle = null
  unsubModuleSettingsChanged?.()
  unsubModuleSettingsChanged = null
  loadedModulesForLifecycle = []
  for (const m of getAllModules()) {
    unsubscribeModuleEvents(m.id)
    unregisterModuleShortcuts(m.id)
    unregisterModule(m.id)
  }
  teardownShortcutDispatcher()
  resetModuleRegistry()
  resetContributionStore()
  clearEventBus()
  resetSettingsCacheForTest()
}
