import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { AppSelect } from '@openpen/module-api/uikit';

describe('AppSelect', () => {
  it('gives the trigger button the accessible name passed as ariaLabel', () => {
    const wrapper = mount(AppSelect, {
      props: {
        modelValue: 'a',
        options: [{ value: 'a', label: 'Alpha' }],
        placeholder: 'Pick',
        ariaLabel: 'Font family',
      },
    });
    const trigger = wrapper.find('[role="combobox"]');
    expect(trigger.element.tagName).toBe('BUTTON');
    expect(trigger.attributes('aria-label')).toBe('Font family');
  });
});
