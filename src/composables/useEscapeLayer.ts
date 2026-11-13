import { onBeforeUnmount, watch } from 'vue'

/**
 * Escape key layering for hand-rolled overlay dialogs.
 *
 * Each open dialog registers a layer; a single document listener hands every
 * Escape press to the most recently opened layer only, so a dialog stacked on
 * top of another closes first and the one below stays open.
 *
 * The listener runs in the bubble phase on purpose: a hotkey recorder captures
 * keys first and swallows Escape (`defaultPrevented`), which must only stop the
 * recording and not close any dialog.
 */

interface EscapeLayer {
  /** Called on Escape; a layer with no handler still blocks the layers below. */
  onEscape: (() => void) | null
}

const stack: EscapeLayer[] = []

// Reka-based dialogs (AppDialog) close themselves on Escape without calling
// preventDefault, so while one is open the layers below must stay put.
const REKA_OPEN_DIALOG = '[role="dialog"][data-state="open"]'

function onKeyDown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  if (document.querySelector(REKA_OPEN_DIALOG)) return
  const top = stack[stack.length - 1]
  top?.onEscape?.()
}

function push(layer: EscapeLayer) {
  if (stack.length === 0) document.addEventListener('keydown', onKeyDown)
  stack.push(layer)
}

function remove(layer: EscapeLayer) {
  const index = stack.indexOf(layer)
  if (index === -1) return
  stack.splice(index, 1)
  if (stack.length === 0) document.removeEventListener('keydown', onKeyDown)
}

/**
 * Registers the calling dialog as an Escape layer while `isOpen()` is true.
 * Pass `null` as `onEscape` for a dialog that must not close on Escape but
 * still has to keep the dialogs below it open.
 */
export function useEscapeLayer(isOpen: () => boolean, onEscape: (() => void) | null) {
  const layer: EscapeLayer = { onEscape }

  watch(
    isOpen,
    (open) => {
      if (open) push(layer)
      else remove(layer)
    },
    { immediate: true, flush: 'sync' },
  )

  onBeforeUnmount(() => remove(layer))
}
