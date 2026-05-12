import { describe, it, expect } from 'vitest'
import { defineComponent } from 'vue'
import { defineModule } from '@openpen/module-api'
import {
  validateModules,
  deduplicateModules,
  type ValidationResult,
} from '../../src/core/runtime/module-validator'

const TestButton = defineComponent({ name: 'TestButton' })

const HOST_VERSION = '1.0.0'

function makeMod(id: string, extra: Partial<Parameters<typeof defineModule>[0]> & { dir?: string } = {}) {
  const { dir, ...rest } = extra
  const mod = defineModule({
    id,
    contributes: { tools: [] },
    ...rest,
  })
  // Attach dir as a plain property (mirrors real plugin manifest shape).
  if (dir !== undefined) {
    ;(mod as unknown as Record<string, unknown>)['dir'] = dir
  }
  return mod
}

describe('module-validator — deduplicateModules', () => {
  it('returns all modules when there are no conflicts', () => {
    const mods = [makeMod('@test/a'), makeMod('@test/b'), makeMod('@test/c')]
    const { accepted, skipped, pluginConflicts } = deduplicateModules(mods)
    expect(accepted.map((m) => m.id)).toEqual(['@test/a', '@test/b', '@test/c'])
    expect(skipped).toHaveLength(0)
    expect(pluginConflicts).toHaveLength(0)
  })

  it('plugin vs built-in: plugin is skipped with duplicate-built-in reason', () => {
    const builtIn = makeMod('@test/freehand')
    const plugin = makeMod('@test/freehand')
    const builtInIds = new Set(['@test/freehand'])
    const { accepted, skipped, pluginConflicts } = deduplicateModules([builtIn, plugin], builtInIds)
    expect(accepted).toHaveLength(1)
    expect(accepted[0].id).toBe('@test/freehand')
    expect(skipped).toHaveLength(1)
    expect(skipped[0].module.id).toBe('@test/freehand')
    expect(skipped[0].reason).toBe('duplicate-built-in')
    expect(pluginConflicts).toHaveLength(0)
  })

  it('plugin vs plugin conflict: both go into pluginConflicts, neither accepted', () => {
    const p1 = makeMod('@vendor/tool')
    const p2 = makeMod('@vendor/tool')
    const { accepted, skipped, pluginConflicts } = deduplicateModules([p1, p2])
    expect(accepted).toHaveLength(0)
    expect(skipped).toHaveLength(0)
    expect(pluginConflicts).toHaveLength(1)
    expect(pluginConflicts[0].id).toBe('@vendor/tool')
    expect(pluginConflicts[0].candidates).toHaveLength(2)
    expect(pluginConflicts[0].candidates).toEqual(expect.arrayContaining([p1, p2]))
  })

  it('three plugins share same id: all go into pluginConflicts', () => {
    const p1 = makeMod('@vendor/tool')
    const p2 = makeMod('@vendor/tool')
    const p3 = makeMod('@vendor/tool')
    const { accepted, skipped, pluginConflicts } = deduplicateModules([p1, p2, p3])
    expect(accepted).toHaveLength(0)
    expect(skipped).toHaveLength(0)
    expect(pluginConflicts).toHaveLength(1)
    expect(pluginConflicts[0].candidates).toHaveLength(3)
  })

  it('mixed: built-ins accepted, conflicting plugin skipped, unique plugin accepted, plugin collision in conflict', () => {
    const builtIn1 = makeMod('@openpen/freehand')
    const builtIn2 = makeMod('@openpen/color')
    const conflictPlugin = makeMod('@openpen/freehand') // collides with built-in
    const uniquePlugin = makeMod('@vendor/extra')
    const collidingA = makeMod('@vendor/sticky')
    const collidingB = makeMod('@vendor/sticky')
    const builtInIds = new Set(['@openpen/freehand', '@openpen/color'])

    const { accepted, skipped, pluginConflicts } = deduplicateModules(
      [builtIn1, builtIn2, conflictPlugin, uniquePlugin, collidingA, collidingB],
      builtInIds,
    )

    expect(accepted.map((m) => m.id)).toEqual(
      expect.arrayContaining(['@openpen/freehand', '@openpen/color', '@vendor/extra'])
    )
    expect(accepted).toHaveLength(3)
    expect(skipped).toHaveLength(1)
    expect(skipped[0].module.id).toBe('@openpen/freehand')
    expect(skipped[0].reason).toBe('duplicate-built-in')
    expect(pluginConflicts).toHaveLength(1)
    expect(pluginConflicts[0].id).toBe('@vendor/sticky')
  })

  it('built-in vs plugin: built-in wins, plugin skipped with duplicate-built-in', () => {
    const builtIn = makeMod('@openpen/freehand')
    const plugin = makeMod('@openpen/freehand')
    const builtInIds = new Set(['@openpen/freehand'])
    const { accepted, skipped, pluginConflicts } = deduplicateModules([builtIn, plugin], builtInIds)
    expect(accepted).toHaveLength(1)
    expect(accepted[0]).toBe(builtIn)
    expect(skipped).toHaveLength(1)
    expect(skipped[0].module).toBe(plugin)
    expect(skipped[0].reason).toBe('duplicate-built-in')
    expect(pluginConflicts).toHaveLength(0)
  })

  it('userResolutions: resolved conflict accepts chosen dir, skips others with conflict-not-chosen', () => {
    const p1 = makeMod('@vendor/tool', { dir: '/plugins/tool-a' })
    const p2 = makeMod('@vendor/tool', { dir: '/plugins/tool-b' })
    const { accepted, skipped, pluginConflicts } = deduplicateModules(
      [p1, p2],
      new Set(),
      { '@vendor/tool': '/plugins/tool-a' },
    )
    expect(pluginConflicts).toHaveLength(0)
    expect(accepted).toHaveLength(1)
    expect((accepted[0] as unknown as Record<string, unknown>)['dir']).toBe('/plugins/tool-a')
    expect(skipped).toHaveLength(1)
    expect(skipped[0].reason).toBe('conflict-not-chosen')
    expect((skipped[0].module as unknown as Record<string, unknown>)['dir']).toBe('/plugins/tool-b')
  })

  it('userResolutions: three candidates, chosen dir accepted, others skipped', () => {
    const p1 = makeMod('@vendor/note', { dir: '/plugins/note-1' })
    const p2 = makeMod('@vendor/note', { dir: '/plugins/note-2' })
    const p3 = makeMod('@vendor/note', { dir: '/plugins/note-3' })
    const { accepted, skipped, pluginConflicts } = deduplicateModules(
      [p1, p2, p3],
      new Set(),
      { '@vendor/note': '/plugins/note-2' },
    )
    expect(pluginConflicts).toHaveLength(0)
    expect(accepted).toHaveLength(1)
    expect((accepted[0] as unknown as Record<string, unknown>)['dir']).toBe('/plugins/note-2')
    expect(skipped).toHaveLength(2)
    expect(skipped.every((s) => s.reason === 'conflict-not-chosen')).toBe(true)
  })

  it('userResolutions: unrecognised dir falls back to unresolved conflict', () => {
    const p1 = makeMod('@vendor/tool', { dir: '/plugins/tool-a' })
    const p2 = makeMod('@vendor/tool', { dir: '/plugins/tool-b' })
    const { accepted, skipped, pluginConflicts } = deduplicateModules(
      [p1, p2],
      new Set(),
      { '@vendor/tool': '/plugins/tool-gone' },
    )
    expect(accepted).toHaveLength(0)
    expect(skipped).toHaveLength(0)
    expect(pluginConflicts).toHaveLength(1)
    expect(pluginConflicts[0].id).toBe('@vendor/tool')
  })

  it('userResolutions: unrelated resolution does not affect other groups', () => {
    const p1 = makeMod('@vendor/a', { dir: '/plugins/a-1' })
    const p2 = makeMod('@vendor/a', { dir: '/plugins/a-2' })
    const unique = makeMod('@vendor/b')
    const { accepted, skipped, pluginConflicts } = deduplicateModules(
      [p1, p2, unique],
      new Set(),
      { '@vendor/a': '/plugins/a-1' },
    )
    expect(accepted.map((m) => m.id)).toEqual(expect.arrayContaining(['@vendor/a', '@vendor/b']))
    expect(pluginConflicts).toHaveLength(0)
    expect(skipped).toHaveLength(1)
    expect(skipped[0].reason).toBe('conflict-not-chosen')
  })

  it('hard validation errors still detected after deduplication (schema/slot-conflict)', () => {
    const mods = [
      defineModule({
        id: '@test/w1',
        contributes: { strokeStyle: { provides: ['lineWidth'] } },
      }),
      defineModule({
        id: '@test/w2',
        contributes: { strokeStyle: { provides: ['lineWidth'] } },
      }),
    ]
    // No conflicts — deduplication is clean.
    const { pluginConflicts } = deduplicateModules(mods)
    expect(pluginConflicts).toHaveLength(0)
    // Hard error is caught by validateModules.
    const result = validateModules(mods, HOST_VERSION)
    expect(result.valid).toBe(false)
    expect(result.errors.find((e) => e.category === 'slot-conflict')).toBeDefined()
  })
})

describe('module-validator — validateModules', () => {
  it('returns valid for an empty list', () => {
    const result = validateModules([], HOST_VERSION)
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })

  it('returns valid for non-conflicting modules', () => {
    const mods = [makeMod('@test/a'), makeMod('@test/b'), makeMod('@test/c')]
    const result = validateModules(mods, HOST_VERSION)
    expect(result.valid).toBe(true)
  })

  it('no longer errors on duplicate ids (handled by deduplicateModules upstream)', () => {
    // validateModules receives already-deduplicated input in production.
    // Passing duplicates here should not produce a duplicate-id error.
    const mods = [makeMod('@test/dup'), makeMod('@test/dup')]
    const result = validateModules(mods, HOST_VERSION)
    const dupErrors = result.errors.filter((e) => e.category === 'duplicate-id')
    expect(dupErrors).toHaveLength(0)
  })

  describe('strokeStyle.provides conflicts', () => {
    it('detects two modules writing the same stroke style key', () => {
      const mods = [
        defineModule({
          id: '@test/width-a',
          contributes: { strokeStyle: { provides: ['lineWidth'] } },
        }),
        defineModule({
          id: '@test/width-b',
          contributes: { strokeStyle: { provides: ['lineWidth'] } },
        }),
      ]
      const result = validateModules(mods, HOST_VERSION)
      expect(result.valid).toBe(false)
      const conflict = result.errors.find((e) => e.category === 'slot-conflict')
      expect(conflict).toBeDefined()
      expect(conflict?.message).toMatch(/lineWidth/)
    })

    it('allows modules to provide disjoint keys', () => {
      const mods = [
        defineModule({
          id: '@test/width',
          contributes: { strokeStyle: { provides: ['lineWidth'] } },
        }),
        defineModule({
          id: '@test/color',
          contributes: { strokeStyle: { provides: ['color'] } },
        }),
      ]
      const result = validateModules(mods, HOST_VERSION)
      expect(result.valid).toBe(true)
    })
  })

  describe('minAppVersion check', () => {
    it('rejects a module that requires a newer host', () => {
      const mod = defineModule({
        id: '@test/future',
        minAppVersion: '2.0.0',
        contributes: { tools: [] },
      })
      const result = validateModules([mod], '1.0.0')
      expect(result.valid).toBe(false)
      const err = result.errors.find((e) => e.category === 'min-version')
      expect(err).toBeDefined()
      expect(err?.moduleId).toBe('@test/future')
    })

    it('accepts a module whose minAppVersion equals host', () => {
      const mod = defineModule({
        id: '@test/tight',
        minAppVersion: '1.0.0',
        contributes: { tools: [] },
      })
      const result = validateModules([mod], '1.0.0')
      expect(result.valid).toBe(true)
    })

    it('accepts a module whose minAppVersion is older', () => {
      const mod = defineModule({
        id: '@test/compatible',
        minAppVersion: '0.5.0',
        contributes: { tools: [] },
      })
      const result = validateModules([mod], '1.0.0')
      expect(result.valid).toBe(true)
    })

    it('skips check when minAppVersion is omitted', () => {
      const mod = defineModule({ id: '@test/no-pin', contributes: { tools: [] } })
      const result = validateModules([mod], '1.0.0')
      expect(result.valid).toBe(true)
    })
  })

  describe('control-bar item id conflicts', () => {
    it('detects two modules contributing the same control-bar item id', () => {
      const mods = [
        defineModule({
          id: '@test/mod-a',
          contributes: { controlBar: [{ id: 'shared', component: TestButton }] },
        }),
        defineModule({
          id: '@test/mod-b',
          contributes: { controlBar: [{ id: 'shared', component: TestButton }] },
        }),
      ]
      const result = validateModules(mods, HOST_VERSION)
      expect(result.valid).toBe(false)
      const conflict = result.errors.find((e) => e.category === 'slot-conflict')
      expect(conflict).toBeDefined()
      expect(conflict?.message).toMatch(/shared/)
      expect(conflict?.message).toMatch(/mod-a/)
      expect(conflict?.message).toMatch(/mod-b/)
    })

    it('allows modules with disjoint control-bar item ids', () => {
      const mods = [
        defineModule({
          id: '@test/mod-a',
          contributes: { controlBar: [{ id: 'aaa', component: TestButton }] },
        }),
        defineModule({
          id: '@test/mod-b',
          contributes: { controlBar: [{ id: 'bbb', component: TestButton }] },
        }),
      ]
      const result = validateModules(mods, HOST_VERSION)
      expect(result.valid).toBe(true)
    })

    it('reports each duplicate item id exactly once even with three+ collisions', () => {
      const mods = [
        defineModule({ id: '@test/a', contributes: { controlBar: [{ id: 'dup', component: TestButton }] } }),
        defineModule({ id: '@test/b', contributes: { controlBar: [{ id: 'dup', component: TestButton }] } }),
        defineModule({ id: '@test/c', contributes: { controlBar: [{ id: 'dup', component: TestButton }] } }),
      ]
      const result = validateModules(mods, HOST_VERSION)
      const conflicts = result.errors.filter((e) => e.category === 'slot-conflict')
      expect(conflicts).toHaveLength(1)
      expect(conflicts[0].message).toMatch(/3 modules/)
    })
  })

  describe('reserved group names', () => {
    it('rejects defaultGroup="default" (host-reserved)', () => {
      const mod = defineModule({
        id: '@test/bad-mod',
        contributes: {
          controlBar: [{ id: 'btn', component: TestButton, defaultGroup: 'default' }],
        },
      })
      const result = validateModules([mod], HOST_VERSION)
      expect(result.valid).toBe(false)
      const err = result.errors.find(
        (e) => e.category === 'invalid-shape' && e.moduleId === '@test/bad-mod',
      )
      expect(err).toBeDefined()
      expect(err?.message).toMatch(/host-reserved/)
    })

    it('accepts a non-reserved defaultGroup', () => {
      const mod = defineModule({
        id: '@test/good-mod',
        contributes: {
          controlBar: [{ id: 'btn', component: TestButton, defaultGroup: 'tools' }],
        },
      })
      const result = validateModules([mod], HOST_VERSION)
      expect(result.valid).toBe(true)
    })

    it('skips check when defaultGroup is omitted', () => {
      const mod = defineModule({
        id: '@test/no-group',
        contributes: { controlBar: [{ id: 'btn', component: TestButton }] },
      })
      const result = validateModules([mod], HOST_VERSION)
      expect(result.valid).toBe(true)
    })
  })

  describe('plugin version requirement', () => {
    it('rejects a non-built-in module with no version', () => {
      const mod = defineModule({
        id: '@test/unversioned-plugin',
        contributes: { tools: [] },
      })
      const result = validateModules([mod], HOST_VERSION, {
        builtInModuleIds: new Set(['@test/some-builtin']),
      })
      expect(result.valid).toBe(false)
      const err = result.errors.find((e) => e.category === 'missing-version')
      expect(err).toBeDefined()
      expect(err?.moduleId).toBe('@test/unversioned-plugin')
    })

    it('rejects a plugin with empty version string', () => {
      const mod = defineModule({
        id: '@test/empty-version',
        version: '   ',
        contributes: { tools: [] },
      })
      const result = validateModules([mod], HOST_VERSION, { builtInModuleIds: new Set() })
      expect(result.valid).toBe(false)
      expect(result.errors.find((e) => e.category === 'missing-version')).toBeDefined()
    })

    it('skips the check when the module id is in builtInModuleIds', () => {
      const mod = defineModule({
        id: '@test/builtin-mod',
        contributes: { tools: [] },
      })
      const result = validateModules([mod], HOST_VERSION, {
        builtInModuleIds: new Set(['@test/builtin-mod']),
      })
      expect(result.valid).toBe(true)
    })

    it('skips the check entirely when builtInModuleIds is omitted', () => {
      const mod = defineModule({
        id: '@test/unversioned',
        contributes: { tools: [] },
      })
      const result = validateModules([mod], HOST_VERSION)
      expect(result.valid).toBe(true)
    })

    it('accepts a plugin with a real version string', () => {
      const mod = defineModule({
        id: '@test/good-plugin',
        version: '1.2.3',
        contributes: { tools: [] },
      })
      const result = validateModules([mod], HOST_VERSION, { builtInModuleIds: new Set() })
      expect(result.valid).toBe(true)
    })
  })

  describe('error aggregation', () => {
    it('collects multiple hard errors across modules in one pass', () => {
      const mods = [
        defineModule({
          id: '@test/future',
          minAppVersion: '99.0.0',
          contributes: { tools: [] },
        }),
        defineModule({
          id: '@test/w1',
          contributes: { strokeStyle: { provides: ['lineWidth'] } },
        }),
        defineModule({
          id: '@test/w2',
          contributes: { strokeStyle: { provides: ['lineWidth'] } },
        }),
      ]
      const result: ValidationResult = validateModules(mods, '1.0.0')
      expect(result.valid).toBe(false)
      const categories = result.errors.map((e) => e.category).sort()
      expect(categories).toEqual(['min-version', 'slot-conflict'].sort())
    })
  })
})
