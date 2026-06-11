import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { AppToggle } from '@openpen/module-api/uikit';

describe('AppToggle', () => {
  it('renders a button element', () => {
    const wrapper = mount(AppToggle, {
      props: { modelValue: false, testid: 'app-toggle-sample' },
    });
    const btn = wrapper.find('[data-testid="app-toggle-sample"]');
    expect(btn.exists()).toBe(true);
    expect(btn.element.tagName).toBe('BUTTON');
  });

  it('has class "on" when modelValue is true', () => {
    const wrapper = mount(AppToggle, {
      props: { modelValue: true },
    });
    expect(wrapper.find('button').classes()).toContain('on');
  });

  it('does NOT have class "on" when modelValue is false', () => {
    const wrapper = mount(AppToggle, {
      props: { modelValue: false },
    });
    expect(wrapper.find('button').classes()).not.toContain('on');
  });

  it('emits update:modelValue with toggled value on click', async () => {
    const wrapper = mount(AppToggle, {
      props: { modelValue: false },
    });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([true]);
  });

  it('emits false when currently true', async () => {
    const wrapper = mount(AppToggle, {
      props: { modelValue: true },
    });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('update:modelValue')[0]).toEqual([false]);
  });

  it('sets aria-label from prop', () => {
    const wrapper = mount(AppToggle, {
      props: { modelValue: false, ariaLabel: 'Enable animations' },
    });
    expect(wrapper.find('button').attributes('aria-label')).toBe('Enable animations');
  });

  it('sets aria-pressed to match modelValue', () => {
    const wrapper = mount(AppToggle, {
      props: { modelValue: true },
    });
    expect(wrapper.find('button').attributes('aria-pressed')).toBe('true');
  });

  it('has role="switch"', () => {
    const wrapper = mount(AppToggle, {
      props: { modelValue: false },
    });
    expect(wrapper.find('button').attributes('role')).toBe('switch');
  });
});
