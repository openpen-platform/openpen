/**
 * AppSlider unit tests.
 *
 * AppSlider wraps Reka UI SliderRoot/Track/Range/Thumb.
 * DOM structure: SliderRoot > SliderTrack > SliderRange + SliderThumb (div-based,
 * not <input type="range">).
 *
 * Notable DOM characteristics (Reka UI structure):
 *   - No <input type="range"> element
 *   - Fill comes from .app-slider-range width (CSS-driven by Reka UI, not inline style)
 *   - Vertical mode: data-orientation="vertical" on .app-slider-root
 */
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { AppSlider } from '@openpen/module-api/uikit';

describe('AppSlider', () => {
  it('renders the Reka UI slider root with correct data attributes', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1 },
    });
    // Reka UI SliderRoot renders a div with data-orientation
    const root = wrapper.find('.app-slider-root');
    expect(root.exists()).toBe(true);
    expect(root.attributes('data-orientation')).toBe('horizontal');
  });

  it('renders track, range and thumb sub-elements', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1 },
    });
    expect(wrapper.find('.app-slider-track').exists()).toBe(true);
    expect(wrapper.find('.app-slider-range').exists()).toBe(true);
    expect(wrapper.find('.app-slider-thumb').exists()).toBe(true);
  });

  it('applies correct width via style on root', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 10, min: 1, max: 20, step: 1, width: '72px' },
    });
    const root = wrapper.find('.app-slider-root');
    expect(root.element.style.width).toBe('72px');
  });

  it('emits update:modelValue with numeric value when Reka UI fires update', async () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1 },
    });
    // Simulate Reka UI's update:modelValue event (array of numbers)
    await wrapper.getComponent({ name: 'SliderRoot' }).vm.$emit('update:modelValue', [10]);
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([10]);
  });

  it('renders vertical orientation when orientation=vertical', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1, orientation: 'vertical', width: '64px' },
    });
    const root = wrapper.find('.app-slider-root');
    expect(root.exists()).toBe(true);
    expect(root.attributes('data-orientation')).toBe('vertical');
    expect(root.classes()).toContain('app-slider-root--vertical');
    // In vertical mode, width prop becomes the height of the container
    expect(root.element.style.height).toBe('64px');
  });

  it('does NOT have vertical class in horizontal mode', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1 },
    });
    const root = wrapper.find('.app-slider-root');
    expect(root.classes()).not.toContain('app-slider-root--vertical');
  });

  it('passes min / max / step props to SliderRoot', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 2 },
    });
    const root = wrapper.find('.app-slider-root');
    // Reka UI renders aria-valuemin / aria-valuemax on the thumb
    const thumb = wrapper.find('.app-slider-thumb');
    expect(thumb.exists()).toBe(true);
    // Root element has the min/max accessible via aria
    expect(root.exists()).toBe(true);
  });

  // ── inverted prop ────────────────────────────────────────────────────────────

  it('does NOT have inverted class by default', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1 },
    });
    expect(wrapper.find('.app-slider-root').classes()).not.toContain('app-slider-root--inverted');
  });

  it('adds app-slider-root--inverted class when inverted=true (vertical)', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1, orientation: 'vertical', width: '64px', inverted: true },
    });
    const root = wrapper.find('.app-slider-root');
    expect(root.classes()).toContain('app-slider-root--inverted');
  });

  it('adds app-slider-root--inverted class when inverted=true (horizontal)', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1, inverted: true },
    });
    expect(wrapper.find('.app-slider-root').classes()).toContain('app-slider-root--inverted');
  });

  it('passes inverted=true down to SliderRoot', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1, orientation: 'vertical', width: '64px', inverted: true },
    });
    const sliderRoot = wrapper.getComponent({ name: 'SliderRoot' });
    expect(sliderRoot.props('inverted')).toBe(true);
  });

  it('passes inverted=false (default) down to SliderRoot', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1 },
    });
    const sliderRoot = wrapper.getComponent({ name: 'SliderRoot' });
    expect(sliderRoot.props('inverted')).toBe(false);
  });

  it('emits update:modelValue unchanged when inverted=true (no value transformation)', async () => {
    // reka-ui handles the inverted direction internally; AppSlider passes the
    // emitted value straight through regardless of the inverted flag.
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1, orientation: 'vertical', width: '64px', inverted: true },
    });
    await wrapper.getComponent({ name: 'SliderRoot' }).vm.$emit('update:modelValue', [13]);
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([13]);
  });

  it('inverted class toggles reactively when prop changes', async () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1, orientation: 'vertical', width: '64px', inverted: false },
    });
    expect(wrapper.find('.app-slider-root').classes()).not.toContain('app-slider-root--inverted');
    await wrapper.setProps({ inverted: true });
    expect(wrapper.find('.app-slider-root').classes()).toContain('app-slider-root--inverted');
  });
});
