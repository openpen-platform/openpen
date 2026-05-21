/**
 * AppButton.contract.test.ts
 *
 * Verifies the public API surface of AppButton: props, slot, emits, and
 * DOM output. This file does not depend on reka-ui — AppButton is a pure
 * native-element wrapper. Run as part of the standard unit test suite.
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import AppButton from './AppButton.vue'
import { IS_VERTICAL_KEY, SNAP_EDGE_KEY, TOOLTIP_FLIP_DOWN_KEY, type SnapEdge } from '../../inject-keys'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const SFC_SOURCE = readFileSync(join(__dirname, 'AppButton.vue'), 'utf-8')

describe('AppButton', () => {
  it('renders a button element', () => {
    const wrapper = mount(AppButton)
    expect(wrapper.find('button.app-btn').exists()).toBe(true)
  })

  it('renders slot content', () => {
    const wrapper = mount(AppButton, {
      slots: { default: '<svg data-testid="icon" />' },
    })
    expect(wrapper.find('[data-testid="icon"]').exists()).toBe(true)
  })

  it('has danger class when variant is danger', () => {
    const wrapper = mount(AppButton, {
      props: { variant: 'danger' },
    })
    expect(wrapper.find('button').classes()).toContain('danger')
  })

  it('does NOT have danger class when variant is default', () => {
    const wrapper = mount(AppButton, {
      props: { variant: 'default' },
    })
    expect(wrapper.find('button').classes()).not.toContain('danger')
  })

  it('has active class when active is true', () => {
    const wrapper = mount(AppButton, {
      props: { active: true },
    })
    expect(wrapper.find('button').classes()).toContain('active')
  })

  it('does NOT have active class when active is false', () => {
    const wrapper = mount(AppButton, {
      props: { active: false },
    })
    expect(wrapper.find('button').classes()).not.toContain('active')
  })

  it('has app-btn-disabled class and aria-disabled when disabled is true', () => {
    const wrapper = mount(AppButton, {
      props: { disabled: true },
    })
    expect(wrapper.find('button').classes()).toContain('app-btn-disabled')
    expect(wrapper.find('button').attributes('aria-disabled')).toBe('true')
  })

  it('does NOT have app-btn-disabled class when disabled is false', () => {
    const wrapper = mount(AppButton, {
      props: { disabled: false },
    })
    expect(wrapper.find('button').classes()).not.toContain('app-btn-disabled')
    expect(wrapper.find('button').attributes('aria-disabled')).toBeUndefined()
  })

  it('does NOT set HTML disabled attribute (preserves tooltip pointer events)', () => {
    const wrapper = mount(AppButton, {
      props: { disabled: true },
    })
    // HTML `disabled` removes pointer events, killing tooltip hover.
    // AppButton intentionally avoids the attribute in favour of aria-disabled.
    expect(wrapper.find('button').attributes('disabled')).toBeUndefined()
  })

  it('sets data-tip attribute from tooltip prop', () => {
    const wrapper = mount(AppButton, {
      props: { tooltip: 'Erase all' },
    })
    expect(wrapper.find('button').attributes('data-tip')).toBe('Erase all')
  })

  it('does NOT set data-tip when tooltip is not provided', () => {
    const wrapper = mount(AppButton)
    expect(wrapper.find('button').attributes('data-tip')).toBeUndefined()
  })

  it('sets aria-label from ariaLabel prop', () => {
    const wrapper = mount(AppButton, {
      props: { ariaLabel: 'Toggle eraser' },
    })
    expect(wrapper.find('button').attributes('aria-label')).toBe('Toggle eraser')
  })

  it('emits click when button is clicked and not disabled', async () => {
    const wrapper = mount(AppButton)
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('click')).toBeTruthy()
    expect(wrapper.emitted('click')!.length).toBe(1)
  })

  it('does NOT emit click when disabled', async () => {
    const wrapper = mount(AppButton, {
      props: { disabled: true },
    })
    await wrapper.find('button').trigger('click')
    expect(wrapper.emitted('click')).toBeFalsy()
  })

  // ── Tooltip side (vbar orientation) ────────────────────────────────────────

  function mountWithHostContext(opts: { isVertical: boolean; snapEdge: SnapEdge; tooltipFlipDown?: boolean }) {
    return mount(AppButton, {
      props: { tooltip: 'demo' },
      global: {
        provide: {
          [IS_VERTICAL_KEY as symbol]: ref(opts.isVertical),
          [SNAP_EDGE_KEY as symbol]: ref(opts.snapEdge),
          [TOOLTIP_FLIP_DOWN_KEY as symbol]: ref(opts.tooltipFlipDown ?? false),
        },
      },
    })
  }

  it('horizontal default: tooltip side is top (no host context provided)', () => {
    const wrapper = mount(AppButton, { props: { tooltip: 'demo' } })
    const classes = wrapper.find('button').classes()
    expect(classes).toContain('app-btn--tooltip-top')
    expect(classes).not.toContain('app-btn--tooltip-left')
    expect(classes).not.toContain('app-btn--tooltip-right')
  })

  it('horizontal mode with snap-top context: tooltip side stays top', () => {
    const wrapper = mountWithHostContext({ isVertical: false, snapEdge: 'top' })
    const classes = wrapper.find('button').classes()
    expect(classes).toContain('app-btn--tooltip-top')
    expect(classes).not.toContain('app-btn--tooltip-left')
    expect(classes).not.toContain('app-btn--tooltip-right')
  })

  it('vertical + snap-left: tooltip side is right (away from edge)', () => {
    const wrapper = mountWithHostContext({ isVertical: true, snapEdge: 'left' })
    const classes = wrapper.find('button').classes()
    expect(classes).toContain('app-btn--tooltip-right')
    expect(classes).not.toContain('app-btn--tooltip-top')
    expect(classes).not.toContain('app-btn--tooltip-left')
  })

  it('vertical + snap-right: tooltip side is left (away from edge)', () => {
    const wrapper = mountWithHostContext({ isVertical: true, snapEdge: 'right' })
    const classes = wrapper.find('button').classes()
    expect(classes).toContain('app-btn--tooltip-left')
    expect(classes).not.toContain('app-btn--tooltip-top')
    expect(classes).not.toContain('app-btn--tooltip-right')
  })

  it('vertical + no snap edge (vbar-free): tooltip side defaults to right', () => {
    const wrapper = mountWithHostContext({ isVertical: true, snapEdge: null })
    const classes = wrapper.find('button').classes()
    expect(classes).toContain('app-btn--tooltip-right')
    expect(classes).not.toContain('app-btn--tooltip-left')
    expect(classes).not.toContain('app-btn--tooltip-top')
  })

  // ── Vertical size override ─────────────────────────────────────────────────

  it('horizontal mode: no app-btn--vertical class on root', () => {
    const wrapper = mount(AppButton)
    expect(wrapper.find('button').classes()).not.toContain('app-btn--vertical')
  })

  it('vertical mode: app-btn--vertical class applied to root', () => {
    const wrapper = mountWithHostContext({ isVertical: true, snapEdge: null })
    expect(wrapper.find('button').classes()).toContain('app-btn--vertical')
  })

  // ── Horizontal tooltip flip-down (near workArea top) ───────────────────────

  it('horizontal mode, tooltipFlipDown=true: tooltip side is top-flip', () => {
    const wrapper = mountWithHostContext({ isVertical: false, snapEdge: null, tooltipFlipDown: true })
    const classes = wrapper.find('button').classes()
    expect(classes).toContain('app-btn--tooltip-top-flip')
    expect(classes).not.toContain('app-btn--tooltip-top')
    expect(classes).not.toContain('app-btn--tooltip-left')
    expect(classes).not.toContain('app-btn--tooltip-right')
  })

  it('horizontal mode, tooltipFlipDown=false: tooltip side stays top', () => {
    const wrapper = mountWithHostContext({ isVertical: false, snapEdge: null, tooltipFlipDown: false })
    const classes = wrapper.find('button').classes()
    expect(classes).toContain('app-btn--tooltip-top')
    expect(classes).not.toContain('app-btn--tooltip-top-flip')
  })

  it('vertical mode ignores tooltipFlipDown (sideways tooltip wins)', () => {
    const wrapper = mountWithHostContext({ isVertical: true, snapEdge: 'left', tooltipFlipDown: true })
    const classes = wrapper.find('button').classes()
    expect(classes).toContain('app-btn--tooltip-right')
    expect(classes).not.toContain('app-btn--tooltip-top-flip')
    expect(classes).not.toContain('app-btn--tooltip-top')
  })

  // CSS token contract — negative: legacy host-internal vars must not appear.
  it('style block references no legacy host CSS variables', () => {
    const LEGACY_VARS = [
      '--text-dim', '--text-primary', '--text-muted',
      '--accent', '--accent-bg', '--accent-glow',
      '--cb-hover-bg', '--cb-group-bg',
      '--tooltip-bg',
      '--shadow', '--shadow-sm',
      '--border', '--border-hi',
      '--surface', '--surface-hi',
    ]
    for (const v of LEGACY_VARS) {
      expect(SFC_SOURCE, `AppButton.vue must not reference legacy var ${v}`).not.toContain(v)
    }
  })

  // CSS token contract — positive: no hardcoded color literals in the style block.
  // All colors must be expressed through var(--openpen-*) tokens so that theme
  // changes propagate automatically. Non-color numeric literals (opacity, scale,
  // z-index, font-size, spacing) are out of scope for this check.
  it('style block contains no hardcoded color literals (hex or rgb/rgba)', () => {
    // Extract the <style> block to avoid matching color values in comments or prose.
    const styleMatch = SFC_SOURCE.match(/<style[^>]*>([\s\S]*?)<\/style>/)
    const styleBlock = styleMatch ? styleMatch[1] : ''

    // Strip CSS line comments before scanning.
    const stripped = styleBlock.replace(/\/\*[\s\S]*?\*\//g, '')

    const hexLiteral = /#[0-9a-fA-F]{3,8}\b/g
    const rgbLiteral = /rgba?\s*\([^)]+\)/g

    const hexMatches = stripped.match(hexLiteral) ?? []
    const rgbMatches = stripped.match(rgbLiteral) ?? []

    expect(
      hexMatches,
      `AppButton.vue style block must not contain hardcoded hex colors: ${hexMatches.join(', ')}`,
    ).toHaveLength(0)
    expect(
      rgbMatches,
      `AppButton.vue style block must not contain hardcoded rgb/rgba colors: ${rgbMatches.join(', ')}`,
    ).toHaveLength(0)
  })
})
