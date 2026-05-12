/**
 * Host-side registry that backs `useModuleContext`.
 *
 * The renderer host (module-loader.ts) writes to this registry via
 * `setModuleContext` / `clearModuleContext` immediately around each
 * module's `setup()` call. Plugin-authored Vue components then read
 * from it via the public `useModuleContext` composable.
 *
 * Module code MUST NOT import from this file directly — use
 * `useModuleContext` from `@openpen/module-api` instead.
 */
import type { ModuleSetupContext } from '../types/module'

const registry = new Map<string, ModuleSetupContext>()

/** Register (or replace) the context for a module. Called by module-loader before setup(). */
export function setModuleContext(moduleId: string, ctx: ModuleSetupContext): void {
  registry.set(moduleId, ctx)
}

/** Remove the context for a module. Called by module-loader in rollbackModule(). */
export function clearModuleContext(moduleId: string): void {
  registry.delete(moduleId)
}

/** Look up the context for a module. Returns undefined if not registered. */
export function getModuleContext(moduleId: string): ModuleSetupContext | undefined {
  return registry.get(moduleId)
}

/** Resets the entire registry. Test-only — do not call in production code. */
export function resetModuleContextRegistryForTest(): void {
  registry.clear()
}
