/**
 * AppSwatchPicker.contract.test.ts
 *
 * PURPOSE: When reka-ui upgrades, if the RadioGroup API shape we depend on
 * changes, CI catches it immediately.
 *
 * This is NOT a test of AppSwatchPicker behaviour — see
 * tests/unit/AppSwatchPicker.test.js for that. This file tests only the
 * specific reka-ui contract that AppSwatchPicker.vue relies on internally.
 *
 * Upgrade gate: run this first when bumping reka-ui.
 */
import { describe, expect, it } from 'vitest'
import { RadioGroupRoot, RadioGroupItem } from 'reka-ui'

describe('reka-ui RadioGroup contract (consumed by AppSwatchPicker)', () => {
  it('exports the 2 components AppSwatchPicker depends on', () => {
    expect(RadioGroupRoot).toBeDefined()
    expect(RadioGroupItem).toBeDefined()
  })

  it('RadioGroupRoot accepts modelValue and disabled', () => {
    const props = RadioGroupRoot.props as Record<string, unknown>
    expect(props.modelValue).toBeDefined()
    expect(props.disabled).toBeDefined()
  })

  it('RadioGroupItem accepts value and asChild (each swatch is a custom button)', () => {
    const props = RadioGroupItem.props as Record<string, unknown>
    expect(props.value).toBeDefined()
    expect(props.asChild).toBeDefined()
  })

  it('RadioGroupRoot emits update:modelValue on selection', () => {
    const emits = (RadioGroupRoot as any).emits as string[]
    expect(emits).toContain('update:modelValue')
  })
})
