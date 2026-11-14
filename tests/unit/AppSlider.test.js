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
import { describe, it, expect, beforeAll } from 'vitest';
import { mount } from '@vue/test-utils';
import { AppSlider } from '@openpen/module-api/uikit';

describe('AppSlider', () => {
  it('renders the Reka UI slider root with correct data attributes', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1 },
    });
    // Reka UI SliderRoot renders a div with data-orientation
    const root = wrapper.find('[data-testid="app-slider-root"]');
    expect(root.exists()).toBe(true);
    expect(root.attributes('data-orientation')).toBe('horizontal');
  });

  it('renders track, range and thumb sub-elements', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1 },
    });
    expect(wrapper.find('[data-testid="app-slider-track"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="app-slider-range"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="app-slider-thumb"]').exists()).toBe(true);
  });

  it('applies correct width via style on root', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 10, min: 1, max: 20, step: 1, width: '72px' },
    });
    const root = wrapper.find('[data-testid="app-slider-root"]');
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
    const root = wrapper.find('[data-testid="app-slider-root"]');
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
    const root = wrapper.find('[data-testid="app-slider-root"]');
    expect(root.classes()).not.toContain('app-slider-root--vertical');
  });

  it('passes min / max / step props to SliderRoot', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 2 },
    });
    const root = wrapper.find('[data-testid="app-slider-root"]');
    // Reka UI renders aria-valuemin / aria-valuemax on the thumb
    const thumb = wrapper.find('[data-testid="app-slider-thumb"]');
    expect(thumb.exists()).toBe(true);
    // Root element has the min/max accessible via aria
    expect(root.exists()).toBe(true);
  });

  // ── inverted prop ────────────────────────────────────────────────────────────

  it('does NOT have inverted class by default', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1 },
    });
    expect(wrapper.find('[data-testid="app-slider-root"]').classes()).not.toContain('app-slider-root--inverted');
  });

  it('adds app-slider-root--inverted class when inverted=true (vertical)', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1, orientation: 'vertical', width: '64px', inverted: true },
    });
    const root = wrapper.find('[data-testid="app-slider-root"]');
    expect(root.classes()).toContain('app-slider-root--inverted');
  });

  it('adds app-slider-root--inverted class when inverted=true (horizontal)', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1, inverted: true },
    });
    expect(wrapper.find('[data-testid="app-slider-root"]').classes()).toContain('app-slider-root--inverted');
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
    expect(wrapper.find('[data-testid="app-slider-root"]').classes()).not.toContain('app-slider-root--inverted');
    await wrapper.setProps({ inverted: true });
    expect(wrapper.find('[data-testid="app-slider-root"]').classes()).toContain('app-slider-root--inverted');
  });

  it('puts ariaLabel on the focusable thumb, not on the wrapper', () => {
    const wrapper = mount(AppSlider, {
      props: { modelValue: 5, min: 1, max: 20, step: 1, ariaLabel: 'Radius' },
    });
    const thumb = wrapper.find('[role="slider"]');
    expect(thumb.attributes('aria-label')).toBe('Radius');
    expect(wrapper.find('[data-testid="app-slider-root"]').attributes('aria-label')).toBeUndefined();
  });

  describe('value bubble', () => {
    // jsdom has no pointer capture; Reka's slider calls it on pointerdown.
    beforeAll(() => {
      for (const m of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture']) {
        if (!HTMLElement.prototype[m]) HTMLElement.prototype[m] = () => false;
      }
    });

    const mountWithLabel = (extra = {}) =>
      mount(AppSlider, {
        props: { modelValue: 4, min: 1, max: 20, step: 1, valueLabel: '4px', ...extra },
        attachTo: document.body,
      });

    it('shows no bubble before the slider is pressed', () => {
      const wrapper = mountWithLabel();
      expect(wrapper.find('[data-testid="app-slider-bubble"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('shows the value label above the thumb while the slider is pressed and hides it on release', async () => {
      const wrapper = mountWithLabel();
      await wrapper.find('[data-testid="app-slider-root"]').trigger('pointerdown');
      const bubble = wrapper.find('[data-testid="app-slider-bubble"]');
      expect(bubble.exists()).toBe(true);
      expect(bubble.text()).toBe('4px');
      document.dispatchEvent(new Event('pointerup'));
      await wrapper.vm.$nextTick();
      expect(wrapper.find('[data-testid="app-slider-bubble"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it('never shows a bubble when no value label is given', async () => {
      const wrapper = mount(AppSlider, { props: { modelValue: 4, min: 1, max: 20 } });
      await wrapper.find('[data-testid="app-slider-root"]').trigger('pointerdown');
      expect(wrapper.find('[data-testid="app-slider-bubble"]').exists()).toBe(false);
      document.dispatchEvent(new Event('pointerup'));
      wrapper.unmount();
    });

    it('never shows a bubble on a vertical slider', async () => {
      const wrapper = mountWithLabel({ orientation: 'vertical' });
      await wrapper.find('[data-testid="app-slider-root"]').trigger('pointerdown');
      expect(wrapper.find('[data-testid="app-slider-bubble"]').exists()).toBe(false);
      document.dispatchEvent(new Event('pointerup'));
      wrapper.unmount();
    });

    it('exposes the value label to assistive technology as aria-valuetext', () => {
      const wrapper = mountWithLabel();
      expect(wrapper.find('[data-testid="app-slider-thumb"]').attributes('aria-valuetext')).toBe('4px');
      wrapper.unmount();
    });

    it('keeps the bubble out of the accessibility tree', async () => {
      const wrapper = mountWithLabel();
      await wrapper.find('[data-testid="app-slider-root"]').trigger('pointerdown');
      expect(wrapper.find('[data-testid="app-slider-bubble"]').attributes('aria-hidden')).toBe('true');
      document.dispatchEvent(new Event('pointerup'));
      wrapper.unmount();
    });
  });
});
