import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { AppToggleButton } from '@openpen/module-api/uikit';

function mountButton(props = {}) {
  return mount(AppToggleButton, {
    props: { modelValue: false, ariaLabel: 'Bold', testid: 'tb', ...props },
    slots: { default: 'B' },
  });
}

describe('AppToggleButton', () => {
  it('renders a button with the slot content and accessible name', () => {
    const wrapper = mountButton();
    const btn = wrapper.find('[data-testid="tb"]');
    expect(btn.element.tagName).toBe('BUTTON');
    expect(btn.text()).toBe('B');
    expect(btn.attributes('aria-label')).toBe('Bold');
  });

  it('exposes the two states through aria-pressed', () => {
    expect(mountButton({ modelValue: false }).find('[data-testid="tb"]').attributes('aria-pressed')).toBe('false');
    expect(mountButton({ modelValue: true }).find('[data-testid="tb"]').attributes('aria-pressed')).toBe('true');
  });

  it('adds the pressed class only while pressed', () => {
    expect(mountButton({ modelValue: false }).find('[data-testid="tb"]').classes()).not.toContain('pressed');
    expect(mountButton({ modelValue: true }).find('[data-testid="tb"]').classes()).toContain('pressed');
  });

  it('emits the flipped state on click', async () => {
    const wrapper = mountButton({ modelValue: false });
    await wrapper.find('[data-testid="tb"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual([true]);
    const on = mountButton({ modelValue: true });
    await on.find('[data-testid="tb"]').trigger('click');
    expect(on.emitted('update:modelValue')?.[0]).toEqual([false]);
  });

  it('does not emit while disabled', async () => {
    const wrapper = mountButton({ disabled: true });
    await wrapper.find('[data-testid="tb"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  });

  it('keeps each button its own tab stop (no roving focus between siblings)', () => {
    const a = mountButton({ testid: 'a' });
    const b = mountButton({ testid: 'b' });
    expect(a.find('button').attributes('tabindex')).not.toBe('-1');
    expect(b.find('button').attributes('tabindex')).not.toBe('-1');
  });
});
