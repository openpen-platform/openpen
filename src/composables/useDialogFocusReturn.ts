import { watch } from 'vue'

/**
 * Focus return for hand-rolled dialogs wrapped in a reka-ui `FocusScope`.
 *
 * FocusScope restores focus to whatever was focused after the next tick, which
 * is the page body when one dialog closes while the next opens in the same
 * tick (install flows). This records the element that was focused before the
 * first dialog of a chain opened and restores it once no dialog is left.
 * When that element is gone, the nearest ancestor that is still attached
 * takes the focus.
 */

interface Opener {
  element: HTMLElement
  ancestors: HTMLElement[]
}

let chainOpener: Opener | null = null

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]'

function capture() {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || active === document.body) return
  // Focus inside a dialog means this open continues a chain: keep the opener
  // recorded when the first dialog of the chain opened.
  if (active.closest('[role="dialog"]') && chainOpener) return
  const ancestors: HTMLElement[] = []
  for (let el = active.parentElement; el && el !== document.body; el = el.parentElement) ancestors.push(el)
  chainOpener = { element: active, ancestors }
}

function restore() {
  if (document.querySelector('[role="dialog"]')) return
  const opener = chainOpener
  chainOpener = null
  if (!opener) return
  const target = [opener.element, ...opener.ancestors].find((el) => el.isConnected)
  if (!target) return
  if (!target.matches(FOCUSABLE)) target.tabIndex = -1
  target.focus({ preventScroll: true })
}

/**
 * Returns the handler for FocusScope's `unmount-auto-focus` event; it takes
 * over focus restoration from FocusScope.
 */
export function useDialogFocusReturn(isOpen: () => boolean) {
  watch(isOpen, (open) => { if (open) capture() }, { immediate: true, flush: 'sync' })

  return (event: Event) => {
    event.preventDefault()
    setTimeout(restore, 0)
  }
}
