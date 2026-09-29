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

const MAIN_TESTID = 'controlbar-shape-btn'
const CARET_TESTID = 'controlbar-shape-caret'
const MAIN = `[data-testid="${MAIN_TESTID}"]`
const CARET = `[data-testid="${CARET_TESTID}"]`
const WRAP = '[data-testid="app-button-dropdown-wrap"]'
const CARET_ICON = '[data-testid="app-button-dropdown-caret-icon"]'

function mountAppButtonDropdown(opts: {
  props?: Record<string, unknown>
  isVertical?: boolean
  snapEdge?: SnapEdge
} = {}) {
  return mount(AppButtonDropdown, {
    props: {
      popoverId: 'test-dropdown',
      caretAriaLabel: 'Open options',
      mainTestid: MAIN_TESTID,
      caretTestid: CARET_TESTID,
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
    expect(wrapper.find(WRAP).element.tagName).toBe('DIV')
    expect(wrapper.find(WRAP).classes()).toContain('app-btn-dropdown-wrap')
    expect(wrapper.find(MAIN).element.tagName).toBe('BUTTON')
    expect(wrapper.find(MAIN).classes()).toContain('app-btn')
    expect(wrapper.find(CARET).element.tagName).toBe('BUTTON')
    expect(wrapper.find(CARET).classes()).toContain('app-btn-dropdown-caret')
  })

  it('wrap is flex-row in horizontal mode', () => {
    const wrapper = mountAppButtonDropdown({ isVertical: false })
    expect(wrapper.find(WRAP).classes()).not.toContain(
      'app-btn-dropdown-wrap--vertical',
    )
  })

  it('wrap is flex-column in vertical mode', () => {
    const wrapper = mountAppButtonDropdown({ isVertical: true })
    expect(wrapper.find(WRAP).classes()).toContain(
      'app-btn-dropdown-wrap--vertical',
    )
  })

  // ── Caret size override in vertical mode ───────────────────────────────────

  it('caret has --vertical class in vertical mode', () => {
    const wrapper = mountAppButtonDropdown({ isVertical: true })
    expect(wrapper.find(CARET).classes()).toContain(
      'app-btn-dropdown-caret--vertical',
    )
  })

  it('caret has no --vertical class in horizontal mode', () => {
    const wrapper = mountAppButtonDropdown({ isVertical: false })
    expect(wrapper.find(CARET).classes()).not.toContain(
      'app-btn-dropdown-caret--vertical',
    )
  })

  // ── Caret rotation (default closed state) ─────────────────────────────────

  it('caret icon points down when popover is closed (default)', () => {
    const wrapper = mountAppButtonDropdown()
    expect(wrapper.find(CARET_ICON).classes()).toContain(
      'app-btn-dropdown-caret-icon--down',
    )
  })

  // ── Click events ──────────────────────────────────────────────────────────

  it('clicking the main button emits mainClick', async () => {
    const wrapper = mountAppButtonDropdown()
    await wrapper.find(MAIN).trigger('click')
    expect(wrapper.emitted('mainClick')).toBeTruthy()
    expect(wrapper.emitted('mainClick')!.length).toBe(1)
    expect(wrapper.emitted('caretClick')).toBeFalsy()
  })

  it('clicking the caret emits caretClick', async () => {
    const wrapper = mountAppButtonDropdown()
    await wrapper.find(CARET).trigger('click')
    expect(wrapper.emitted('caretClick')).toBeTruthy()
    expect(wrapper.emitted('caretClick')!.length).toBe(1)
    expect(wrapper.emitted('mainClick')).toBeFalsy()
  })

  // ── Disabled state ────────────────────────────────────────────────────────

  it('disabled blocks main click', async () => {
    const wrapper = mountAppButtonDropdown({ props: { disabled: true } })
    await wrapper.find(MAIN).trigger('click')
    expect(wrapper.emitted('mainClick')).toBeFalsy()
  })

  it('disabled blocks caret click', async () => {
    const wrapper = mountAppButtonDropdown({ props: { disabled: true } })
    await wrapper.find(CARET).trigger('click')
    expect(wrapper.emitted('caretClick')).toBeFalsy()
  })

  it('disabled adds aria-disabled to caret', () => {
    const wrapper = mountAppButtonDropdown({ props: { disabled: true } })
    const caret = wrapper.find(CARET)
    expect(caret.attributes('aria-disabled')).toBe('true')
    expect(caret.classes()).toContain('app-btn-dropdown-caret--disabled')
  })

  // ── Active state ──────────────────────────────────────────────────────────

  it('active flag propagates to the main AppButton', () => {
    const wrapper = mountAppButtonDropdown({ props: { active: true } })
    expect(wrapper.find(MAIN).classes()).toContain('active')
  })

  // ── Aria-labels and testids ───────────────────────────────────────────────

  it('main-aria-label and caret-aria-label render on respective buttons', () => {
    const wrapper = mountAppButtonDropdown({
      props: {
        mainAriaLabel: 'Activate shape',
        caretAriaLabel: 'Shape options',
      },
    })
    expect(wrapper.find(MAIN).attributes('aria-label')).toBe('Activate shape')
    expect(wrapper.find(CARET).attributes('aria-label')).toBe(
      'Shape options',
    )
  })

  it('main-testid and caret-testid render data-testid on respective buttons', () => {
    const wrapper = mountAppButtonDropdown({
      props: {
        mainTestid: 'controlbar-rect-btn',
        caretTestid: 'controlbar-rect-caret',
      },
    })
    const main = wrapper.findAll('[data-testid="controlbar-rect-btn"]')
    const caret = wrapper.findAll('[data-testid="controlbar-rect-caret"]')
    expect(main).toHaveLength(1)
    expect(main[0].element.tagName).toBe('BUTTON')
    expect(main[0].classes()).toContain('app-btn')
    expect(caret).toHaveLength(1)
    expect(caret[0].element.tagName).toBe('BUTTON')
    expect(caret[0].classes()).toContain('app-btn-dropdown-caret')
  })

  // ── Main tooltip ──────────────────────────────────────────────────────────

  it('main-tooltip sets data-tip on the main AppButton', () => {
    const wrapper = mountAppButtonDropdown({
      props: { mainTooltip: 'Shape tool' },
    })
    expect(wrapper.find(MAIN).attributes('data-tip')).toBe('Shape tool')
  })
})
