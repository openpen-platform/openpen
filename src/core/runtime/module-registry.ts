/**
 * In-memory registry of loaded OpenPen modules, keyed by id.
 *
 * This is the single answer to "what modules are currently active?"
 * It's intentionally tiny: insertion order is preserved (so the
 * Modules manager UI can show modules in load order), and the only
 * mutation paths are register / unregister.
 *
 * Validation runs upstream in `module-validator`. The registry only
 * defends against caller mistakes (duplicate registration) since
 * those would otherwise silently overwrite the previous module and
 * leak its contributions into the contribution-store.
 */
import type { OpenPenModule } from '@openpen/module-api'

const modules = new Map<string, OpenPenModule>()

export function registerModule(module: OpenPenModule): void {
  if (modules.has(module.id)) {
    throw new Error(
      `[module-registry] Module "${module.id}" is already registered. ` +
        `Cross-module duplicate-id checks should run in module-validator before reaching the registry.`
    )
  }
  modules.set(module.id, module)
}

export function unregisterModule(moduleId: string): boolean {
  return modules.delete(moduleId)
}

export function getModule(moduleId: string): OpenPenModule | undefined {
  return modules.get(moduleId)
}

export function hasModule(moduleId: string): boolean {
  return modules.has(moduleId)
}

/** Returns a snapshot in insertion order. Mutating it does not affect the registry. */
export function getAllModules(): OpenPenModule[] {
  return [...modules.values()]
}

/** Test-only: drop everything. */
export function resetModuleRegistry(): void {
  modules.clear()
}
