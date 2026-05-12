import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { useDiagnostics } from '../../src/composables/useDiagnostics'

// ── helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<DiagnosticsEvent> = {}): DiagnosticsEvent {
  return {
    id: 'evt-1',
    layer: 'L1',
    backupPath: '/backup/file.bak',
    detectedAt: new Date().toISOString(),
    acknowledgedAt: null,
    ...overrides,
  }
}

// ── setup ─────────────────────────────────────────────────────────────────────

let stateChangedCb: ((state: DiagnosticsState) => void) | null = null

function installMockApi(initialEvents: DiagnosticsEvent[] = []) {
  stateChangedCb = null

  const mockApi: Partial<OpenPenApi> = {
    getDiagnosticsState: vi.fn().mockResolvedValue({ events: initialEvents }),
    acknowledgeDiagnostics: vi.fn().mockResolvedValue(undefined),
    openBackupDir: vi.fn().mockResolvedValue(undefined),
    onDiagnosticsStateChanged: vi.fn().mockImplementation((cb) => {
      stateChangedCb = cb
      return () => { stateChangedCb = null }
    }),
  }

  // @ts-expect-error partial mock
  window.openPenApi = mockApi
  return mockApi
}

afterEach(() => {
  stateChangedCb = null
  // @ts-expect-error cleanup
  delete window.openPenApi
})

// ── tests ─────────────────────────────────────────────────────────────────────

describe('useDiagnostics', () => {
  it('fetches initial state and exposes events', async () => {
    const event = makeEvent()
    installMockApi([event])

    const { events } = useDiagnostics()

    // Before the getDiagnosticsState Promise resolves, events is empty.
    expect(events.value).toEqual([])

    // Flush the microtask queue.
    await Promise.resolve()
    await nextTick()

    expect(events.value).toHaveLength(1)
    expect(events.value[0].id).toBe('evt-1')
  })

  it('pendingCount reflects events with acknowledgedAt === null', async () => {
    const pending = makeEvent({ id: 'p1', acknowledgedAt: null })
    const acked = makeEvent({ id: 'p2', acknowledgedAt: new Date().toISOString() })
    installMockApi([pending, acked])

    const { pendingCount } = useDiagnostics()

    await Promise.resolve()
    await nextTick()

    expect(pendingCount.value).toBe(1)
  })

  it('pendingCount updates reactively when state changes via subscription', async () => {
    installMockApi()
    const { pendingCount } = useDiagnostics()

    // The subscription callback is set synchronously.
    expect(stateChangedCb).not.toBeNull()

    // Drain the initial getDiagnosticsState().then() microtask so it does not
    // overwrite eventsRef after our manual stateChangedCb call below.
    await Promise.resolve()

    // Simulate a push from main: 2 pending events.
    stateChangedCb!({
      events: [
        makeEvent({ id: 'a', acknowledgedAt: null }),
        makeEvent({ id: 'b', acknowledgedAt: null }),
      ],
    })
    expect(pendingCount.value).toBe(2)

    // Simulate acknowledge of one.
    stateChangedCb!({
      events: [
        makeEvent({ id: 'a', acknowledgedAt: new Date().toISOString() }),
        makeEvent({ id: 'b', acknowledgedAt: null }),
      ],
    })
    expect(pendingCount.value).toBe(1)
  })

  it('acknowledge(id) invokes IPC with the correct id', async () => {
    const mockApi = installMockApi()
    const { acknowledge } = useDiagnostics()

    await acknowledge('evt-99')

    expect(mockApi.acknowledgeDiagnostics).toHaveBeenCalledWith('evt-99')
  })

  it('cleanup() unsubscribes from state changes', () => {
    installMockApi()
    const { cleanup } = useDiagnostics()

    expect(stateChangedCb).not.toBeNull()

    cleanup()

    // The unsubscribe fn in the mock sets stateChangedCb to null.
    expect(stateChangedCb).toBeNull()
  })
})
