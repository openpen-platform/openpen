import { describe, it, expect } from 'vitest'
import { sanitizeIdForI18n } from '@openpen/module-api'

describe('sanitizeIdForI18n', () => {
  it('converts @openpen/freehand to openpen.freehand', () => {
    expect(sanitizeIdForI18n('@openpen/freehand')).toBe('openpen.freehand')
  })

  it('converts @alice/todo to alice.todo', () => {
    expect(sanitizeIdForI18n('@alice/todo')).toBe('alice.todo')
  })

  it('preserves hyphens in scope and name', () => {
    expect(sanitizeIdForI18n('@scope-with-hyphens/name-with-hyphens')).toBe(
      'scope-with-hyphens.name-with-hyphens'
    )
  })

  it('returns empty string unchanged without throwing', () => {
    expect(sanitizeIdForI18n('')).toBe('')
  })
})
