/**
 * AppButtonDropdown.contract.test.ts
 *
 * Verifies the split-mode dropdown wrapper's public API: prop pass-through
 * to AppButton + caret, click event split between main and caret, and the
 * caret rotation behaviour driven by injected snap-edge / orientation.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import AppButtonDropdown from './AppButtonDropdown.vue'
import { IS_VERTICAL_KEY, SNAP_EDGE_KEY, type SnapEdge } from '../../inject-keys'

function mountAppButtonDropdown(opts: {
  props?: Record<string, unknown>
  isVertical?: boolean
  snapEdge?: SnapEdge
} = {}) {
  return mount(AppButtonDropdown, {
    props: {
      popoverId: 'test-dropdown',
      caretAriaLabel: 'Open options',
      ...opts.props,
    },
    global: {
      provide: {
        [IS_VERTICAL_KEY as symbol]: ref(opts.isVertical ?? false),
        [SNAP_EDGE_KEY as symbol]: ref(opts.snapEdge ?? null),
      },
    },
  })
}

describe('AppButtonDropdown', () => {
  // ── Structure ──────────────────────────────────────────────────────────────

  it('renders a wrap div + an AppButton + a caret button', () => {
    const wrapper = mountAppButtonDropdown()
    expect(wrapper.find('.app-btn-dropdown-wrap').exists()).toBe(true)
    expect(wrapper.find('button.app-btn').exists()).toBe(true)
    expect(wrapper.find('button.app-btn-dropdown-caret').exists()).toBe(true)
  })

  it('wrap is flex-row in horizontal mode', () => {
    const wrapper = mountAppButtonDropdown({ isVertical: false })
    expect(wrapper.find('.app-btn-dropdown-wrap').classes()).not.toContain(
      'app-btn-dropdown-wrap--vertical',
    )
  })

  it('wrap is flex-column in vertical mode', () => {
    const wrapper = mountAppButtonDropdown({ isVertical: true })
    expect(wrapper.find('.app-btn-dropdown-wrap').classes()).toContain(
      'app-btn-dropdown-wrap--vertical',
    )
  })

  // ── Caret size override in vertical mode ───────────────────────────────────

  it('caret has --vertical class in vertical mode', () => {
    const wrapper = mountAppButtonDropdown({ isVertical: true })
    expect(wrapper.find('.app-btn-dropdown-caret').classes()).toContain(
      'app-btn-dropdown-caret--vertical',
    )
  })

  it('caret has no --vertical class in horizontal mode', () => {
    const wrapper = mountAppButtonDropdown({ isVertical: false })
    expect(wrapper.find('.app-btn-dropdown-caret').classes()).not.toContain(
      'app-btn-dropdown-caret--vertical',
    )
  })

  // ── Caret rotation (default closed state) ─────────────────────────────────

  it('caret icon points down when popover is closed (default)', () => {
    const wrapper = mountAppButtonDropdown()
    expect(wrapper.find('.app-btn-dropdown-caret-icon').classes()).toContain(
      'app-btn-dropdown-caret-icon--down',
    )
  })

  // ── Click events ──────────────────────────────────────────────────────────

  it('clicking the main button emits mainClick', async () => {
    const wrapper = mountAppButtonDropdown()
    await wrapper.find('button.app-btn').trigger('click')
    expect(wrapper.emitted('mainClick')).toBeTruthy()
    expect(wrapper.emitted('mainClick')!.length).toBe(1)
    expect(wrapper.emitted('caretClick')).toBeFalsy()
  })

  it('clicking the caret emits caretClick', async () => {
    const wrapper = mountAppButtonDropdown()
    await wrapper.find('button.app-btn-dropdown-caret').trigger('click')
    expect(wrapper.emitted('caretClick')).toBeTruthy()
    expect(wrapper.emitted('caretClick')!.length).toBe(1)
    expect(wrapper.emitted('mainClick')).toBeFalsy()
  })

  // ── Disabled state ────────────────────────────────────────────────────────

  it('disabled blocks main click', async () => {
    const wrapper = mountAppButtonDropdown({ props: { disabled: true } })
    await wrapper.find('button.app-btn').trigger('click')
    expect(wrapper.emitted('mainClick')).toBeFalsy()
  })

  it('disabled blocks caret click', async () => {
    const wrapper = mountAppButtonDropdown({ props: { disabled: true } })
    await wrapper.find('button.app-btn-dropdown-caret').trigger('click')
    expect(wrapper.emitted('caretClick')).toBeFalsy()
  })

  it('disabled adds aria-disabled to caret', () => {
    const wrapper = mountAppButtonDropdown({ props: { disabled: true } })
    const caret = wrapper.find('button.app-btn-dropdown-caret')
    expect(caret.attributes('aria-disabled')).toBe('true')
    expect(caret.classes()).toContain('app-btn-dropdown-caret--disabled')
  })

  // ── Active state ──────────────────────────────────────────────────────────

  it('active flag propagates to the main AppButton', () => {
    const wrapper = mountAppButtonDropdown({ props: { active: true } })
    expect(wrapper.find('button.app-btn').classes()).toContain('active')
  })

  // ── Aria-labels and testids ───────────────────────────────────────────────

  it('main-aria-label and caret-aria-label render on respective buttons', () => {
    const wrapper = mountAppButtonDropdown({
      props: {
        mainAriaLabel: 'Activate shape',
        caretAriaLabel: 'Shape options',
      },
    })
    expect(wrapper.find('button.app-btn').attributes('aria-label')).toBe('Activate shape')
    expect(wrapper.find('button.app-btn-dropdown-caret').attributes('aria-label')).toBe(
      'Shape options',
    )
  })

  it('main-testid and caret-testid render data-testid on respective buttons', () => {
    const wrapper = mountAppButtonDropdown({
      props: {
        mainTestid: 'controlbar-shape-btn',
        caretTestid: 'controlbar-shape-caret',
      },
    })
    expect(wrapper.find('button.app-btn').attributes('data-testid')).toBe('controlbar-shape-btn')
    expect(wrapper.find('button.app-btn-dropdown-caret').attributes('data-testid')).toBe(
      'controlbar-shape-caret',
    )
  })

  // ── Main tooltip ──────────────────────────────────────────────────────────

  it('main-tooltip sets data-tip on the main AppButton', () => {
    const wrapper = mountAppButtonDropdown({
      props: { mainTooltip: 'Shape tool' },
    })
    expect(wrapper.find('button.app-btn').attributes('data-tip')).toBe('Shape tool')
  })
})
