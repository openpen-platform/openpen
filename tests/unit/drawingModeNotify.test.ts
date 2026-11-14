/**
 * drawingModeNotify.test.ts: the host drawing-mode toast.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { i18n } from '../../src/i18n/index'
import { notifyDrawingMode } from '../../src/services/drawing-mode-notify'
import {
  notificationQueue,
  cleanupNotificationService,
  initNotificationService,
  isHostNotifyEnabled,
} from '../../src/services/notification-service'

describe('notifyDrawingMode', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    cleanupNotificationService()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('entering drawing mode pushes a host warning toast with the localized text', () => {
    notifyDrawingMode(true)
    expect(notificationQueue.value).toHaveLength(1)
    const [toast] = notificationQueue.value
    expect(toast.source).toBe('host')
    expect(toast.variant).toBe('warning')
    expect(toast.message).toBe(i18n.global.t('drawingModeOn'))
    expect(toast.message).not.toBe('drawingModeOn')
    expect(toast.description).toBe(i18n.global.t('drawingModeOnSub'))
    expect(toast.icon).toContain('<svg')
  })

  it('leaving drawing mode pushes a host default toast', () => {
    notifyDrawingMode(false)
    const [toast] = notificationQueue.value
    expect(toast.source).toBe('host')
    expect(toast.variant).toBe('default')
    expect(toast.message).toBe(i18n.global.t('drawingModeOff'))
  })

  it('pushes nothing when notifyOnDrawingMode is off', async () => {
    vi.stubGlobal('window', Object.assign(globalThis.window ?? {}, {
      openPenApi: {
        getSettings: () => Promise.resolve({ notifyOnDrawingMode: false }),
        onSettingsUpdated: () => () => {},
      },
    }))
    initNotificationService()
    await vi.advanceTimersByTimeAsync(0)
    expect(isHostNotifyEnabled()).toBe(false)
    notifyDrawingMode(true)
    notifyDrawingMode(false)
    expect(notificationQueue.value).toHaveLength(0)
  })
})
