import { describe, it, expect, vi } from 'vitest'
import screenCapture from './index'
import { notifyCaptureResult, runCapture, type CaptureFlowDeps } from './capture-flow'

function makeDeps(result: CaptureResult | null) {
  const api = {
    captureScreen: vi.fn(async () => result as CaptureResult),
    openCapturePermissionSettings: vi.fn(async () => undefined),
  }
  const deps = {
    api: result === null ? undefined : api,
    notify: vi.fn(),
    t: (key: string) => key,
    confirm: vi.fn(async () => true),
  } satisfies CaptureFlowDeps
  return { api, deps }
}

describe('screen-capture module', () => {
  it('contributes a control-bar button and two global shortcuts on uncommon keys', () => {
    expect(screenCapture.id).toBe('@openpen/screen-capture')
    expect(screenCapture.contributes?.controlBar).toHaveLength(1)
    const shortcuts = screenCapture.contributes?.shortcuts ?? []
    expect(shortcuts.map((s) => s.id)).toEqual(['capture-save', 'capture-copy'])
    expect(shortcuts.every((s) => s.scope === 'global' && s.userCustomizable)).toBe(true)
    expect(new Set(shortcuts.map((s) => s.keys)).size).toBe(2)
  })
})

describe('runCapture', () => {
  it('asks the host for the chosen target and reports the saved path', async () => {
    const { api, deps } = makeDeps({ ok: true, target: 'save', path: '/p/a.png' })
    await runCapture('save', deps)
    expect(api.captureScreen).toHaveBeenCalledWith('save')
    expect(deps.notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'saved', description: '/p/a.png' }))
  })

  it('confirms a copy without a path', async () => {
    const { deps } = makeDeps({ ok: true, target: 'copy' })
    await runCapture('copy', deps)
    expect(deps.notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'copied' }))
  })

  it('explains a missing permission and offers the system settings', async () => {
    const { api, deps } = makeDeps({ ok: false, error: 'permission-denied' })
    await runCapture('save', deps)
    expect(deps.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'permissionTitle', okLabel: 'permissionOpen' }))
    expect(api.openCapturePermissionSettings).toHaveBeenCalledTimes(1)
    expect(deps.notify).not.toHaveBeenCalled()
  })

  it('does not open the system settings when the user declines', async () => {
    const { api, deps } = makeDeps({ ok: false, error: 'permission-denied' })
    deps.confirm.mockResolvedValueOnce(false)
    await runCapture('save', deps)
    expect(api.openCapturePermissionSettings).not.toHaveBeenCalled()
  })

  it('tells the user when the platform cannot capture, and when it fails', async () => {
    const unsupported = makeDeps({ ok: false, error: 'unsupported' })
    await runCapture('save', unsupported.deps)
    expect(unsupported.deps.notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'unsupported', variant: 'warning' }))

    const failed = makeDeps({ ok: false, error: 'failed' })
    await runCapture('copy', failed.deps)
    expect(failed.deps.notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'failed', variant: 'danger' }))
  })

  it('stays silent for a request that overlapped a running capture, and without a host api', async () => {
    const busy = makeDeps({ ok: false, error: 'busy' })
    await runCapture('save', busy.deps)
    expect(busy.deps.notify).not.toHaveBeenCalled()
    const none = makeDeps(null)
    await expect(runCapture('save', none.deps)).resolves.toBeUndefined()
  })
})

describe('capture from a window without a toast layer', () => {
  it('leaves the toast to the overlay, which shows the same message', async () => {
    const { deps } = makeDeps({ ok: true, target: 'save', path: '/p/a.png' })
    await runCapture('save', deps, { toast: false })
    expect(deps.notify).not.toHaveBeenCalled()

    // the permission dialog is answered in the asking window whatever the toast setting
    const denied = makeDeps({ ok: false, error: 'permission-denied' })
    await runCapture('save', denied.deps, { toast: false })
    expect(denied.deps.confirm).toHaveBeenCalledTimes(1)
    expect(denied.api.openCapturePermissionSettings).toHaveBeenCalledTimes(1)
    expect(denied.deps.notify).not.toHaveBeenCalled()

    notifyCaptureResult({ ok: true, target: 'save', path: '/p/a.png' }, deps)
    expect(deps.notify).toHaveBeenCalledWith(expect.objectContaining({ message: 'saved', description: '/p/a.png' }))
  })
})
