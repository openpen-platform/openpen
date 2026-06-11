import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import en from '../../src/i18n/en'
import ModuleRow from '../../src/components/settings/ModuleRow.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

function mountRow(props: Record<string, unknown>) {
  return mount(ModuleRow, {
    props,
    global: { plugins: [i18n] },
  })
}

describe('ModuleRow', () => {
  it('renders displayName and description', () => {
    const wrapper = mountRow({
      id: '@openpen/freehand',
      displayName: 'Freehand',
      description: 'Free-form pen tool.',
      isEnabled: true,
    })
    expect(wrapper.find('[data-testid="module-row-name"]').text()).toBe('Freehand')
    expect(wrapper.find('[data-testid="module-row-desc"]').text()).toBe('Free-form pen tool.')
  })

  it('hides version element when version prop is undefined', () => {
    const wrapper = mountRow({
      id: '@openpen/freehand',
      displayName: 'Freehand',
      description: 'Free-form pen tool.',
      isEnabled: true,
    })
    expect(wrapper.find('[data-testid="module-row-version"]').exists()).toBe(false)
  })

  it('hides version element when version prop is empty string', () => {
    const wrapper = mountRow({
      id: '@openpen/freehand',
      displayName: 'Freehand',
      description: 'Free-form pen tool.',
      version: '',
      isEnabled: true,
    })
    expect(wrapper.find('[data-testid="module-row-version"]').exists()).toBe(false)
  })

  it('shows version element when version prop is provided', () => {
    const wrapper = mountRow({
      id: 'my-plugin',
      displayName: 'My Plugin',
      description: 'A plugin.',
      version: '1.0.0',
      isEnabled: true,
    })
    expect(wrapper.find('[data-testid="module-row-version"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="module-row-version"]').text()).toBe('v1.0.0')
  })

  it('emits update:enabled when toggle is clicked', async () => {
    const wrapper = mountRow({
      id: '@openpen/freehand',
      displayName: 'Freehand',
      description: 'Free-form pen tool.',
      isEnabled: true,
    })
    await wrapper.find('[data-testid="module-row-toggle"]').trigger('click')
    const emitted = wrapper.emitted('update:enabled')
    expect(emitted).toBeTruthy()
    expect(emitted![0]).toEqual([false])
  })

  it('shows remove button and stacks actions when removable=true', () => {
    const wrapper = mountRow({
      id: '@demo/hello',
      displayName: 'Hello',
      description: 'A plugin.',
      version: '1.0.0',
      isEnabled: true,
      removable: true,
    })
    expect(wrapper.find('[data-testid="module-row-actions"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="module-row-remove-btn"]').exists()).toBe(true)
  })

  it('hides remove button when removable is not set', () => {
    const wrapper = mountRow({
      id: '@openpen/freehand',
      displayName: 'Freehand',
      description: 'Free-form pen tool.',
      isEnabled: true,
    })
    expect(wrapper.find('[data-testid="module-row-actions"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="module-row-remove-btn"]').exists()).toBe(false)
  })

  it('emits remove when remove button is clicked', async () => {
    const wrapper = mountRow({
      id: '@demo/hello',
      displayName: 'Hello',
      description: 'A plugin.',
      isEnabled: true,
      removable: true,
    })
    await wrapper.find('[data-testid="module-row-remove-btn"]').trigger('click')
    expect(wrapper.emitted('remove')).toBeTruthy()
  })

  it('shows hasUpdate badge in meta row', () => {
    const wrapper = mountRow({
      id: '@demo/hello',
      displayName: 'Hello',
      description: 'A plugin.',
      version: '1.0.0',
      isEnabled: true,
      hasUpdate: true,
    })
    expect(wrapper.find('[data-testid="module-row-update-badge"]').exists()).toBe(true)
  })

  it('hides update badge when hasUpdate is false', () => {
    const wrapper = mountRow({
      id: '@demo/hello',
      displayName: 'Hello',
      description: 'A plugin.',
      version: '1.0.0',
      isEnabled: true,
      hasUpdate: false,
    })
    expect(wrapper.find('[data-testid="module-row-update-badge"]').exists()).toBe(false)
  })
})
