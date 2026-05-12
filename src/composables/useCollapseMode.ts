import { ref, readonly, unref, type MaybeRef } from 'vue'

export function useCollapseMode(
  { autoCollapseDelay = 3000 }: { autoCollapseDelay?: MaybeRef<number> } = {}
) {
  // DEV-only: ?expand=1 auto-expands the bar — useful for browser-based visual tests.
  const devExpand = import.meta.env.DEV && new URLSearchParams(location.search).get('expand') === '1'
  const isExpandedRef = ref(devExpand)
  const isPinnedRef = ref(false)

  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer(): void {
    if (timer !== null) { clearTimeout(timer); timer = null }
  }

  function expand(): void { clearTimer(); isExpandedRef.value = true }

  function collapse(): void { clearTimer(); isExpandedRef.value = false }

  function togglePin(): void {
    isPinnedRef.value = !isPinnedRef.value
    if (isPinnedRef.value) clearTimer()
  }

  /** Start the auto-collapse timer. No-op unless expanded and unpinned.
   *  Reads `autoCollapseDelay` via `unref` on every call so a reactive
   *  Ref input (e.g. backed by user settings) takes effect immediately. */
  function startCollapseTimer(): void {
    if (isPinnedRef.value || !isExpandedRef.value) return
    clearTimer()
    timer = setTimeout(collapse, unref(autoCollapseDelay))
  }

  function cancelCollapseTimer(): void { clearTimer() }

  function cleanup(): void { clearTimer() }

  return {
    isExpanded: readonly(isExpandedRef),
    isPinned: readonly(isPinnedRef),
    expand,
    collapse,
    togglePin,
    startCollapseTimer,
    cancelCollapseTimer,
    cleanup,
  }
}
