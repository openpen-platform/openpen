/**
 * AppSegmented.contract.test.ts
 *
 * PURPOSE: When reka-ui upgrades, if the RadioGroup API shape we depend on
 * changes, CI catches it immediately.
 *
 * This is NOT a test of AppSegmented behaviour — see tests/unit/AppSegmented.test.js
 * for that. This file tests only the specific reka-ui contract that
 * AppSegmented.vue relies on internally.
 *
 * Contract test — verifies the public API surface is stable.
 * Upgrade gate: run this first when bumping reka-ui.
 */
import { describe, expect, it } from 'vitest'
import {
  RadioGroupRoot,
  RadioGroupItem,
} from 'reka-ui'

describe('reka-ui RadioGroup contract (consumed by AppSegmented)', () => {
  it('exports the 2 components AppSegmented depends on', () => {
    expect(RadioGroupRoot).toBeDefined()
    expect(RadioGroupItem).toBeDefined()
  })

  it('RadioGroupRoot accepts modelValue for controlled mode', () => {
    const props = RadioGroupRoot.props as Record<string, unknown>
    expect(props.modelValue).toBeDefined()
  })

  it('RadioGroupRoot accepts defaultValue for uncontrolled mode', () => {
    const props = RadioGroupRoot.props as Record<string, unknown>
    expect(props.defaultValue).toBeDefined()
  })

  it('RadioGroupRoot accepts orientation prop', () => {
    const props = RadioGroupRoot.props as Record<string, unknown>
    expect(props.orientation).toBeDefined()
  })

  it('RadioGroupRoot accepts disabled prop', () => {
    const props = RadioGroupRoot.props as Record<string, unknown>
    expect(props.disabled).toBeDefined()
  })

  it('RadioGroupItem accepts value prop (required for item identity)', () => {
    // Each AppSegmented option maps to a RadioGroupItem with :value="opt.value"
    const props = RadioGroupItem.props as Record<string, unknown>
    expect(props.value).toBeDefined()
  })

  it('RadioGroupItem accepts disabled prop (per-item disable)', () => {
    const props = RadioGroupItem.props as Record<string, unknown>
    expect(props.disabled).toBeDefined()
  })

  it('RadioGroupItem accepts asChild to render custom trigger element', () => {
    // AppSegmented uses asChild to render a <button> inside each item,
    // preserving the app-seg-btn class and active class binding.
    const props = RadioGroupItem.props as Record<string, unknown>
    expect(props.asChild ?? props['as-child']).toBeDefined()
  })
})
