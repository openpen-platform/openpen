import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { AppSwatchPicker } from '@openpen/module-api/uikit';

const COLORS = [
  { value: '#818CF8', label: 'Indigo', testid: 'sw-indigo' },
  { value: '#EF4444', label: 'Red', testid: 'sw-red' },
  { value: '#FFFFFF', label: 'White', testid: 'sw-white' },
];

function mountPicker(props = {}) {
  return mount(AppSwatchPicker, {
    props: { modelValue: '#818cf8', colors: COLORS, ariaLabel: 'Colors', ...props },
    attachTo: document.body,
  });
}

describe('AppSwatchPicker', () => {
  it('renders a radiogroup with one radio per colour', () => {
    const wrapper = mountPicker();
    const group = wrapper.find('[data-testid="app-swatch-picker"]');
    expect(group.attributes('role')).toBe('radiogroup');
    expect(group.attributes('aria-label')).toBe('Colors');
    const radios = wrapper.findAll('[role="radio"]');
    expect(radios).toHaveLength(3);
    expect(radios.map((r) => r.attributes('aria-label'))).toEqual(['Indigo', 'Red', 'White']);
  });

  it('marks the matching swatch checked, ignoring hex case', () => {
    const wrapper = mountPicker({ modelValue: '#818cf8' });
    const checked = wrapper.findAll('[role="radio"]').map((r) => r.attributes('aria-checked'));
    expect(checked).toEqual(['true', 'false', 'false']);
    expect(wrapper.find('[data-testid="sw-indigo"]').classes()).toContain('selected');
  });

  it('exposes state through aria-checked, never aria-pressed', () => {
    const wrapper = mountPicker();
    for (const r of wrapper.findAll('[role="radio"]')) {
      expect(r.attributes('aria-pressed')).toBeUndefined();
    }
  });

  it('emits update:modelValue with the clicked colour value', async () => {
    const wrapper = mountPicker();
    await wrapper.find('[data-testid="sw-red"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['#EF4444']);
  });

  it('applies the background override per colour', () => {
    const wrapper = mountPicker({ background: (c) => `linear-gradient(${c.value}, #000)` });
    expect(wrapper.find('[data-testid="sw-red"]').attributes('style')).toContain('linear-gradient');
  });

  it('applies the shape and size modifier classes', () => {
    const wrapper = mountPicker({ shape: 'rounded', size: 'large' });
    const group = wrapper.find('[data-testid="app-swatch-picker"]');
    expect(group.classes()).toContain('app-swatch-picker--rounded');
    expect(group.classes()).toContain('app-swatch-picker--large');
  });

  it('checks nothing when no colour matches', () => {
    const wrapper = mountPicker({ modelValue: '#123456' });
    const checked = wrapper.findAll('[role="radio"]').map((r) => r.attributes('aria-checked'));
    expect(checked).toEqual(['false', 'false', 'false']);
  });
});
