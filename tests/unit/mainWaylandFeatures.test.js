/**
 * Chromium feature flags the main process sets before app ready on a Wayland
 * session. `enable-features` is a single switch: appending it twice makes the
 * second value overwrite the first, so both features must arrive in one call.
 *
 * main.js is imported with every collaborator mocked and app.whenReady() left
 * pending, so only the module-load-time switch setup runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.hoisted(() => {
  process.env.XDG_SESSION_TYPE = 'wayland';
});

const appendSwitch = vi.fn();

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    on: vi.fn(),
    setPath: vi.fn(),
    getVersion: vi.fn(() => '0.0.0'),
    requestSingleInstanceLock: vi.fn(() => true),
    disableHardwareAcceleration: vi.fn(),
    whenReady: vi.fn(() => new Promise(() => {})),
    commandLine: { appendSwitch: (...args) => appendSwitch(...args) },
  },
  BrowserWindow: { getAllWindows: vi.fn(() => []) },
  ipcMain: { on: vi.fn(), handle: vi.fn() },
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
  net: { fetch: vi.fn() },
  session: {},
  screen: { getAllDisplays: vi.fn(() => []), on: vi.fn() },
}));

vi.mock('../../electron/window-manager.js', () => ({
  initWindowManager: vi.fn(),
  createMainWindowForDisplay: vi.fn(),
  createOverlayWindowForDisplay: vi.fn(),
  showMainWindow: vi.fn(),
  hideMainWindow: vi.fn(),
  toggleControlsHidden: vi.fn(),
  createSettingsWindow: vi.fn(),
  toggleDrawingMode: vi.fn(),
  getMainWindow: vi.fn(),
  getOverlayWindow: vi.fn(),
  getAllMainWindows: vi.fn(() => []),
  getAllOverlayWindows: vi.fn(() => []),
  setActiveDisplayId: vi.fn(),
  setDrawingModeChangedListener: vi.fn(),
  setBarHiddenChangedListener: vi.fn(),
  applyLinuxWindowPositioning: vi.fn(),
  destroyAllWindowsForUpdate: vi.fn(),
}));
vi.mock('../../electron/tray-manager.js', () => ({
  initTrayManager: vi.fn(),
  setTrayWarning: vi.fn(),
  setTrayDrawingMode: vi.fn(),
  setTrayBarHidden: vi.fn(),
}));
vi.mock('../../electron/shortcut-manager.js', () => ({
  initShortcutManager: vi.fn(),
  unregisterAllShortcuts: vi.fn(),
  onShortcutsSuspendChange: vi.fn(),
}));
vi.mock('../../electron/settings-store.js', () => ({
  initSettingsStore: vi.fn(),
  getSetting: vi.fn(),
  updateSettings: vi.fn(),
  flushWrites: vi.fn(),
}));
vi.mock('../../electron/diagnostics-manager.js', () => ({ initDiagnosticsManager: vi.fn() }));
vi.mock('../../electron/update-manager.js', () => ({ initUpdateManager: vi.fn() }));
vi.mock('../../electron/plugin-meta-manager.js', () => ({ initPluginMetaManager: vi.fn() }));
vi.mock('../../electron/i18n/index.js', () => ({ initI18n: vi.fn() }));
vi.mock('../../electron/config-loader.js', () => ({ initConfigLoader: vi.fn(), getAppConfig: vi.fn() }));
vi.mock('../../electron/module-manifest-loader.js', () => ({
  initModuleManifestLoader: vi.fn(),
  sendModuleManifests: vi.fn(),
  resolvePluginFilePath: vi.fn(),
}));
vi.mock('../../electron/plugin-manager-bridge.js', () => ({ initPluginManagerBridge: vi.fn() }));
vi.mock('../../electron/audit-log.js', () => ({ createAuditLog: vi.fn() }));
vi.mock('../../electron/logger.js', () => ({
  initLogger: vi.fn(),
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../electron/positioning-engine.js', () => ({
  initPositioningEngine: vi.fn(),
  processIntent: vi.fn(),
  getState: vi.fn(),
}));
vi.mock('../../electron/transparent-render-probe.js', () => ({ probeTransparentRendering: vi.fn() }));
vi.mock('../../electron/renderer-ready-watchdog.js', () => ({
  createRendererReadyWatchdog: vi.fn(),
  resolveTimeoutMs: vi.fn(),
}));

const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

describe('main process Wayland switches', () => {
  beforeEach(() => {
    vi.resetModules();
    appendSwitch.mockClear();
    Object.defineProperty(process, 'platform', { value: 'linux' });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', realPlatform);
  });

  it('AC-11 on a Wayland session enable-features is set once and carries both UseOzonePlatform and GlobalShortcutsPortal', async () => {
    await import('../../electron/main.js');

    const enableFeatures = appendSwitch.mock.calls.filter(([name]) => name === 'enable-features');
    expect(enableFeatures).toHaveLength(1);
    const features = String(enableFeatures[0][1]).split(',');
    expect(features).toContain('UseOzonePlatform');
    expect(features).toContain('GlobalShortcutsPortal');
  });
});
