/**
 * usePassthroughGuard — keep the transparent main window passthrough-by-default,
 * but disable passthrough whenever the cursor is over an interactive
 * element so users can actually click on UI surfaces.
 *
 * The host main window is created with `setIgnoreMouseEvents(true, { forward: true })`
 * so users can interact with whatever is underneath OpenPen by default.
 * The renderer toggles this off when the cursor enters an interactive element
 * and back on when the cursor leaves.
 *
 * Accepts two call signatures:
 *
 *   // Ref-based (preferred):
 *   const el = useTemplateRef<HTMLElement>('content')
 *   usePassthroughGuard(el)
 *
 *   // Selector-based (used by global host containers — ControlBar, ModalStack, StatusBar):
 *   usePassthroughGuard('.openpen-interactive, .openpen-interactive *')
 *
 * When a Ref is passed, the guard attaches mousemove/mouseleave/visibilitychange
 * directly to the document and checks whether the pointer is inside the element.
 * When a selector string is passed, the guard uses document.elementFromPoint
 * to resolve the target element via the selector.
 *
 * Convention: any module-contributed UI that wants to receive clicks
 * should add the `openpen-interactive` class (or be nested inside an
 * element that has it). Core containers — ControlBar, ModalStack,
 * StatusBar, HtmlOverlayLayer — apply it themselves.
 */
import { onMounted, onUnmounted, unref } from 'vue'
import type { Ref } from 'vue'

const DEFAULT_SELECTOR = '.openpen-interactive, .openpen-interactive *'

export function usePassthroughGuard(target: string | Ref<HTMLElement | null> = DEFAULT_SELECTOR): void {
  let ignoring = true

  function onMove(e: MouseEvent) {
    let shouldIgnore: boolean

    if (typeof target === 'string') {
      // Selector-based: use document.elementFromPoint to check
      const el = document.elementFromPoint(e.clientX, e.clientY)
      shouldIgnore = !el?.closest(target)
    } else {
      // Ref-based: check whether the pointer is inside the registered element
      const el = unref(target)
      if (!el) {
        shouldIgnore = true
      } else {
        shouldIgnore = !el.contains(document.elementFromPoint(e.clientX, e.clientY))
      }
    }

    if (shouldIgnore !== ignoring) {
      ignoring = shouldIgnore
      window.openPenApi?.setIgnoreMouseEvents(shouldIgnore)
    }
  }

  function onWindowLeave() {
    if (!ignoring) {
      ignoring = true
      window.openPenApi?.setIgnoreMouseEvents(true)
    }
  }

  function onVisibilityChange() {
    if (document.hidden && !ignoring) {
      ignoring = true
      window.openPenApi?.setIgnoreMouseEvents(true)
    }
  }

  onMounted(() => {
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseleave', onWindowLeave)
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseleave', onWindowLeave)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })
}
