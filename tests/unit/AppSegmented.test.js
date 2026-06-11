import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { AppSegmented } from '@openpen/module-api/uikit';

const OPTIONS = [
  { value: 'slider', label: 'Slider', testid: 'app-seg-opt-slider' },
  { value: 'popup',  label: 'Popup',  testid: 'app-seg-opt-popup' },
];

describe('AppSegmented', () => {
  it('renders one button per option', () => {
    const wrapper = mount(AppSegmented, {
      props: { modelValue: 'slider', options: OPTIONS },
    });
    expect(wrapper.findAll('[data-testid^="app-seg-opt-"]').length).toBe(2);
  });

  it('renders correct labels', () => {
    const wrapper = mount(AppSegmented, {
      props: { modelValue: 'slider', options: OPTIONS },
    });
    const btns = wrapper.findAll('button');
    expect(btns[0].text()).toBe('Slider');
    expect(btns[1].text()).toBe('Popup');
  });

  it('active class on matching option', () => {
    const wrapper = mount(AppSegmented, {
      props: { modelValue: 'popup', options: OPTIONS },
    });
    const btns = wrapper.findAll('button');
    expect(btns[0].classes()).not.toContain('active');
    expect(btns[1].classes()).toContain('active');
  });

  it('emits update:modelValue with option value on click', async () => {
    const wrapper = mount(AppSegmented, {
      props: { modelValue: 'slider', options: OPTIONS },
    });
    await wrapper.findAll('button')[1].trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['popup']);
  });

  it('renders container with class app-seg', () => {
    const wrapper = mount(AppSegmented, {
      props: { modelValue: 'slider', options: OPTIONS },
    });
    expect(wrapper.find('[data-testid="app-seg"]').exists()).toBe(true);
  });

  it('supports 3 options', () => {
    const threeOpts = [
      { value: 'light', label: 'Light' },
      { value: 'dark',  label: 'Dark' },
      { value: 'system', label: 'System' },
    ];
    const wrapper = mount(AppSegmented, {
      props: { modelValue: 'dark', options: threeOpts },
    });
    const btns = wrapper.findAll('button');
    expect(btns.length).toBe(3);
    expect(btns[1].classes()).toContain('active');
  });

  it('renders option icon html when provided', () => {
    const optsWithIcon = [
      { value: 'light', label: 'Light', icon: '<svg data-testid="icon-light"></svg>' },
      { value: 'dark', label: 'Dark' },
    ];
    const wrapper = mount(AppSegmented, {
      props: { modelValue: 'light', options: optsWithIcon },
    });
    expect(wrapper.find('[data-testid="icon-light"]').exists()).toBe(true);
  });
});
