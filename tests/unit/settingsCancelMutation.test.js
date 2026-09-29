/**
 * Verifies that clicking Cancel in SettingsView never mutates settings.
 *
 * Scenario: open Settings with enableDragAutoSnap=true, do NOT touch any
 * control, click Cancel. previewSettings must never be called with
 * enableDragAutoSnap=false, and the draft watcher must be gated for the
 * entire cancel sequence so an async revert cannot race with a fire-and-
 * forget preview IPC.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import en from '../../src/i18n/en';

// ── Module mocks ──────────────────────────────────────────────────────────────

vi.mock('../../src/services/config-bridge', () => ({
  getAppConfig: () => ({
    ui: {
      settingsWindow: { opacity: 0.92 },
    },
  }),
}));

vi.mock('../../src/services/plugin-registry', () => ({
  pluginSettingsTabs: { value: [] },
}));

// bootstrap / module-loader are heavy and irrelevant to this flow.
vi.mock('../../src/core/runtime/bootstrap', () => ({
  initModuleRuntime: vi.fn().mockResolvedValue(undefined),
  cleanupModuleRuntime: vi.fn(),
  usePluginConflicts: vi.fn(() => ({ value: [] })),
}));

// ── i18n ──────────────────────────────────────────────────────────────────────

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: { en },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build a window.openPenApi mock.
 * @param {object} settingsOverride  Key/value pairs merged into DEFAULT_SETTINGS.
 */
function makeApi(settingsOverride = {}) {
  const defaultSettings = {
    theme: 'system',
    language: 'en',
    enableDragAutoSnap: true,
    barLayout: 'horizontal',
    autoCollapseDelay: 3000,
    ballOpacity: 0.85,
    defaultColor: '#818CF8',
    reducedMotion: false,
    notifyOnDrawingMode: true,
    notificationPosition: 'top-center',
    confirmBeforeClearCanvas: true,
    disabledModules: [],
    pluginIdConflictResolutions: {},
    effectiveTheme: 'dark',
    ...settingsOverride,
  };

  const api = {
    getSettings: vi.fn().mockResolvedValue({ ...defaultSettings }),
    previewSettings: vi.fn(),
    revertSettings: vi.fn().mockResolvedValue({ ...defaultSettings }),
    updateSettings: vi.fn().mockResolvedValue({ ...defaultSettings }),
    closeSettingsWindow: vi.fn(),
    signalContentReady: vi.fn(),
    getLocale: vi.fn().mockResolvedValue('en'),
    onSettingsUpdated: vi.fn().mockReturnValue(() => {}),
    onLocaleChange: vi.fn().mockReturnValue(() => {}),
  };
  return api;
}

// ── Fixture loader ────────────────────────────────────────────────────────────

async function mountSettingsView(api) {
  window.openPenApi = api;

  // Lazy import so the vi.mock calls above are in place before the module loads.
  const { default: SettingsView } = await import('../../src/views/SettingsView.vue');

  const wrapper = mount(SettingsView, {
    global: { plugins: [i18n] },
    attachTo: document.body,
  });

  // Let all async onMounted work (loadSettings IPC round-trip, nextTick gate).
  await flushPromises();

  return wrapper;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('SettingsView cancel → no enableDragAutoSnap mutation', () => {
  afterEach(() => {
    delete window.openPenApi;
    vi.resetModules();
  });

  it('does not call previewSettings at all when no control is touched', async () => {
    const api = makeApi({ enableDragAutoSnap: true });
    const wrapper = await mountSettingsView(api);

    // User opens settings window and immediately clicks Cancel without interaction.
    await wrapper.find('[data-testid="cancel-btn"]').trigger('click');
    await flushPromises();

    // The watcher must have been fully gated — no preview sent.
    expect(api.previewSettings).not.toHaveBeenCalled();
  });

  it('never sends previewSettings with enableDragAutoSnap=false before revert', async () => {
    const api = makeApi({ enableDragAutoSnap: true });
    const wrapper = await mountSettingsView(api);

    await wrapper.find('[data-testid="cancel-btn"]').trigger('click');
    await flushPromises();

    const falseSnapCalls = api.previewSettings.mock.calls.filter(
      ([patch]) => patch !== null && typeof patch === 'object' && patch.enableDragAutoSnap === false,
    );
    expect(falseSnapCalls).toHaveLength(0);
  });

  it('calls revertSettings exactly once on Cancel', async () => {
    const api = makeApi({ enableDragAutoSnap: true });
    const wrapper = await mountSettingsView(api);

    await wrapper.find('[data-testid="cancel-btn"]').trigger('click');
    await flushPromises();

    expect(api.revertSettings).toHaveBeenCalledOnce();
  });

  it('calls closeSettingsWindow after revertSettings on Cancel', async () => {
    const api = makeApi({ enableDragAutoSnap: true });
    const wrapper = await mountSettingsView(api);

    await wrapper.find('[data-testid="cancel-btn"]').trigger('click');
    await flushPromises();

    // Ordering: revert must complete before close.
    const revertOrder = api.revertSettings.mock.invocationCallOrder[0];
    const closeOrder = api.closeSettingsWindow.mock.invocationCallOrder[0];
    expect(revertOrder).toBeLessThan(closeOrder);
  });

  it('does not send previewSettings with false snap after any initial load previews', async () => {
    const api = makeApi({ enableDragAutoSnap: true });
    const wrapper = await mountSettingsView(api);

    // Record all previewSettings calls at this baseline (before cancel).
    const callsBefore = api.previewSettings.mock.calls.length;

    await wrapper.find('[data-testid="cancel-btn"]').trigger('click');
    await flushPromises();

    // No new calls with enableDragAutoSnap=false should appear after cancel.
    const newCalls = api.previewSettings.mock.calls.slice(callsBefore);
    const badCalls = newCalls.filter(
      ([patch]) => patch !== null && typeof patch === 'object' && patch.enableDragAutoSnap === false,
    );
    expect(badCalls).toHaveLength(0);
  });

  it('initialises draft with DEFAULT_SETTINGS so child :model-value bindings are never undefined', async () => {
    // Defer the getSettings IPC indefinitely. If draft were initialised as {},
    // every `draft.<key>` would be undefined during the entire pending-IPC
    // window — exactly the gap that lets a child wrapper emit (timing-
    // dependent on the runtime, e.g. Win-only) write back a fallback value.
    let releaseGetSettings;
    const getSettingsPromise = new Promise((resolve) => { releaseGetSettings = resolve; });
    const api = makeApi();
    api.getSettings = vi.fn().mockReturnValue(getSettingsPromise);

    window.openPenApi = api;
    const { default: SettingsView } = await import('../../src/views/SettingsView.vue');
    const wrapper = mount(SettingsView, {
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
    await flushPromises();

    const draftRef = wrapper.vm?.$?.setupState?.draft ?? null;
    expect(draftRef).not.toBeNull();
    // draft must hold defined defaults during the entire pending-IPC window
    // so child :model-value bindings never see undefined.
    expect(draftRef.enableDragAutoSnap).toBe(true);
    expect(draftRef.barLayout).toBe('horizontal');
    expect(draftRef.theme).toBe('system');
    expect(draftRef.ballOpacity).toBe(0.85);
    expect(draftRef.confirmBeforeClearCanvas).toBe(true);
    expect(draftRef.notifyOnDrawingMode).toBe(true);
    expect(draftRef.notificationPosition).toBe('top-center');
    expect(draftRef.reducedMotion).toBe(false);

    releaseGetSettings({ enableDragAutoSnap: true });
    await flushPromises();
  });

  it('watcher gate is disabled during cancel to block concurrent preview sends', async () => {
    const api = makeApi({ enableDragAutoSnap: true });
    window.openPenApi = api;

    const { default: SettingsView } = await import('../../src/views/SettingsView.vue');
    const wrapper = mount(SettingsView, {
      global: { plugins: [i18n] },
      attachTo: document.body,
    });
    await flushPromises();

    // Capture the reactive draft object directly from the component's setup state.
    const vm = wrapper.vm;
    const draftRef = vm?.$?.setupState?.draft ?? null;

    // Verify draft is accessible and populated before the race test proceeds.
    expect(draftRef).not.toBeNull();
    expect(draftRef.enableDragAutoSnap).toBe(true);

    // Simulate a race where revertSettings is awaited in handleCancel and a
    // mid-await draft mutation arrives. If the watcher gate is still armed,
    // it would fire previewSettings({enableDragAutoSnap: false}). The gate
    // must be disarmed before the await for cancel to be safe.
    api.revertSettings = vi.fn().mockImplementation(async () => {
      // Mutate draft.enableDragAutoSnap=false mid-await (simulates the race).
      draftRef.enableDragAutoSnap = false;
      // Flush the Vue watcher queue so the watcher runs synchronously here.
      // If the gate is true, this triggers previewSettings({enableDragAutoSnap:false}).
      await flushPromises();
      return { enableDragAutoSnap: true };
    });

    await wrapper.find('[data-testid="cancel-btn"]').trigger('click');
    await flushPromises();

    // The gate must have been false during the entire cancel. No false snap call.
    const badCalls = api.previewSettings.mock.calls.filter(
      ([patch]) => patch !== null && typeof patch === 'object' && patch.enableDragAutoSnap === false,
    );
    expect(badCalls).toHaveLength(0);
  });
});
