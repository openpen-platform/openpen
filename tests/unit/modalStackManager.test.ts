/**
 * ModalManager open/close API.
 *
 * Verifies that:
 * 1. MODAL_MANAGER_KEY is exported from @openpen/module-api.
 * 2. The ModalManager open/close/isOpen contract works as specified.
 */
import { describe, it, expect } from 'vitest'
import { MODAL_MANAGER_KEY } from '@openpen/module-api'
import type { ModalManager } from '@openpen/module-api'

describe('MODAL_MANAGER_KEY', () => {
  it('is exported from @openpen/module-api as a symbol', () => {
    expect(MODAL_MANAGER_KEY).toBeDefined()
    expect(typeof MODAL_MANAGER_KEY).toBe('symbol')
  })
})

describe('ModalManager contract', () => {
  function makeManager(): ModalManager {
    let active: string | null = null
    return {
      open(id: string) { active = id },
      close(id: string) { if (active === id) active = null },
      isOpen(id: string) { return active === id },
    }
  }

  it('open sets the active modal', () => {
    const m = makeManager()
    m.open('color-picker')
    expect(m.isOpen('color-picker')).toBe(true)
  })

  it('open replaces any previously-open modal', () => {
    const m = makeManager()
    m.open('color-picker')
    m.open('stroke-width-popup')
    expect(m.isOpen('color-picker')).toBe(false)
    expect(m.isOpen('stroke-width-popup')).toBe(true)
  })

  it('close hides the modal', () => {
    const m = makeManager()
    m.open('color-picker')
    m.close('color-picker')
    expect(m.isOpen('color-picker')).toBe(false)
  })

  it('close is a no-op for a different id', () => {
    const m = makeManager()
    m.open('color-picker')
    m.close('stroke-width-popup')
    expect(m.isOpen('color-picker')).toBe(true)
  })

  it('isOpen returns false when nothing is open', () => {
    const m = makeManager()
    expect(m.isOpen('any-modal')).toBe(false)
  })
})
