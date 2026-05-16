import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerContribution,
  unregisterModule,
  getSlotEntries,
  resetContributionStore,
} from '../../src/core/runtime/contribution-store'

describe('contribution-store', () => {
  beforeEach(() => {
    resetContributionStore()
  })

  describe('registerContribution', () => {
    it('stores a contribution under its slot id', () => {
      registerContribution('canvas.tools', 'mod-a', { id: 'tool-1' })
      const entries = getSlotEntries('canvas.tools').value
      expect(entries).toHaveLength(1)
      expect(entries[0]).toEqual({
        moduleId: 'mod-a',
        contribution: { id: 'tool-1' },
      })
    })

    it('appends multiple contributions to the same slot', () => {
      registerContribution('canvas.tools', 'mod-a', { id: 'tool-1' })
      registerContribution('canvas.tools', 'mod-b', { id: 'tool-2' })
      const entries = getSlotEntries('canvas.tools').value
      expect(entries.map((e) => e.contribution)).toEqual([
        { id: 'tool-1' },
        { id: 'tool-2' },
      ])
    })

    it('keeps slots independent', () => {
      registerContribution('canvas.tools', 'mod-a', { id: 't' })
      registerContribution('ui.control-bar', 'mod-a', { id: 'b' })
      expect(getSlotEntries('canvas.tools').value).toHaveLength(1)
      expect(getSlotEntries('ui.control-bar').value).toHaveLength(1)
    })

    it('throws when slot id is unknown', () => {
      expect(() =>
        registerContribution('made.up.slot', 'mod-a', {})
      ).toThrow(/unknown slot|slot.*unknown/i)
    })

    it('accepts reserved slots without throwing', () => {
      expect(() =>
        registerContribution('canvas.stroke.transformers', 'mod-a', { id: 't' })
      ).not.toThrow()
    })
  })

  describe('getSlotEntries', () => {
    it('returns an empty array for a registered slot with no entries', () => {
      expect(getSlotEntries('canvas.tools').value).toEqual([])
    })

    it('throws when slot id is unknown', () => {
      expect(() => getSlotEntries('made.up.slot')).toThrow(
        /unknown slot|slot.*unknown/i
      )
    })

    it('returns a reactive ref that updates when contributions register', () => {
      const ref = getSlotEntries('canvas.tools')
      expect(ref.value).toHaveLength(0)
      registerContribution('canvas.tools', 'mod-a', { id: 'tool-1' })
      expect(ref.value).toHaveLength(1)
    })

    it('returns a readonly ref (cannot be mutated externally)', () => {
      const ref = getSlotEntries('canvas.tools')
      // The returned ref should be readonly; assigning .value throws in strict mode.
      // We don't enforce at runtime in non-strict but the type prevents it. Smoke
      // check: pushing onto .value should not affect the underlying store.
      // (Defensive: still enforce that mutation doesn't leak.)
      registerContribution('canvas.tools', 'mod-a', { id: 't1' })
      const snapshot = [...ref.value]
      try {
        // @ts-expect-error — readonly ref
        ref.value = []
      } catch {
        /* expected */
      }
      // Original entries still intact via the store
      expect(getSlotEntries('canvas.tools').value).toEqual(snapshot)
    })
  })

  describe('unregisterModule', () => {
    it('removes all contributions belonging to a module across all slots', () => {
      registerContribution('canvas.tools', 'mod-a', { id: 't1' })
      registerContribution('canvas.tools', 'mod-b', { id: 't2' })
      registerContribution('ui.control-bar', 'mod-a', { id: 'b1' })

      unregisterModule('mod-a')

      expect(getSlotEntries('canvas.tools').value.map((e) => e.moduleId)).toEqual([
        'mod-b',
      ])
      expect(getSlotEntries('ui.control-bar').value).toHaveLength(0)
    })

    it('is a no-op when the module has no contributions', () => {
      registerContribution('canvas.tools', 'mod-a', { id: 't1' })
      expect(() => unregisterModule('non-existent')).not.toThrow()
      expect(getSlotEntries('canvas.tools').value).toHaveLength(1)
    })
  })

  describe('resetContributionStore', () => {
    it('clears all slots', () => {
      registerContribution('canvas.tools', 'mod-a', { id: 't1' })
      registerContribution('ui.control-bar', 'mod-b', { id: 'b1' })
      resetContributionStore()
      expect(getSlotEntries('canvas.tools').value).toHaveLength(0)
      expect(getSlotEntries('ui.control-bar').value).toHaveLength(0)
    })
  })

  describe('ui.cursors deep-clone + freeze on registration', () => {
    it('does NOT clone contributions in other slots', () => {
      // Non-cursor slots store contributions by reference; mutating the
      // source object visibly affects the stored view. (The store wraps
      // the slot ref via Vue `readonly`, so identity comparison through
      // the proxy is not meaningful — verify via the source instead.)
      const tool: { id: string; label: string } = { id: 't1', label: 'before' }
      registerContribution('canvas.tools', 'mod-a', tool)
      tool.label = 'after'
      const stored = getSlotEntries<typeof tool>('canvas.tools').value[0].contribution
      expect(stored.label).toBe('after')
    })

    it('clones cursor contributions so post-store mutation of source does not leak', () => {
      const source = { id: 't1', cursor: { svg: '<svg><circle r="1"/></svg>', hotspot: { x: 0, y: 0 } } }
      registerContribution('ui.cursors', 'mod-a', source)
      // Plugin-side mutation after registration
      source.cursor.svg = '<svg onload="evil()"/>'
      source.cursor.hotspot.x = 99
      const stored = getSlotEntries<typeof source>('ui.cursors').value[0].contribution
      expect(stored).not.toBe(source)
      expect(stored.cursor.svg).toBe('<svg><circle r="1"/></svg>')
      expect(stored.cursor.hotspot.x).toBe(0)
    })

    it('freezes the stored cursor contribution and its nested objects', () => {
      const source = { id: 't1', cursor: { svg: '<svg/>', hotspot: { x: 5, y: 6 } } }
      registerContribution('ui.cursors', 'mod-a', source)
      const stored = getSlotEntries<typeof source>('ui.cursors').value[0].contribution
      expect(Object.isFrozen(stored)).toBe(true)
      expect(Object.isFrozen(stored.cursor)).toBe(true)
      expect(Object.isFrozen(stored.cursor.hotspot)).toBe(true)
    })

    it('rejects direct mutation of the stored cursor snapshot (strict mode throws)', () => {
      'use strict'
      const source = { id: 't1', cursor: { svg: '<svg/>' } as { svg: string } }
      registerContribution('ui.cursors', 'mod-a', source)
      const stored = getSlotEntries<typeof source>('ui.cursors').value[0].contribution
      // Strict mode in the test file context: assigning to a frozen object throws.
      expect(() => {
        ;(stored.cursor as { svg: string }).svg = '<svg onload="evil()"/>'
      }).toThrow(TypeError)
      expect(stored.cursor.svg).toBe('<svg/>')
    })

    it('clones cursors that use the legacy string form too', () => {
      const source = { id: 't1', cursor: 'crosshair' as const }
      registerContribution('ui.cursors', 'mod-a', source)
      const stored = getSlotEntries<typeof source>('ui.cursors').value[0].contribution
      expect(stored).not.toBe(source)
      expect(stored.cursor).toBe('crosshair')
      expect(Object.isFrozen(stored)).toBe(true)
    })
  })
})
