import { ref, computed, readonly } from 'vue'
import type { ComputedRef, DeepReadonly, Ref } from 'vue'

export interface UseModulesPanelReturn {
  currentDisabled: DeepReadonly<Ref<string[]>>
  initialDisabled: DeepReadonly<Ref<string[]>>
  pendingRestart: ComputedRef<boolean>
  toggleModule: (id: string, nextEnabled: boolean) => Promise<void>
  start: () => Promise<void>
  stop: () => void
}

export function useModulesPanel(): UseModulesPanelReturn {
  const currentDisabled = ref<string[]>([])
  const initialDisabled = ref<string[]>([])
  let unsubSettings: (() => void) | null = null

  const pendingRestart = computed(() => {
    const a = [...currentDisabled.value].sort()
    const b = [...initialDisabled.value].sort()
    return a.length !== b.length || a.some((v, i) => v !== b[i])
  })

  async function start(): Promise<void> {
    const [settings, initial] = await Promise.all([
      window.openPenApi?.getSettings() ?? Promise.resolve(null),
      window.openPenApi?.getInitialDisabledModules() ?? Promise.resolve([]),
    ])
    currentDisabled.value = settings?.disabledModules ?? []
    initialDisabled.value = initial ?? []

    unsubSettings = window.openPenApi?.onSettingsUpdated((s) => {
      currentDisabled.value = s.disabledModules ?? []
    }) ?? null
  }

  function stop(): void {
    unsubSettings?.()
    unsubSettings = null
  }

  async function toggleModule(id: string, nextEnabled: boolean): Promise<void> {
    const next = nextEnabled
      ? currentDisabled.value.filter((v) => v !== id)
      : [...currentDisabled.value, id]
    await window.openPenApi?.updateSettings({ disabledModules: next })
  }

  return {
    currentDisabled: readonly(currentDisabled),
    initialDisabled: readonly(initialDisabled),
    pendingRestart,
    toggleModule,
    start,
    stop,
  }
}
