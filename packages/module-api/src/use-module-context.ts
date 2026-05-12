import { getModuleContext } from './host/module-context-registry'
import type { ModuleSetupContext } from './types/module'

/**
 * Returns the `ModuleSetupContext` that was constructed for `moduleId` by
 * the host runtime. Call this inside a Vue component's `<script setup>` (or
 * `setup()`) to access `ctx.getSettings`, `ctx.updateSettings`,
 * `ctx.onSettingsChange`, `ctx.notify`, and all other context methods from
 * within a component tree — without having to prop-drill or provide/inject
 * the context object manually.
 *
 * @throws If `moduleId` is not currently registered (module not yet loaded,
 * already rolled back, or the id string doesn't match `defineModule({ id })`).
 *
 * @example
 * ```ts
 * // MySettingsPanel.vue
 * import { useModuleContext } from '@openpen/module-api'
 * import { onMounted, onUnmounted, ref } from 'vue'
 * import { z } from 'zod'
 *
 * const MySchema = z.object({ color: z.string().default('#fff') })
 * type MySettings = z.infer<typeof MySchema>
 *
 * const ctx = useModuleContext('my-plugin')
 * const color = ref(ctx.getSettings<MySettings>().color)
 *
 * let unsubscribe: (() => void) | null = null
 * onMounted(() => {
 *   unsubscribe = ctx.onSettingsChange<MySettings>((s) => { color.value = s.color })
 * })
 * onUnmounted(() => unsubscribe?.())
 *
 * async function changeColor(next: string) {
 *   await ctx.updateSettings<MySettings>({ color: next })
 * }
 * ```
 */
export function useModuleContext(moduleId: string): ModuleSetupContext {
  const ctx = getModuleContext(moduleId)
  if (!ctx) {
    throw new Error(
      `[module-api] useModuleContext("${moduleId}") was called but no module is currently registered under that id. ` +
      `This usually means: (a) the moduleId string does not match the id passed to defineModule, or ` +
      `(b) the composable was called before the module's setup() ran ` +
      `(do not call useModuleContext at module top-level — call it inside a component's setup() or onMounted()).`
    )
  }
  return ctx
}
