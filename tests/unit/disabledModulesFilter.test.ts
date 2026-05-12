import { describe, it, expect } from 'vitest'
import type { OpenPenModule } from '@openpen/module-api'
import { filterDisabledModules } from '../../src/core/runtime/bootstrap'

function makeModule(id: string): OpenPenModule {
  return { id, version: '1.0.0' } as OpenPenModule
}

describe('filterDisabledModules', () => {
  it('returns all modules when disabled list is empty', () => {
    const modules = [makeModule('a'), makeModule('b'), makeModule('c')]
    expect(filterDisabledModules(modules, [])).toHaveLength(3)
  })

  it('filters out a module whose id is in the disabled set', () => {
    const modules = [makeModule('@openpen/freehand'), makeModule('@openpen/line'), makeModule('@openpen/color')]
    const result = filterDisabledModules(modules, ['@openpen/line'])
    expect(result.map((m) => m.id)).toEqual(['@openpen/freehand', '@openpen/color'])
  })

  it('is a no-op when a disabled id does not match any module', () => {
    const modules = [makeModule('@openpen/freehand'), makeModule('@openpen/eraser')]
    const result = filterDisabledModules(modules, ['nonexistent'])
    expect(result).toHaveLength(2)
  })

  it('filters multiple disabled ids at once', () => {
    const modules = [makeModule('a'), makeModule('b'), makeModule('c'), makeModule('d')]
    const result = filterDisabledModules(modules, ['b', 'd'])
    expect(result.map((m) => m.id)).toEqual(['a', 'c'])
  })
})
