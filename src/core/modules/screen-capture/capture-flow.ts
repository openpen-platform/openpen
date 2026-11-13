/**
 * Renderer-side capture flow shared by the control-bar button and the global
 * shortcuts: ask the host to capture, then tell the user what happened.
 *
 * The host owns the capture itself (it needs the OS screen APIs); this file
 * only turns the host's result into a toast or, for a missing system
 * permission, a dialog with a way to the OS settings.
 */
import type { NotifyPayload } from '@openpen/module-api'

export type CaptureTarget = 'save' | 'copy'

export interface CaptureFlowDeps {
  api: Pick<NonNullable<Window['openPenApi']>, 'captureScreen' | 'openCapturePermissionSettings'> | undefined
  notify: (payload: NotifyPayload) => unknown
  t: (key: string, params?: Record<string, unknown>) => string
  confirm: (opts: { title: string; message: string; okLabel: string; cancelLabel: string }) => Promise<boolean>
}

/** Toast for a finished capture. `busy` and `permission-denied` have none here. */
export function notifyCaptureResult(
  result: CaptureResult,
  deps: Pick<CaptureFlowDeps, 'notify' | 't'>,
): void {
  const { notify, t } = deps
  if (result.ok) {
    notify(
      result.target === 'copy'
        ? { message: t('copied'), description: t('copiedSub'), variant: 'success' }
        : { message: t('saved'), description: result.path, variant: 'success', duration: 4000 },
    )
    return
  }
  switch (result.error) {
    case 'unsupported':
      notify({ message: t('unsupported'), description: t('unsupportedSub'), variant: 'warning', duration: 5000 })
      return
    case 'failed':
      notify({ message: t('failed'), description: t('failedSub'), variant: 'danger', duration: 4000 })
      return
    default:
      return
  }
}

/**
 * `toast: false` is for a window with no toast layer (the control bar): the
 * host relays the outcome to the overlay, which shows it via notifyCaptureResult.
 */
export async function runCapture(
  target: CaptureTarget,
  deps: CaptureFlowDeps,
  { toast = true }: { toast?: boolean } = {},
): Promise<void> {
  const { api, t, confirm } = deps
  if (!api?.captureScreen) return

  const result = await api.captureScreen(target)
  if (!result.ok && result.error === 'permission-denied') {
    const open = await confirm({
      title: t('permissionTitle'),
      message: t('permissionBody'),
      okLabel: t('permissionOpen'),
      cancelLabel: t('permissionCancel'),
    })
    if (open) await api.openCapturePermissionSettings()
    return
  }
  if (toast) notifyCaptureResult(result, deps)
}
