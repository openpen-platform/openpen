import { ref, computed, onUnmounted, readonly, type Ref } from 'vue'

export function useDiagnostics(): {
  events: Readonly<Ref<readonly DiagnosticsEvent[]>>
  pendingCount: Readonly<Ref<number>>
  acknowledge: (id: string) => Promise<void>
  openBackupDir: (backupPath: string) => Promise<void>
  cleanup: () => void
} {
  const eventsRef = ref<readonly DiagnosticsEvent[]>([])

  let unsubscribe: (() => void) | null = null

  // Seed initial state from main.
  window.openPenApi?.getDiagnosticsState().then((state) => {
    eventsRef.value = state.events
  })

  // Subscribe to live updates pushed from main.
  unsubscribe = window.openPenApi?.onDiagnosticsStateChanged((state) => {
    eventsRef.value = state.events
  }) ?? null

  const pendingCountRef = computed(
    () => eventsRef.value.filter((e) => e.acknowledgedAt === null).length
  )

  async function acknowledge(id: string): Promise<void> {
    await window.openPenApi?.acknowledgeDiagnostics(id)
  }

  async function openBackupDir(backupPath: string): Promise<void> {
    await window.openPenApi?.openBackupDir(backupPath)
  }

  function cleanup(): void {
    unsubscribe?.()
    unsubscribe = null
  }

  // Auto-cleanup when called inside a component lifecycle.
  try {
    onUnmounted(cleanup)
  } catch {
    // Called outside component scope — caller is responsible for cleanup().
  }

  return {
    events: readonly(eventsRef),
    pendingCount: readonly(pendingCountRef),
    acknowledge,
    openBackupDir,
    cleanup,
  }
}
