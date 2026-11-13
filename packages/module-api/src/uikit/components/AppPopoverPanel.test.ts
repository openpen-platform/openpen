import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
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
