import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { h } from 'vue'
import AppPopoverPanel from './AppPopoverPanel.vue'
import AppPopoverRow from './AppPopoverRow.vue'

describe('AppPopoverPanel', () => {
  it('renders the title above the slot content when a title is given', () => {
    const w = mount(AppPopoverPanel, { props: { title: 'Size' }, slots: { default: '<p data-testid="body">x</p>' } })
    expect(w.get('[data-testid="app-popover-panel-title"]').text()).toBe('Size')
    expect(w.find('[data-testid="body"]').exists()).toBe(true)
  })

  it('omits the title element when no title is given', () => {
    const w = mount(AppPopoverPanel, { slots: { default: '<p>x</p>' } })
    expect(w.find('[data-testid="app-popover-panel-title"]').exists()).toBe(false)
  })
})

describe('AppPopoverRow', () => {
  it('renders the label followed by the slot control', () => {
    const w = mount(AppPopoverRow, { props: { label: 'Fill' }, slots: { default: '<i data-testid="ctl" />' } })
    const text = w.get('[data-testid="app-popover-row"]').text()
    expect(text).toBe('Fill')
    expect(w.find('[data-testid="ctl"]').exists()).toBe(true)
  })

  it('renders only the control when no label is given', () => {
    const w = mount(AppPopoverRow, { slots: { default: '<i data-testid="ctl" />' } })
    expect(w.text()).toBe('')
    expect(w.find('[data-testid="ctl"]').exists()).toBe(true)
  })
})

describe('AppPopoverPanel shared columns', () => {
  it('keeps every labelled row as a direct child of the panel so the rows share its columns', () => {
    const w = mount(AppPopoverPanel, {
      slots: {
        default: () => [
          h(AppPopoverRow, { label: 'Radius' }, () => h('i', { class: 'ctl' })),
          h(AppPopoverRow, { label: 'Dim level' }, () => h('i', { class: 'ctl' })),
        ],
      },
    })
    const rows = w.findAll('[data-testid="app-popover-row"]')
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      expect(row.element.parentElement).toBe(w.get('[data-testid="app-popover-panel"]').element)
      expect(row.classes()).not.toContain('openpen-popover-row--bare')
    }
  })

  it('keeps label, control and value as the first three children of a row, in that order', () => {
    const w = mount(AppPopoverRow, {
      props: { label: 'Radius' },
      slots: { default: () => [h('i', { class: 'ctl' }), h('b', { class: 'val' }, '150px')] },
    })
    const kids = Array.from(w.get('[data-testid="app-popover-row"]').element.children)
    expect(kids.map((k) => k.className.split(' ')[0])).toEqual(['openpen-popover-row-label', 'ctl', 'val'])
  })

  it('marks a row without a label as bare so it spans all columns', () => {
    const w = mount(AppPopoverRow, { slots: { default: '<i class="ctl" />' } })
    expect(w.get('[data-testid="app-popover-row"]').classes()).toContain('openpen-popover-row--bare')
  })

  it('does not mark a labelled row as bare', () => {
    const w = mount(AppPopoverRow, { props: { label: 'Fill' }, slots: { default: '<i class="ctl" />' } })
    expect(w.get('[data-testid="app-popover-row"]').classes()).not.toContain('openpen-popover-row--bare')
  })
})
