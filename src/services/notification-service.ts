/**
 * notification-service.ts — OpenPen notification service.
 *
 * Two entry points:
 *   - pushNotification(payload, opts) — imported directly by host commands
 *   - ctx.notify(payload) — injected via makeSetupContextFactory in bootstrap.ts
 *
 * NotificationLayer.vue subscribes to the queue via the notificationQueue ref.
 *
 * NotifyPayload.message / description are plain strings.
 * Callers must resolve i18n keys via ctx.t() / i18n.global.t() before
 * passing them in.
 */
import { ref, readonly } from 'vue'
import type { NotifyPayload, NotifyHandle } from '@openpen/module-api'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type NotificationPosition =
  | 'top-left' | 'top-center' | 'top-right'
  | 'middle-left' | 'center' | 'middle-right'
  | 'bottom-left' | 'bottom-center' | 'bottom-right'

export interface NotificationItem {
  id: string
  /** Already-resolved message text for the current locale. */
  message: string
  /** Already-resolved subtitle text for the current locale. */
  description?: string
  icon?: string
  variant: 'default' | 'success' | 'warning' | 'danger'
  /** Source module id; the host itself uses 'host'. */
  source: string
}

interface PushOptions {
  /** Module id that triggered the notification; use 'host' for host internals. */
  source?: string
  /** Override payload.duration (ms). */
  duration?: number
}

interface RecentRecord {
  id: string
  source: string
  message: string
  variant: 'default' | 'success' | 'warning' | 'danger'
  position: NotificationPosition
  ts: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal state
// ─────────────────────────────────────────────────────────────────────────────

let notifyEnabled = true
let currentPosition: NotificationPosition = 'top-center'

// reactive queue for NotificationLayer
const queue = ref<NotificationItem[]>([])

// Last 5 notifications (for e2e debug).
const recentHistory: RecentRecord[] = []

let idCounter = 0
let unsubSettings: (() => void) | null = null

// ─────────────────────────────────────────────────────────────────────────────
// Public reactive state (read-only for composables)
// ─────────────────────────────────────────────────────────────────────────────

export const notificationQueue = readonly(queue)

export function getNotificationPosition(): NotificationPosition {
  return currentPosition
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call once after the app mounts.
 * Reads initial settings values and subscribes to subsequent updates.
 */
export function initNotificationService(): void {
  // Read current settings once.
  void window.openPenApi?.getSettings().then((s) => {
    applySettings(s as unknown as Record<string, unknown>)
  })

  // Subscribe to future settings updates.
  unsubSettings = window.openPenApi?.onSettingsUpdated((s) => {
    applySettings(s as unknown as Record<string, unknown>)
  }) ?? null

  // Expose debug handle.
  if (typeof window !== 'undefined') {
    const w = window as typeof window & { __OPENPEN_DEBUG__?: Record<string, unknown> }
    w.__OPENPEN_DEBUG__ = w.__OPENPEN_DEBUG__ ?? {}
    w.__OPENPEN_DEBUG__.notifications = {
      recent: () => [...recentHistory],
      count: () => recentHistory.length,
    }
  }
}

/** Clean up the settings subscription (used in tests / hot-reload). */
export function cleanupNotificationService(): void {
  unsubSettings?.()
  unsubSettings = null
  queue.value = []
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Push a notification into the queue.
 * When `notifyOnDrawingMode` is false, host commands must check
 * isHostNotifyEnabled() before calling this. External callers (ctx.notify)
 * call this directly — the service does not gate plugin notifications since
 * they are not necessarily tied to drawing mode.
 */
export function pushNotification(
  payload: NotifyPayload,
  opts: PushOptions = {},
): NotifyHandle {
  const id = `notif-${++idCounter}`
  const message = payload.message
  const description = payload.description ?? undefined
  const variant = payload.variant ?? 'default'
  const duration = opts.duration ?? payload.duration ?? 1800

  const item: NotificationItem = {
    id,
    message,
    description,
    icon: payload.icon,
    variant,
    source: opts.source ?? 'host',
  }

  queue.value.push(item)

  // Record to history (capped at 5).
  const record: RecentRecord = {
    id,
    source: item.source,
    message,
    variant,
    position: currentPosition,
    ts: Date.now(),
  }
  recentHistory.unshift(record)
  if (recentHistory.length > 5) recentHistory.length = 5

  // Auto-dismiss timer.
  const timer = window.setTimeout(() => {
    dismissNotification(id)
  }, duration)

  const handle: NotifyHandle = {
    dismiss() {
      window.clearTimeout(timer)
      dismissNotification(id)
    },
  }

  return handle
}

/** Dismiss a notification by id (also used by the auto-dismiss timer). */
export function dismissNotification(id: string): void {
  const idx = queue.value.findIndex((n) => n.id === id)
  if (idx !== -1) {
    queue.value.splice(idx, 1)
  }
}

/**
 * Returns whether host notifications are enabled (notifyOnDrawingMode gate).
 * Host commands check this before toggling drawing mode.
 */
export function isHostNotifyEnabled(): boolean {
  return notifyEnabled
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function applySettings(s: Record<string, unknown>): void {
  if (typeof s.notifyOnDrawingMode === 'boolean') {
    notifyEnabled = s.notifyOnDrawingMode
  }
  if (typeof s.notificationPosition === 'string') {
    currentPosition = s.notificationPosition as NotificationPosition
  }
}
