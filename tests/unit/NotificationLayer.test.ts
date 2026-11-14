/**
 * NotificationLayer.test.ts: which queue items the layer renders.
 *
 * The control-bar window mounts the layer with `hostOnly` because its queue
 * also receives module `ctx.notify` calls that the overlay already shows.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import NotificationLayer from '../../src/components/NotificationLayer.vue'
import { pushNotification, cleanupNotificationService } from '../../src/services/notification-service'

function pushMixed(): void {
  pushNotification({ message: 'from host', duration: 60000 }, { source: 'host' })
  pushNotification({ message: 'from module', duration: 60000 }, { source: '@vendor/plugin' })
  pushNotification({ message: 'from bootstrap', duration: 60000 }, { source: 'bootstrap' })
}

describe('NotificationLayer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    cleanupNotificationService()
  })

  it('renders every source by default (overlay window)', async () => {
    const wrapper = mount(NotificationLayer)
    pushMixed()
    await nextTick()
    const texts = wrapper.findAll('[data-testid="notification-toast"]').map((w) => w.text())
    expect(texts).toEqual(['from host', 'from module', 'from bootstrap'])
  })

  it('renders only host toasts with hostOnly (control-bar window)', async () => {
    const wrapper = mount(NotificationLayer, { props: { hostOnly: true } })
    pushMixed()
    await nextTick()
    const texts = wrapper.findAll('[data-testid="notification-toast"]').map((w) => w.text())
    expect(texts).toEqual(['from host'])
  })

  it('a module toast never appears in a hostOnly layer, even after others expire', async () => {
    const wrapper = mount(NotificationLayer, { props: { hostOnly: true } })
    pushNotification({ message: 'module only', duration: 500 }, { source: '@vendor/plugin' })
    await nextTick()
    expect(wrapper.findAll('[data-testid="notification-toast"]')).toHaveLength(0)
  })
})
