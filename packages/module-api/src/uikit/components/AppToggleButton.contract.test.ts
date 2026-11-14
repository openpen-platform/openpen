/**
 * AppToggleButton.contract.test.ts
 *
 * PURPOSE: When reka-ui upgrades, if the Toggle API shape we depend on changes,
 * CI catches it immediately.
 *
 * This is NOT a test of AppToggleButton behaviour — see
 * tests/unit/AppToggleButton.test.js for that. This file tests only the
 * specific reka-ui contract that AppToggleButton.vue relies on internally.
 *
 * Upgrade gate: run this first when bumping reka-ui.
 */
import { describe, expect, it } from 'vitest'
import { Toggle } from 'reka-ui'

describe('reka-ui Toggle contract (consumed by AppToggleButton)', () => {
  it('exports the Toggle component', () => {
    expect(Toggle).toBeDefined()
  })

  it('Toggle accepts modelValue for controlled mode', () => {
    const props = (Toggle as any).props as Record<string, unknown>
    expect(props.modelValue).toBeDefined()
  })

  it('Toggle accepts disabled prop', () => {
    const props = (Toggle as any).props as Record<string, unknown>
    expect(props.disabled).toBeDefined()
  })

  it('Toggle emits update:modelValue on press (controlled mode)', () => {
    const emits = (Toggle as any).emits as string[]
    expect(emits).toContain('update:modelValue')
  })
})
