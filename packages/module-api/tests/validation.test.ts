import { describe, it, expect } from 'vitest'
import { isValidModuleId, MODULE_ID_RE } from '../src/validation'

describe('Module ID validation', () => {
  it.each([
    // valid — @scope/name format
    ['@openpen/freehand', true],
    ['@alice/todo', true],
    ['@scope-a/name-b', true],
    ['@a/b', true],
    // invalid — bare ids (no scope)
    ['simple', false],
    ['my-module', false],
    ['stroke-width', false],
    ['a', false],
    // invalid — missing name segment
    ['@scope', false],
    ['@scope/', false],
    // invalid — leading dash in scope or name
    ['@-scope/name', false],
    ['@scope/-name', false],
    // invalid — missing @
    ['scope/name', false],
    // invalid — empty
    ['', false],
    // invalid — special chars
    ['@scope/name space', false],
    ['@scope/has!special', false],
    ['@scope/has.dot', false],
    // invalid — segment too long (>39 chars)
    ['@' + 'a'.repeat(40) + '/name', false],
    ['@scope/' + 'a'.repeat(40), false],
  ])('id="%s" → valid=%s', (id, expected) => {
    expect(isValidModuleId(id)).toBe(expected)
  })

  it('exposes the regex constant', () => {
    expect(MODULE_ID_RE).toBeInstanceOf(RegExp)
    expect(MODULE_ID_RE.test('@openpen/valid-id')).toBe(true)
  })
})
