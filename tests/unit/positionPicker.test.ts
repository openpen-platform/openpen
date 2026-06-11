/**
 * positionPicker.test.ts — unit tests for the PositionPicker component
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PositionPicker from '../../src/components/settings/PositionPicker.vue'
import type { NotificationPosition } from '../../../shared/settings-defaults'

const POSITIONS: NotificationPosition[] = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]

describe('PositionPicker', () => {
  it('renders 9 cells', () => {
    const wrapper = mount(PositionPicker, {
      props: { modelValue: 'top-center' },
    })
    const cells = wrapper.findAll('[data-testid^="position-cell-"]')
    expect(cells).toHaveLength(9)
  })

  it('selected cell has the position-cell--active class', () => {
    const wrapper = mount(PositionPicker, {
      props: { modelValue: 'top-center' },
    })
    const activeCell = wrapper.find('[data-testid="position-cell-top-center"]')
    expect(activeCell.exists()).toBe(true)
    expect(activeCell.classes()).toContain('position-cell--active')
    expect(activeCell.attributes('aria-label')).toBe('top-center')
  })

  it('clicking a cell emits update:modelValue', async () => {
    const wrapper = mount(PositionPicker, {
      props: { modelValue: 'top-center' },
    })
    const cells = wrapper.findAll('[data-testid^="position-cell-"]')
    // Third cell is top-right.
    await cells[2].trigger('click')
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['top-right'])
  })

  it('each cell aria-label matches the correct position token', () => {
    const wrapper = mount(PositionPicker, {
      props: { modelValue: 'center' },
    })
    const cells = wrapper.findAll('[data-testid^="position-cell-"]')
    const labels = cells.map((c) => c.attributes('aria-label'))
    expect(labels).toEqual(POSITIONS)
  })

  it('last cell has the active class when modelValue is bottom-right', () => {
    const wrapper = mount(PositionPicker, {
      props: { modelValue: 'bottom-right' },
    })
    const lastCell = wrapper.find('[data-testid="position-cell-bottom-right"]')
    expect(lastCell.classes()).toContain('position-cell--active')
  })

  it('container has role="radiogroup"', () => {
    const wrapper = mount(PositionPicker, {
      props: { modelValue: 'center' },
    })
    expect(wrapper.find('[data-testid="position-picker"]').attributes('role')).toBe('radiogroup')
  })
})
