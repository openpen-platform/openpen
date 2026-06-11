import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { ref, readonly } from 'vue'
import en from '../../src/i18n/en'
import DiagnosticsTab from '../../src/components/settings/DiagnosticsTab.vue'

// ── i18n setup ────────────────────────────────────────────────────────────────

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
})

// ── helpers ──────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<DiagnosticsEvent> = {}): DiagnosticsEvent {
  return {
    id: 'evt-1',
    layer: 'L1',
    backupPath: '/backup/test.bak',
    detectedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
    acknowledgedAt: null,
    ...overrides,
  }
}

// ── mock useDiagnostics composable ────────────────────────────────────────────

const mockAcknowledge = vi.fn().mockResolvedValue(undefined)
const mockOpenBackupDir = vi.fn().mockResolvedValue(undefined)

vi.mock('../../src/composables/useDiagnostics', () => ({
  useDiagnostics: vi.fn(),
}))

import { useDiagnostics } from '../../src/composables/useDiagnostics'

function mountTab(events: DiagnosticsEvent[]) {
  const eventsRef = ref<readonly DiagnosticsEvent[]>(events)
  const pendingCount = readonly(ref(events.filter((e) => e.acknowledgedAt === null).length))

  ;(useDiagnostics as ReturnType<typeof vi.fn>).mockReturnValue({
    events: readonly(eventsRef),
    pendingCount,
    acknowledge: mockAcknowledge,
    openBackupDir: mockOpenBackupDir,
    cleanup: vi.fn(),
  })

  return mount(DiagnosticsTab, {
    global: { plugins: [i18n] },
  })
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('DiagnosticsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Stub clipboard API.
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('renders the empty state when no events exist', () => {
    const wrapper = mountTab([])
    expect(wrapper.text()).toContain('No issues detected.')
    expect(wrapper.find('[data-testid="diag-list"]').exists()).toBe(false)
  })

  it('renders one row per event', () => {
    const events = [
      makeEvent({ id: 'e1' }),
      makeEvent({ id: 'e2', layer: 'L2', acknowledgedAt: new Date().toISOString() }),
    ]
    const wrapper = mountTab(events)
    expect(wrapper.findAll('[data-testid="diag-row"]')).toHaveLength(2)
    expect(wrapper.find('[data-testid="diag-empty"]').exists()).toBe(false)
  })

  it('shows the Acknowledge button only for pending events', () => {
    const pending = makeEvent({ id: 'p1', acknowledgedAt: null })
    const acked = makeEvent({ id: 'p2', acknowledgedAt: new Date().toISOString() })
    const wrapper = mountTab([pending, acked])

    const ackBtns = wrapper.findAll('[data-testid="diag-ack-btn"]')
    expect(ackBtns).toHaveLength(1)

    const ackedLabels = wrapper.findAll('[data-testid="diag-acked-label"]')
    expect(ackedLabels).toHaveLength(1)
  })

  it('calls acknowledge with the correct id when Acknowledge is clicked', async () => {
    const wrapper = mountTab([makeEvent({ id: 'target-id', acknowledgedAt: null })])
    await wrapper.find('[data-testid="diag-ack-btn"]').trigger('click')
    await flushPromises()
    expect(mockAcknowledge).toHaveBeenCalledWith('target-id')
  })

  it('shows layer label text in the chip', () => {
    const wrapper = mountTab([makeEvent({ layer: 'L1' })])
    expect(wrapper.find('[data-testid="diag-layer-chip"]').text()).toContain('Settings file failed to parse')
  })

  it('disables Open backups folder button when events list is empty', () => {
    const wrapper = mountTab([])
    const btn = wrapper.find('[data-testid="diag-open-btn"]')
    expect((btn.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('enables Open backups folder button when events exist', () => {
    const wrapper = mountTab([makeEvent()])
    const btn = wrapper.find('[data-testid="diag-open-btn"]')
    expect((btn.element as HTMLButtonElement).disabled).toBe(false)
  })
})
