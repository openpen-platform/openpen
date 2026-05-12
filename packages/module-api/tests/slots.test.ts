import { describe, it, expect } from 'vitest'
import {
  ALL_SLOTS,
  V1_ACTIVE_SLOTS,
  V1_RESERVED_SLOTS,
  isKnownSlot,
  getSlot,
} from '../src/slots'

describe('Slot catalog', () => {
  it('exposes 25 total slots (17 active + 8 reserved)', () => {
    expect(ALL_SLOTS).toHaveLength(25)
    expect(V1_ACTIVE_SLOTS).toHaveLength(17)
    expect(V1_RESERVED_SLOTS).toHaveLength(8)
  })

  it('active and reserved slot lists are disjoint', () => {
    const activeIds = new Set(V1_ACTIVE_SLOTS.map((s) => s.id))
    const reservedIds = V1_RESERVED_SLOTS.map((s) => s.id)
    for (const id of reservedIds) {
      expect(activeIds.has(id)).toBe(false)
    }
  })

  it('union of active + reserved equals ALL_SLOTS', () => {
    const union = [...V1_ACTIVE_SLOTS, ...V1_RESERVED_SLOTS]
      .map((s) => s.id)
      .sort()
    const all = ALL_SLOTS.map((s) => s.id).sort()
    expect(union).toEqual(all)
  })

  it('each slot has id, status, category', () => {
    for (const slot of ALL_SLOTS) {
      expect(slot.id).toMatch(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/)
      expect(['v1', 'reserved']).toContain(slot.status)
      expect(['canvas', 'ui', 'system']).toContain(slot.category)
    }
  })

  it('slot ids are unique', () => {
    const ids = ALL_SLOTS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('isKnownSlot recognises declared slots', () => {
    expect(isKnownSlot('canvas.tools')).toBe(true)
    expect(isKnownSlot('ui.control-bar')).toBe(true)
    expect(isKnownSlot('canvas.stroke.transformers')).toBe(true)
    expect(isKnownSlot('made.up.slot')).toBe(false)
  })

  it('getSlot returns the slot definition', () => {
    const slot = getSlot('canvas.tools')
    expect(slot).toBeDefined()
    expect(slot?.id).toBe('canvas.tools')
    expect(slot?.status).toBe('v1')
    expect(slot?.category).toBe('canvas')
  })

  it('getSlot returns undefined for unknown slot', () => {
    expect(getSlot('made.up')).toBeUndefined()
  })

  describe('individual slots present', () => {
    const expectedActive = [
      'canvas.tools',
      'canvas.shapes',
      'canvas.stroke.style',
      'canvas.layers.background',
      'canvas.layers.overlay',
      'canvas.html.overlay',
      'ui.control-bar',
      'ui.settings.tabs',
      'ui.cursors',
      'ui.status',
      'ui.modals',
      'system.shortcuts',
      'system.locales',
      'system.main.handlers',
      'system.events',
      'system.lifecycle',
    ]
    const expectedReserved = [
      'canvas.stroke.transformers',
      'canvas.history.commands',
      'ui.context.menu',
      'ui.tray.menu',
      'ui.theme.tokens',
      'system.window.behaviors',
      'system.file.drop',
      'system.storage',
    ]

    it.each(expectedActive)('active slot "%s" exists', (id) => {
      expect(getSlot(id)?.status).toBe('v1')
    })

    it.each(expectedReserved)('reserved slot "%s" exists', (id) => {
      expect(getSlot(id)?.status).toBe('reserved')
    })
  })
})
