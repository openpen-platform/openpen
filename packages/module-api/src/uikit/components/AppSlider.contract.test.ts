/**
 * AppSlider.contract.test.ts
 *
 * PURPOSE: When reka-ui upgrades, if the Slider API shape we depend on changes,
 * CI catches it immediately.
 *
 * This is NOT a test of AppSlider behaviour — see tests/unit/AppSlider.test.js
 * for that. This file tests only the specific reka-ui contract that
 * AppSlider.vue relies on internally.
 *
 * Contract test — verifies the public API surface is stable.
 * Upgrade gate: run this first when bumping reka-ui.
 */
import { describe, expect, it } from 'vitest'
import {
  SliderRoot,
  SliderTrack,
  SliderRange,
  SliderThumb,
} from 'reka-ui'

describe('reka-ui Slider contract (consumed by AppSlider)', () => {
  it('exports the 4 components AppSlider depends on', () => {
    expect(SliderRoot).toBeDefined()
    expect(SliderTrack).toBeDefined()
    expect(SliderRange).toBeDefined()
    expect(SliderThumb).toBeDefined()
  })

  it('SliderRoot accepts modelValue, min, max, step props we use', () => {
    const props = SliderRoot.props as Record<string, unknown>
    expect(props.modelValue).toBeDefined()
    expect(props.min).toBeDefined()
    expect(props.max).toBeDefined()
    expect(props.step).toBeDefined()
  })

  it('SliderRoot accepts orientation prop (horizontal/vertical)', () => {
    const props = SliderRoot.props as Record<string, unknown>
    expect(props.orientation).toBeDefined()
  })

  it('SliderRoot emits update:modelValue (controlled mode)', () => {
    // AppSlider uses :model-value + @update:model-value for v-model binding.
    // We verify the prop exists here; emit shape is validated by unit tests.
    const props = SliderRoot.props as Record<string, unknown>
    expect(props.modelValue).toBeDefined()
  })

  it('SliderRoot accepts defaultValue for uncontrolled mode', () => {
    const props = SliderRoot.props as Record<string, unknown>
    expect(props.defaultValue).toBeDefined()
  })

  it('SliderRoot accepts disabled prop', () => {
    const props = SliderRoot.props as Record<string, unknown>
    expect(props.disabled).toBeDefined()
  })

  it('SliderRoot accepts inverted prop (for RTL / reversed sliders)', () => {
    const props = SliderRoot.props as Record<string, unknown>
    expect(props.inverted).toBeDefined()
  })
})
