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

  it('shows only the icon for an icon-only option and keeps its label as the accessible name', () => {
    const opts = [
      { value: 'a', label: 'Solid head', icon: '<svg data-testid="icon-a"></svg>', iconOnly: true, testid: 'opt-a' },
      { value: 'b', label: 'Open head', icon: '<svg data-testid="icon-b"></svg>', iconOnly: true, testid: 'opt-b' },
    ];
    const wrapper = mount(AppSegmented, { props: { modelValue: 'a', options: opts } });
    const btn = wrapper.find('[data-testid="opt-a"]');
    expect(btn.attributes('aria-label')).toBe('Solid head');
    expect(btn.text()).toBe('');
    expect(wrapper.find('[data-testid="icon-a"]').exists()).toBe(true);
  });

  it('keeps visible text on options that are not icon-only', () => {
    const wrapper = mount(AppSegmented, {
      props: { modelValue: 'slider', options: OPTIONS },
    });
    expect(wrapper.findAll('button')[0].attributes('aria-label')).toBeUndefined();
    expect(wrapper.findAll('button')[0].text()).toBe('Slider');
  });

  it('names the whole group with the aria-label prop', () => {
    const wrapper = mount(AppSegmented, {
      props: { modelValue: 'slider', options: OPTIONS, ariaLabel: 'Head style' },
    });
    expect(wrapper.find('[data-testid="app-seg"]').attributes('aria-label')).toBe('Head style');
  });

  it('still selects an icon-only option on click', async () => {
    const opts = [
      { value: 'a', label: 'A', icon: '<svg></svg>', iconOnly: true, testid: 'opt-a' },
      { value: 'b', label: 'B', icon: '<svg></svg>', iconOnly: true, testid: 'opt-b' },
    ];
    const wrapper = mount(AppSegmented, { props: { modelValue: 'a', options: opts } });
    await wrapper.find('[data-testid="opt-b"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')[0]).toEqual(['b']);
  });
});
