/**
 * useDialog.contract.test.ts
 *
 * Contract test for the useDialog() composable public API surface.
 *
 * Verifies:
 * 1. useDialog() returns an object with the four required methods.
 * 2. Each method returns a Promise.
 * 3. Sequential calls queue correctly — the second call's promise stays
 *    pending until the first is resolved.
 *
 * This file does NOT mount DialogHost; it tests the store/queue logic
 * directly via the exported internals.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { useDialog, _activeRequest, _resolveActive } from './useDialog'

// Reset module-scoped state between tests by resolving any leftover active
// request before each test.
beforeEach(() => {
  // Drain leftover state: if something is active, forcibly clear it.
  if (_activeRequest.value) {
    _resolveActive()
  }
})

describe('useDialog() API shape', () => {
  it('returns an object with confirm, alert, prompt, custom methods', () => {
    const dialog = useDialog()
    expect(typeof dialog.confirm).toBe('function')
    expect(typeof dialog.alert).toBe('function')
    expect(typeof dialog.prompt).toBe('function')
    expect(typeof dialog.custom).toBe('function')
  })

  it('confirm() returns a Promise', () => {
    const dialog = useDialog()
    const p = dialog.confirm({ title: 'Test', message: 'Are you sure?' })
    expect(p).toBeInstanceOf(Promise)
    // Clean up — resolve so we don't leave pending work.
    _resolveActive()
  })

  it('alert() returns a Promise', () => {
    const dialog = useDialog()
    const p = dialog.alert({ title: 'Info', message: 'Done.' })
    expect(p).toBeInstanceOf(Promise)
    _resolveActive()
  })

  it('prompt() returns a Promise', () => {
    const dialog = useDialog()
    const p = dialog.prompt({ title: 'Enter name', message: 'Your name:' })
    expect(p).toBeInstanceOf(Promise)
    _resolveActive()
  })

  it('custom() returns a Promise', () => {
    const dialog = useDialog()
    const p = dialog.custom({ title: 'Custom', component: {} as never })
    expect(p).toBeInstanceOf(Promise)
    _resolveActive()
  })
})

describe('useDialog() sequential queuing', () => {
  it('second call stays pending while first is active', async () => {
    const dialog = useDialog()

    let firstResolved = false
    let secondResolved = false

    // First call — becomes active immediately.
    const first = dialog.confirm({ title: 'First', message: 'First dialog' })
    first.then(() => { firstResolved = true })

    // Second call — must queue behind first.
    const second = dialog.confirm({ title: 'Second', message: 'Second dialog' })
    second.then(() => { secondResolved = true })

    // Give microtasks a chance to flush.
    await Promise.resolve()

    // First is active, second is still queued.
    expect(_activeRequest.value?.opts.title).toBe('First')
    expect(firstResolved).toBe(false)
    expect(secondResolved).toBe(false)

    // Resolve the first dialog (simulate DialogHost calling resolve + _resolveActive).
    const firstReq = _activeRequest.value
    if (firstReq?.kind === 'confirm') firstReq.resolve(true)
    _resolveActive()

    // Flush microtasks — first promise resolves, second becomes active.
    await Promise.resolve()
    await Promise.resolve()

    expect(firstResolved).toBe(true)
    expect(secondResolved).toBe(false)
    expect(_activeRequest.value?.opts.title).toBe('Second')

    // Resolve the second.
    const secondReq = _activeRequest.value
    if (secondReq?.kind === 'confirm') secondReq.resolve(false)
    _resolveActive()

    await Promise.resolve()
    await Promise.resolve()

    expect(secondResolved).toBe(true)
    expect(_activeRequest.value).toBeNull()
  })
})
