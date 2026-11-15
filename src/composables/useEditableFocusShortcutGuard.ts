/**
 * useEditableFocusShortcutGuard — while a text-entry element has focus, release
 * the OS-level shortcut grabs so every key reaches that element.
 *
 * Drawing-scoped single keys (P, L, R, 1-8, ...) are bound with
 * `globalShortcut`, which swallows the key before the focused renderer sees
 * it. Without this guard a text editor opened by a plugin loses focus on the
 * first such letter and the rest of the word triggers tool switches.
 *
 * It reuses the ref-counted `setShortcutsSuspended` bridge the Settings window
 * uses. Side effect: the drawing-mode toggle accelerator is released too while
 * typing; it is restored as soon as the editor loses focus (Enter / Esc).
 */

const EDITABLE_INPUT_TYPES = new Set([
  'text', 'search', 'url', 'tel', 'email', 'password', 'number', '',
])

/** True when typing into `el` produces text (so letter keys must not be grabbed). */
export function isEditableElement(el: Element | null | undefined): boolean {
  if (!el) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA') return !(el as HTMLTextAreaElement).readOnly
  if (tag === 'INPUT') {
    const input = el as HTMLInputElement
    return !input.readOnly && EDITABLE_INPUT_TYPES.has((input.getAttribute('type') ?? '').toLowerCase())
  }
  return (el as HTMLElement).isContentEditable === true
}

/**
 * Start tracking focus on `doc`. Returns a `cleanup()` that detaches the
 * listeners and, if shortcuts are still suspended by this guard, resumes them.
 */
export function startEditableFocusShortcutGuard(doc: Document = document): () => void {
  let held = false
  let observer: MutationObserver | null = null

  const set = (next: boolean) => {
    if (next === held) return
    held = next
    window.openPenApi?.setShortcutsSuspended(next)
  }

  // A focused editor removed from the DOM may not fire focusout; re-evaluate.
  const recheck = () => set(isEditableElement(doc.activeElement))

  const onFocusIn = (e: FocusEvent) => {
    if (isEditableElement(e.target as Element)) set(true)
  }
  const onFocusOut = (e: FocusEvent) => {
    // Focus hopping between two editors keeps the suspension.
    if (isEditableElement(e.relatedTarget as Element | null)) return
    set(false)
  }

  doc.addEventListener('focusin', onFocusIn, true)
  doc.addEventListener('focusout', onFocusOut, true)
  if (typeof MutationObserver !== 'undefined' && doc.body) {
    observer = new MutationObserver(() => { if (held) recheck() })
    observer.observe(doc.body, { childList: true, subtree: true })
  }

  return () => {
    doc.removeEventListener('focusin', onFocusIn, true)
    doc.removeEventListener('focusout', onFocusOut, true)
    observer?.disconnect()
    set(false)
  }
}
