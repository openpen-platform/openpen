import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AppBanner from './AppBanner.vue'
import type { BannerVariant } from './AppBanner.vue'

describe('AppBanner contract', () => {
  it('renders with variant class and status role', () => {
    const wrapper = mount(AppBanner, { props: { variant: 'info' } })
    expect(wrapper.classes()).toContain('app-banner')
    expect(wrapper.classes()).toContain('app-banner-info')
    expect(wrapper.attributes('role')).toBe('status')
  })

  it('uses alert role for error variant', () => {
    const wrapper = mount(AppBanner, { props: { variant: 'error' } })
    expect(wrapper.attributes('role')).toBe('alert')
  })

  it('adds inline class when inline prop is true', () => {
    const wrapper = mount(AppBanner, { props: { variant: 'warning', inline: true } })
    expect(wrapper.classes()).toContain('app-banner-inline')
  })

  it('renders default slot content', () => {
    const wrapper = mount(AppBanner, {
      props: { variant: 'success' },
      slots: { default: 'Test message' },
    })
    expect(wrapper.find('.app-banner-body').text()).toContain('Test message')
  })

  it('renders actions slot when provided', () => {
    const wrapper = mount(AppBanner, {
      props: { variant: 'info' },
      slots: { actions: '<button>Retry</button>' },
    })
    expect(wrapper.find('.app-banner-actions').exists()).toBe(true)
    expect(wrapper.find('.app-banner-actions button').text()).toBe('Retry')
  })

  it('does not render actions slot container when slot is absent', () => {
    const wrapper = mount(AppBanner, { props: { variant: 'warning' } })
    expect(wrapper.find('.app-banner-actions').exists()).toBe(false)
  })

  const variants: BannerVariant[] = ['info', 'warning', 'success', 'error']
  it.each(variants)('accepts "%s" as a valid variant', (variant) => {
    const wrapper = mount(AppBanner, { props: { variant } })
    expect(wrapper.classes()).toContain(`app-banner-${variant}`)
  })
})
