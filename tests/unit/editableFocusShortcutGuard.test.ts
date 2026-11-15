import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isEditableElement,
  startEditableFocusShortcutGuard,
} from '../../src/composables/useEditableFocusShortcutGuard'

describe('editable focus shortcut guard', () => {
  const setShortcutsSuspended = vi.fn()
  let stop: () => void

  beforeEach(() => {
    setShortcutsSuspended.mockClear()
    ;(window as unknown as { openPenApi: unknown }).openPenApi = { setShortcutsSuspended }
    document.body.innerHTML = '<textarea id="t"></textarea><button id="b">x</button><input id="i" type="checkbox">'
    stop = startEditableFocusShortcutGuard(document)
  })

  afterEach(() => {
    stop()
    delete (window as unknown as { openPenApi?: unknown }).openPenApi
  })

  it('suspends while an editor is focused and resumes when it loses focus', () => {
    const t = document.getElementById('t') as HTMLTextAreaElement
    t.focus()
    expect(setShortcutsSuspended).toHaveBeenLastCalledWith(true)
    t.blur()
    expect(setShortcutsSuspended).toHaveBeenLastCalledWith(false)
    expect(setShortcutsSuspended).toHaveBeenCalledTimes(2)
  })

  it('ignores focus on non-text elements', () => {
    ;(document.getElementById('b') as HTMLElement).focus()
    ;(document.getElementById('i') as HTMLElement).focus()
    expect(setShortcutsSuspended).not.toHaveBeenCalled()
    expect(isEditableElement(document.getElementById('i'))).toBe(false)
  })

  it('resumes on cleanup if still held', () => {
    ;(document.getElementById('t') as HTMLTextAreaElement).focus()
    stop()
    expect(setShortcutsSuspended).toHaveBeenLastCalledWith(false)
  })
})
