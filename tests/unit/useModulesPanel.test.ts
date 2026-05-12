import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { useModulesPanel } from '../../src/composables/useModulesPanel'

let settingsUpdatedCb: ((s: { disabledModules?: string[] }) => void) | null = null

function installMockApi(
  disabledModules: string[] = [],
  initialDisabled: string[] = [],
) {
  settingsUpdatedCb = null

  const mockApi: Partial<OpenPenApi> = {
    getSettings: vi.fn().mockResolvedValue({ disabledModules }),
    getInitialDisabledModules: vi.fn().mockResolvedValue(initialDisabled),
    updateSettings: vi.fn().mockResolvedValue(undefined),
    onSettingsUpdated: vi.fn().mockImplementation((cb) => {
      settingsUpdatedCb = cb
      return () => { settingsUpdatedCb = null }
    }),
  }

  // @ts-expect-error partial mock
  window.openPenApi = mockApi
  return mockApi
}

afterEach(() => {
  // @ts-expect-error cleanup
  window.openPenApi = undefined
  settingsUpdatedCb = null
})

describe('useModulesPanel', () => {
  it('start() populates currentDisabled and initialDisabled from main', async () => {
    installMockApi(['@openpen/freehand'], ['@openpen/freehand'])
    const { currentDisabled, initialDisabled, start, stop } = useModulesPanel()

    await start()
    await nextTick()

    expect(currentDisabled.value).toEqual(['@openpen/freehand'])
    expect(initialDisabled.value).toEqual(['@openpen/freehand'])
    stop()
  })

  it('pendingRestart is false when currentDisabled matches initialDisabled', async () => {
    installMockApi(['@openpen/line'], ['@openpen/line'])
    const { pendingRestart, start, stop } = useModulesPanel()

    await start()
    await nextTick()

    expect(pendingRestart.value).toBe(false)
    stop()
  })

  it('toggleModule(id, false) calls updateSettings with id added to disabled list', async () => {
    const mockApi = installMockApi([], [])
    const { toggleModule, start, stop } = useModulesPanel()

    await start()
    await toggleModule('@openpen/freehand', false)

    expect(mockApi.updateSettings).toHaveBeenCalledWith({ disabledModules: ['@openpen/freehand'] })
    stop()
  })

  it('toggleModule(id, true) calls updateSettings with id removed from disabled list', async () => {
    const mockApi = installMockApi(['@openpen/freehand', '@openpen/line'], [])
    const { toggleModule, start, stop } = useModulesPanel()

    await start()
    await toggleModule('@openpen/freehand', true)

    expect(mockApi.updateSettings).toHaveBeenCalledWith({ disabledModules: ['@openpen/line'] })
    stop()
  })

  it('pendingRestart becomes true when settings update broadcasts diverging state', async () => {
    installMockApi([], [])
    const { pendingRestart, start, stop } = useModulesPanel()

    await start()
    expect(pendingRestart.value).toBe(false)

    settingsUpdatedCb?.({ disabledModules: ['@openpen/color'] })
    await nextTick()

    expect(pendingRestart.value).toBe(true)
    stop()
  })

  it('stop() calls the unsubscribe function', async () => {
    installMockApi([], [])
    const { start, stop } = useModulesPanel()

    await start()
    stop()

    expect(settingsUpdatedCb).toBeNull()
  })
})
