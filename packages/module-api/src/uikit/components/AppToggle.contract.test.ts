/**
 * AppToggle.contract.test.ts
 *
 * PURPOSE: When reka-ui upgrades, if the Switch API shape we depend on changes,
 * CI catches it immediately.
 *
 * This is NOT a test of AppToggle behaviour — see tests/unit/AppToggle.test.js
 * for that. This file tests only the specific reka-ui contract that
 * AppToggle.vue relies on internally.
 *
 * Contract test — verifies the public API surface is stable.
 * Upgrade gate: run this first when bumping reka-ui.
 */
import { describe, expect, it } from 'vitest'
import {
  SwitchRoot,
  SwitchThumb,
} from 'reka-ui'

describe('reka-ui Switch contract (consumed by AppToggle)', () => {
  it('exports the 2 components AppToggle depends on', () => {
    expect(SwitchRoot).toBeDefined()
    expect(SwitchThumb).toBeDefined()
  })

  it('SwitchRoot accepts modelValue for controlled mode', () => {
    // SwitchRoot is a generic component; cast to any to inspect runtime shape.
    const props = (SwitchRoot as any).props as Record<string, unknown>
    // We bind :model-value to the AppToggle modelValue boolean prop.
    // Reka UI SwitchRoot uses modelValue (not checked) for controlled mode.
    expect(props.modelValue).toBeDefined()
  })

  it('SwitchRoot accepts defaultValue for uncontrolled mode', () => {
    const props = (SwitchRoot as any).props as Record<string, unknown>
    expect(props.defaultValue).toBeDefined()
  })

  it('SwitchRoot accepts disabled prop', () => {
    const props = (SwitchRoot as any).props as Record<string, unknown>
    expect(props.disabled).toBeDefined()
  })

  it('SwitchRoot accepts id prop for label association', () => {
    const props = (SwitchRoot as any).props as Record<string, unknown>
    expect(props.id).toBeDefined()
  })

  it('SwitchRoot emits update:modelValue on toggle (controlled mode)', () => {
    // AppToggle uses @update:model-value to emit update:modelValue.
    // Reka UI SwitchRoot emits 'update:modelValue' (not 'update:checked').
    const emits = (SwitchRoot as any).emits as string[]
    expect(emits).toContain('update:modelValue')
  })
})
