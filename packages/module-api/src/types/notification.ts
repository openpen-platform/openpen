/**
 * notification.ts — NotifyPayload and NotifyHandle type definitions.
 *
 * Used by callers of ctx.notify(payload); NotificationService implements
 * the host-side logic.
 *
 * Runtime messages (notify / status text, etc.) are always resolved to a
 * plain string via ctx.t(key) before being passed in. LocaleMap is reserved
 * for module manifest metadata (name, description, contribution label),
 * following the VS Code package.nls.json / JetBrains plugin.xml convention.
 */

/**
 * Input payload for ctx.notify().
 *
 * **Overlay-window only.** Toasts render via the host's
 * NotificationLayer, which is mounted exclusively in the overlay
 * window. Calls made while the overlay is not the active context
 * silently no-op (no error, no queue persistence). See
 * `docs/reference/notify-api.md` → "When does the toast appear?"
 * for guidance on choosing notify() versus your own UI surface.
 */
export interface NotifyPayload {
  /** Required. Already-resolved plain string; use ctx.t(key) for i18n. */
  message: string
  /** Subtitle text. Already-resolved plain string, e.g. "Press again to exit". */
  description?: string
  /** Inline SVG string, same convention as ToolContribution.icon. */
  icon?: string
  /** Semantic colour variant. Defaults to 'default'. */
  variant?: 'default' | 'success' | 'warning' | 'danger'
  /** Auto-dismiss delay in milliseconds. Defaults to 1800. */
  duration?: number
}

/** Return value of ctx.notify(), allowing early dismissal. */
export interface NotifyHandle {
  /** Immediately closes this notification. */
  dismiss(): void
}
