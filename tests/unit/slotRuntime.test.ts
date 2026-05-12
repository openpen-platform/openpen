import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerContribution,
  resetContributionStore,
} from '../../src/core/runtime/contribution-store'
import {
  useSlot,
  useSlotEntries,
  useControlBarItems,
} from '../../src/core/runtime/slot-runtime'

describe('slot-runtime — useSlot', () => {
  beforeEach(() => {
    resetContributionStore()
  })

  it('returns contribution payloads (no module id wrapper)', () => {
    registerContribution('canvas.tools', 'mod-a', { id: 't1' })
    registerContribution('canvas.tools', 'mod-b', { id: 't2' })
    const items = useSlot<{ id: string }>('canvas.tools')
    expect(items.value).toEqual([{ id: 't1' }, { id: 't2' }])
  })

  it('is reactive — updates when contributions are added', () => {
    const items = useSlot('canvas.tools')
    expect(items.value).toEqual([])
    registerContribution('canvas.tools', 'mod-a', { id: 't1' })
    expect(items.value).toHaveLength(1)
  })
})

describe('slot-runtime — useSlotEntries', () => {
  beforeEach(() => {
    resetContributionStore()
  })

  it('returns full entries including moduleId', () => {
    registerContribution('canvas.tools', 'mod-a', { id: 't' })
    const entries = useSlotEntries('canvas.tools')
    expect(entries.value[0].moduleId).toBe('mod-a')
    expect(entries.value[0].contribution).toEqual({ id: 't' })
  })
})

describe('slot-runtime — useControlBarItems', () => {
  beforeEach(() => {
    resetContributionStore()
  })

  it('returns all registered items when layout has no matching ids', () => {
    registerContribution('ui.control-bar', 'mod', { id: 'a', component: {} })
    registerContribution('ui.control-bar', 'mod', { id: 'b', component: {} })
    const { items } = useControlBarItems()
    expect(items.value.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('orders items by layout group order', () => {
    registerContribution('ui.control-bar', 'mod', { id: 'a', component: {} })
    registerContribution('ui.control-bar', 'mod', { id: 'b', component: {} })
    registerContribution('ui.control-bar', 'mod', { id: 'c', component: {} })
    const { items, refreshLayout } = useControlBarItems()
    refreshLayout([{ id: 'default', items: ['c', 'a', 'b'] }])
    expect(items.value.map((i) => i.id)).toEqual(['c', 'a', 'b'])
  })

  it('appends items not present in any layout group', () => {
    registerContribution('ui.control-bar', 'mod', { id: 'a', component: {} })
    registerContribution('ui.control-bar', 'mod', { id: 'b', component: {} })
    const { items, refreshLayout } = useControlBarItems()
    refreshLayout([{ id: 'default', items: ['a'] }])
    expect(items.value.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('is reactive — updates when contributions are added', () => {
    const { items } = useControlBarItems()
    expect(items.value).toHaveLength(0)
    registerContribution('ui.control-bar', 'mod', { id: 'x', component: {} })
    expect(items.value).toHaveLength(1)
  })

  it('refreshLayout is reactive — reorders when layout changes', () => {
    registerContribution('ui.control-bar', 'mod', { id: 'a', component: {} })
    registerContribution('ui.control-bar', 'mod', { id: 'b', component: {} })
    const { items, refreshLayout } = useControlBarItems()
    refreshLayout([{ id: 'default', items: ['a', 'b'] }])
    expect(items.value.map((i) => i.id)).toEqual(['a', 'b'])
    refreshLayout([{ id: 'default', items: ['b', 'a'] }])
    expect(items.value.map((i) => i.id)).toEqual(['b', 'a'])
  })
})
