/**
 * notificationService.test.ts — unit tests for NotificationService
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  pushNotification,
  dismissNotification,
  notificationQueue,
  cleanupNotificationService,
  isHostNotifyEnabled,
  getNotificationPosition,
} from '../../src/services/notification-service'

// notification-service uses window.openPenApi.
// In the test environment window.openPenApi is absent, so initNotificationService
// no-ops. We test pushNotification / dismissNotification logic directly.

describe('notification-service — pushNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Reset queue.
    cleanupNotificationService()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('pushNotification adds one item to the queue', () => {
    pushNotification({ message: 'Hello', variant: 'default' })
    expect(notificationQueue.value).toHaveLength(1)
    expect(notificationQueue.value[0].message).toBe('Hello')
    expect(notificationQueue.value[0].variant).toBe('default')
  })

  it('multiple pushes produce distinct ids', () => {
    pushNotification({ message: 'A' })
    pushNotification({ message: 'B' })
    const ids = notificationQueue.value.map((n) => n.id)
    expect(ids[0]).not.toBe(ids[1])
  })

  it('plain string message is passed through unchanged (no LocaleMap resolution)', () => {
    pushNotification({
      message: 'Drawing Mode ON',
    })
    expect(notificationQueue.value[0].message).toBe('Drawing Mode ON')
  })

  it('description is optional and recorded correctly when provided', () => {
    pushNotification({
      message: 'Test',
      description: 'desc here',
    })
    expect(notificationQueue.value[0].description).toBe('desc here')
  })

  it('description is undefined when omitted', () => {
    pushNotification({ message: 'No desc' })
    expect(notificationQueue.value[0].description).toBeUndefined()
  })

  it('variant defaults to "default"', () => {
    pushNotification({ message: 'x' })
    expect(notificationQueue.value[0].variant).toBe('default')
  })

  it('icon is passed through correctly', () => {
    const svg = '<svg/>'
    pushNotification({ message: 'x', icon: svg })
    expect(notificationQueue.value[0].icon).toBe(svg)
  })

  it('source option is recorded correctly', () => {
    pushNotification({ message: 'plugin msg' }, { source: 'my-plugin' })
    expect(notificationQueue.value[0].source).toBe('my-plugin')
  })

  it('source defaults to "host"', () => {
    pushNotification({ message: 'host msg' })
    expect(notificationQueue.value[0].source).toBe('host')
  })

  it('auto-dismisses after duration', async () => {
    pushNotification({ message: 'temp', duration: 500 })
    expect(notificationQueue.value).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(501)
    expect(notificationQueue.value).toHaveLength(0)
  })

  it('default duration is 1800ms', async () => {
    pushNotification({ message: 'default dur' })
    await vi.advanceTimersByTimeAsync(1799)
    expect(notificationQueue.value).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2)
    expect(notificationQueue.value).toHaveLength(0)
  })

  it('handle.dismiss() closes the notification immediately', async () => {
    const handle = pushNotification({ message: 'manual close', duration: 2000 })
    expect(notificationQueue.value).toHaveLength(1)
    handle.dismiss()
    expect(notificationQueue.value).toHaveLength(0)
    // Timer firing after dismiss must not throw or double-remove.
    await vi.advanceTimersByTimeAsync(2001)
    expect(notificationQueue.value).toHaveLength(0)
  })
})

describe('notification-service — dismissNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    cleanupNotificationService()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('dismissing a non-existent id does not throw', () => {
    expect(() => dismissNotification('non-existent')).not.toThrow()
  })

  it('dismissing by id removes the correct item', () => {
    pushNotification({ message: 'A' })
    pushNotification({ message: 'B' })
    const firstId = notificationQueue.value[0].id
    dismissNotification(firstId)
    expect(notificationQueue.value).toHaveLength(1)
    expect(notificationQueue.value[0].message).toBe('B')
  })
})

describe('notification-service — isHostNotifyEnabled & getNotificationPosition', () => {
  it('isHostNotifyEnabled defaults to true', () => {
    expect(isHostNotifyEnabled()).toBe(true)
  })

  it('notificationPosition defaults to "top-center"', () => {
    expect(getNotificationPosition()).toBe('top-center')
  })
})
