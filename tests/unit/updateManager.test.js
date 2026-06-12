/**
 * UpdateManager — verifies the main-process is the single source of truth for
 * in-app auto-update state and that electron-updater events fan out to the
 * renderer as the documented IPC broadcasts.
 *
 * The suite drives a fake updater (an EventEmitter exposing the autoUpdater
 * surface) so it can exercise the full update-available -> downloading ->
 * downloaded flow, plus error and quit-and-install paths, without a real
 * app-update.yml feed.
 *
 * Load-bearing invariants asserted here:
 *   - check-on-launch / on-demand check are gated by isPackaged (no real
 *     network call in dev/test).
 *   - every updater event produces the correct one-off broadcast AND a full
 *     STATE_CHANGED snapshot, and getUpdateState() reflects the transition.
 *   - quitAndInstall tears down overlays (prepareForInstall) BEFORE the
 *     updater relaunches — the transparent frameless surface must not survive
 *     into the installer paint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ─── Electron mock ──────────────────────────────────────────────────────────
//
// Each registered ipcMain handler/listener is captured so the suite can invoke
// the real handler bodies. BrowserWindow.getAllWindows returns two live
// renderer windows so broadcast fan-out (and the isDestroyed skip) is observed
// against more than one target.

const ipcHandlers = new Map();
const ipcListeners = new Map();

const liveWin = () => ({
  isDestroyed: vi.fn(() => false),
  webContents: { send: vi.fn() },
});

let windows = [];

vi.mock('electron', () => ({
  app: { isPackaged: false },
  shell: { openExternal: vi.fn() },
  BrowserWindow: { getAllWindows: vi.fn(() => windows) },
  ipcMain: {
    handle: vi.fn((channel, fn) => ipcHandlers.set(channel, fn)),
    on: vi.fn((channel, fn) => ipcListeners.set(channel, fn)),
    removeHandler: vi.fn((channel) => ipcHandlers.delete(channel)),
    removeAllListeners: vi.fn((channel) => ipcListeners.delete(channel)),
  },
}));

// electron-updater is only the default; every test injects a fake updater, so
// the real module never drives behaviour. Mock it so importing the subject
// never reaches into the actual package.
vi.mock('electron-updater', () => ({
  default: { autoUpdater: new EventEmitter() },
}));

import { initUpdateManager, getUpdateState, isPortableBuild, isNotifyOnlyPlatform } from '../../electron/update-manager.js';
import { UPDATE } from '../../electron/ipc-channels.js';

// ─── Fake updater ─────────────────────────────────────────────────────────────

/**
 * Build a fake autoUpdater: an EventEmitter with the methods the manager calls.
 * checkForUpdates / quitAndInstall are spies; quitAndInstall records call order
 * relative to prepareForInstall via the shared `order` array.
 */
function makeFakeUpdater(order) {
  const updater = new EventEmitter();
  updater.autoDownload = undefined;
  updater.autoInstallOnAppQuit = undefined;
  updater.checkForUpdates = vi.fn(() => Promise.resolve());
  updater.quitAndInstall = vi.fn(() => { if (order) order.push('quitAndInstall'); });
  return updater;
}

/** All STATE_CHANGED snapshots a window received, in order. */
function snapshotsFor(win) {
  return win.webContents.send.mock.calls
    .filter(([channel]) => channel === UPDATE.STATE_CHANGED)
    .map(([, payload]) => payload);
}

/** Payloads sent on a specific one-off channel to a window. */
function payloadsOn(win, channel) {
  return win.webContents.send.mock.calls
    .filter(([ch]) => ch === channel)
    .map(([, payload]) => payload);
}

beforeEach(() => {
  ipcHandlers.clear();
  ipcListeners.clear();
  windows = [liveWin(), liveWin()];
  // Portable detection reads this env; clear it so the default-path suites run
  // as a normal (installer) build regardless of the host environment.
  delete process.env.PORTABLE_EXECUTABLE_DIR;
  vi.clearAllMocks();
});

// ─── 1. isPackaged guard ──────────────────────────────────────────────────────

describe('check-on-launch guard (isPackaged)', () => {
  it('does NOT check for updates on init when unpackaged (dev/test)', () => {
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: false, updater, isPackaged: false, autoCheckEnabled: true });
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('checks for updates on init when packaged and auto-check is on', () => {
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: false, updater, isPackaged: true, autoCheckEnabled: true });
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('does NOT check on init when packaged but auto-check is off', () => {
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: false, updater, isPackaged: true, autoCheckEnabled: false });
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('sets autoDownload on and autoInstallOnAppQuit off (install is user-initiated)', () => {
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: false, updater, isPackaged: false });
    expect(updater.autoDownload).toBe(true);
    expect(updater.autoInstallOnAppQuit).toBe(false);
  });
});

// ─── 2 + 3. updater events -> broadcast + authoritative getUpdateState ─────────

describe('updater events fan out to renderer broadcasts and update authoritative state', () => {
  let updater;

  beforeEach(() => {
    updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: false, updater, isPackaged: false, autoCheckEnabled: true });
  });

  it('update-available -> UPDATE.AVAILABLE with version, STATE_CHANGED, state=available', () => {
    updater.emit('update-available', { version: '2.0.0' });

    for (const win of windows) {
      expect(payloadsOn(win, UPDATE.AVAILABLE)).toEqual([{ version: '2.0.0' }]);
      expect(snapshotsFor(win).at(-1)).toMatchObject({ status: 'available', version: '2.0.0' });
    }
    expect(getUpdateState()).toMatchObject({ status: 'available', version: '2.0.0', error: null });
  });

  it('download-progress -> UPDATE.DOWNLOAD_PROGRESS with rounded percent, state=downloading', () => {
    updater.emit('download-progress', { percent: 42.7 });

    for (const win of windows) {
      expect(payloadsOn(win, UPDATE.DOWNLOAD_PROGRESS)).toEqual([{ percent: 43 }]);
    }
    expect(getUpdateState()).toMatchObject({ status: 'downloading', percent: 43 });
  });

  it('update-downloaded -> UPDATE.DOWNLOADED with version, state=downloaded at 100%', () => {
    // version carried from the earlier available event when info omits it.
    updater.emit('update-available', { version: '2.0.0' });
    updater.emit('update-downloaded', {});

    for (const win of windows) {
      expect(payloadsOn(win, UPDATE.DOWNLOADED)).toEqual([{ version: '2.0.0' }]);
    }
    expect(getUpdateState()).toMatchObject({ status: 'downloaded', version: '2.0.0', percent: 100 });
  });

  it('checking-for-update -> state=checking and clears any prior error', () => {
    updater.emit('error', new Error('boom'));
    updater.emit('checking-for-update');
    expect(getUpdateState()).toMatchObject({ status: 'checking', error: null });
  });

  it('update-not-available -> state=not-available', () => {
    updater.emit('update-not-available');
    expect(getUpdateState()).toMatchObject({ status: 'not-available', version: null });
  });

  it('error -> state=error carrying the message, and does not throw', () => {
    expect(() => updater.emit('error', new Error('feed unreachable'))).not.toThrow();
    expect(getUpdateState()).toMatchObject({ status: 'error', error: 'feed unreachable' });
    // an error still pushes a full snapshot so the renderer can reflect it.
    expect(snapshotsFor(windows[0]).at(-1)).toMatchObject({ status: 'error', error: 'feed unreachable' });
  });

  it('skips destroyed windows when broadcasting', () => {
    windows[0].isDestroyed = vi.fn(() => true);
    updater.emit('update-available', { version: '3.1.4' });
    expect(windows[0].webContents.send).not.toHaveBeenCalled();
    expect(payloadsOn(windows[1], UPDATE.AVAILABLE)).toEqual([{ version: '3.1.4' }]);
  });

  it('reflects the full available -> downloading -> downloaded progression in state', () => {
    updater.emit('update-available', { version: '2.5.0' });
    expect(getUpdateState().status).toBe('available');
    updater.emit('download-progress', { percent: 10 });
    expect(getUpdateState()).toMatchObject({ status: 'downloading', percent: 10 });
    updater.emit('download-progress', { percent: 99.9 });
    expect(getUpdateState()).toMatchObject({ status: 'downloading', percent: 100 });
    updater.emit('update-downloaded', { version: '2.5.0' });
    expect(getUpdateState()).toMatchObject({ status: 'downloaded', percent: 100, version: '2.5.0' });
  });
});

// ─── 4. auto-check toggle persistence ──────────────────────────────────────────

describe('auto-check toggle persistence (UPDATE.SET_AUTO_CHECK)', () => {
  it('persists the toggle with the coerced boolean and updates state', async () => {
    const persistAutoCheck = vi.fn();
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: false, updater, isPackaged: true, autoCheckEnabled: true, persistAutoCheck });

    const handler = ipcHandlers.get(UPDATE.SET_AUTO_CHECK);
    expect(handler).toBeTypeOf('function');

    const result = await handler({}, false);
    expect(persistAutoCheck).toHaveBeenCalledWith(false);
    expect(result).toMatchObject({ autoCheckEnabled: false });
    expect(getUpdateState().autoCheckEnabled).toBe(false);
  });

  it('coerces a truthy non-boolean to true when persisting', async () => {
    const persistAutoCheck = vi.fn();
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: false, updater, isPackaged: true, autoCheckEnabled: false, persistAutoCheck });

    await ipcHandlers.get(UPDATE.SET_AUTO_CHECK)({}, 1);
    expect(persistAutoCheck).toHaveBeenCalledWith(true);
  });

  it('toggling does not itself trigger a fresh update check', async () => {
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: false, updater, isPackaged: true, autoCheckEnabled: false });
    // init did not check (auto-check off); enabling the toggle must not schedule one either.
    await ipcHandlers.get(UPDATE.SET_AUTO_CHECK)({}, true);
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });
});

// ─── On-demand check (UPDATE.CHECK) ─────────────────────────────────────────────

describe('on-demand check (UPDATE.CHECK)', () => {
  it('is a no-op returning current state when unpackaged', async () => {
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: false, updater, isPackaged: false });
    const result = await ipcHandlers.get(UPDATE.CHECK)();
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'idle' });
  });

  it('invokes the updater and returns state when packaged', async () => {
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: false, updater, isPackaged: true, autoCheckEnabled: false });
    await ipcHandlers.get(UPDATE.CHECK)();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it('surfaces a check failure as error state instead of rejecting', async () => {
    const updater = makeFakeUpdater();
    updater.checkForUpdates = vi.fn(() => Promise.reject(new Error('no feed')));
    initUpdateManager({ notifyOnly: false, updater, isPackaged: true, autoCheckEnabled: false });
    const result = await ipcHandlers.get(UPDATE.CHECK)();
    expect(result).toMatchObject({ status: 'error', error: 'no feed' });
  });
});

// ─── 5. quitAndInstall teardown ordering ───────────────────────────────────────

describe('quit-and-install teardown ordering (UPDATE.QUIT_AND_INSTALL)', () => {
  it('tears down overlays (prepareForInstall) BEFORE quitAndInstall', () => {
    const order = [];
    const prepareForInstall = vi.fn(() => order.push('prepareForInstall'));
    const updater = makeFakeUpdater(order);
    initUpdateManager({ notifyOnly: false, updater, isPackaged: true, autoCheckEnabled: false, prepareForInstall });

    // Reach the downloaded state — quit-and-install only acts once ready.
    updater.emit('update-downloaded', { version: '4.0.0' });

    const listener = ipcListeners.get(UPDATE.QUIT_AND_INSTALL);
    expect(listener).toBeTypeOf('function');
    listener();

    expect(order).toEqual(['prepareForInstall', 'quitAndInstall']);
  });

  it('does nothing if the update is not yet downloaded', () => {
    const prepareForInstall = vi.fn();
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: false, updater, isPackaged: true, autoCheckEnabled: false, prepareForInstall });

    updater.emit('update-available', { version: '4.0.0' }); // available, not downloaded
    ipcListeners.get(UPDATE.QUIT_AND_INSTALL)();

    expect(prepareForInstall).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
});

// ─── 6. IPC handler registration ────────────────────────────────────────────────

describe('IPC handler registration', () => {
  beforeEach(() => {
    initUpdateManager({ notifyOnly: false, updater: makeFakeUpdater(), isPackaged: false });
  });

  it('registers invoke handlers for GET_STATE, CHECK, SET_AUTO_CHECK', () => {
    expect(ipcHandlers.has(UPDATE.GET_STATE)).toBe(true);
    expect(ipcHandlers.has(UPDATE.CHECK)).toBe(true);
    expect(ipcHandlers.has(UPDATE.SET_AUTO_CHECK)).toBe(true);
  });

  it('registers a one-way listener for QUIT_AND_INSTALL', () => {
    expect(ipcListeners.has(UPDATE.QUIT_AND_INSTALL)).toBe(true);
  });

  it('registers a one-way listener for OPEN_DOWNLOAD_PAGE', () => {
    expect(ipcListeners.has(UPDATE.OPEN_DOWNLOAD_PAGE)).toBe(true);
  });

  it('GET_STATE returns a defensive copy (renderer cannot mutate authoritative state)', () => {
    const snapshot = ipcHandlers.get(UPDATE.GET_STATE)();
    snapshot.status = 'tampered';
    expect(getUpdateState().status).not.toBe('tampered');
  });
});

// ─── 7. Portable build detection ────────────────────────────────────────────────

describe('isPortableBuild', () => {
  it('is true only when PORTABLE_EXECUTABLE_DIR is a non-empty string', () => {
    expect(isPortableBuild({ PORTABLE_EXECUTABLE_DIR: 'C:/temp/portable' })).toBe(true);
    expect(isPortableBuild({ PORTABLE_EXECUTABLE_DIR: '' })).toBe(false);
    expect(isPortableBuild({})).toBe(false);
  });

  it('reads process.env by default', () => {
    delete process.env.PORTABLE_EXECUTABLE_DIR;
    expect(isPortableBuild()).toBe(false);
    process.env.PORTABLE_EXECUTABLE_DIR = 'C:/temp/portable';
    expect(isPortableBuild()).toBe(true);
    delete process.env.PORTABLE_EXECUTABLE_DIR;
  });
});

// ─── 8. Portable runtime skips the updater entirely ─────────────────────────────

describe('portable build skips the updater (no uninstallable download)', () => {
  it('does NOT check for updates on init, even when packaged + auto-check on', () => {
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: false, updater, isPackaged: true, autoCheckEnabled: true, portable: true });
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('does NOT wire updater events or enable autoDownload', () => {
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: false, updater, isPackaged: true, autoCheckEnabled: true, portable: true });
    // No listeners attached, so an emitted update-available cannot mutate state.
    expect(updater.listenerCount('update-available')).toBe(0);
    updater.emit('update-available', { version: '9.9.9' });
    expect(getUpdateState().status).toBe('idle');
    expect(updater.autoDownload).toBe(undefined);
  });

  it('does NOT register CHECK / SET_AUTO_CHECK / QUIT_AND_INSTALL', () => {
    initUpdateManager({ notifyOnly: false, updater: makeFakeUpdater(), isPackaged: true, portable: true });
    expect(ipcHandlers.has(UPDATE.CHECK)).toBe(false);
    expect(ipcHandlers.has(UPDATE.SET_AUTO_CHECK)).toBe(false);
    expect(ipcListeners.has(UPDATE.QUIT_AND_INSTALL)).toBe(false);
    expect(ipcListeners.has(UPDATE.OPEN_DOWNLOAD_PAGE)).toBe(false);
  });

  it('still registers GET_STATE and reports supported:false', () => {
    initUpdateManager({ notifyOnly: false, updater: makeFakeUpdater(), isPackaged: true, portable: true });
    expect(ipcHandlers.has(UPDATE.GET_STATE)).toBe(true);
    expect(getUpdateState().supported).toBe(false);
    expect(ipcHandlers.get(UPDATE.GET_STATE)()).toMatchObject({ supported: false });
  });

  it('reports supported:true on a normal (non-portable) build', () => {
    initUpdateManager({ notifyOnly: false, updater: makeFakeUpdater(), isPackaged: true, portable: false });
    expect(getUpdateState().supported).toBe(true);
  });
});

// ─── 9. Re-entrancy: a second init must not throw or leak handlers ───────────────

describe('re-entrant initUpdateManager is idempotent (no duplicate-handler throw)', () => {
  it('removes prior IPC handlers before re-registering, so a second init does not throw', async () => {
    // A real ipcMain.handle throws when a channel is already registered; the
    // mock tolerates re-set, so assert removeHandler is invoked per channel and
    // the second init completes without throwing.
    initUpdateManager({ notifyOnly: false, updater: makeFakeUpdater(), isPackaged: true, autoCheckEnabled: false });
    const { ipcMain } = await import('electron');
    ipcMain.removeHandler.mockClear();

    expect(() =>
      initUpdateManager({ notifyOnly: false, updater: makeFakeUpdater(), isPackaged: true, autoCheckEnabled: false }),
    ).not.toThrow();

    for (const channel of [UPDATE.GET_STATE, UPDATE.CHECK, UPDATE.SET_AUTO_CHECK]) {
      expect(ipcMain.removeHandler).toHaveBeenCalledWith(channel);
    }
    expect(ipcMain.removeAllListeners).toHaveBeenCalledWith(UPDATE.QUIT_AND_INSTALL);
    expect(ipcMain.removeAllListeners).toHaveBeenCalledWith(UPDATE.OPEN_DOWNLOAD_PAGE);
  });

  it('does not leak duplicate updater listeners across re-inits (events fire once)', () => {
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: false, updater, isPackaged: false });
    initUpdateManager({ notifyOnly: false, updater, isPackaged: false });

    expect(updater.listenerCount('update-available')).toBe(1);

    updater.emit('update-available', { version: '5.0.0' });
    // A single AVAILABLE broadcast per window proves listeners were not stacked.
    for (const win of windows) {
      expect(payloadsOn(win, UPDATE.AVAILABLE)).toEqual([{ version: '5.0.0' }]);
    }
  });

  it('a second init still produces a working handler set', () => {
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: false, updater, isPackaged: true, autoCheckEnabled: false });
    initUpdateManager({ notifyOnly: false, updater, isPackaged: true, autoCheckEnabled: false });
    expect(ipcHandlers.has(UPDATE.GET_STATE)).toBe(true);
    expect(ipcHandlers.has(UPDATE.CHECK)).toBe(true);
    expect(ipcListeners.has(UPDATE.QUIT_AND_INSTALL)).toBe(true);
  });
});

// ─── 10. Notify-only platform (unsigned macOS) ──────────────────────────────────

describe('notify-only platform: no in-place install, link to the download page', () => {
  it('isNotifyOnlyPlatform is true only on darwin', () => {
    expect(isNotifyOnlyPlatform('darwin')).toBe(true);
    expect(isNotifyOnlyPlatform('win32')).toBe(false);
    expect(isNotifyOnlyPlatform('linux')).toBe(false);
  });

  it('disables autoDownload and reports notifyOnly:true with updates still supported', () => {
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: true, updater, isPackaged: true, autoCheckEnabled: false });
    expect(updater.autoDownload).toBe(false);
    expect(getUpdateState()).toMatchObject({ notifyOnly: true, supported: true });
  });

  it('reports notifyOnly:false on full-flow platforms', () => {
    initUpdateManager({ notifyOnly: false, updater: makeFakeUpdater(), isPackaged: true, autoCheckEnabled: false });
    expect(getUpdateState().notifyOnly).toBe(false);
  });

  it('still checks the feed: launch auto-check and on-demand CHECK run', async () => {
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: true, updater, isPackaged: true, autoCheckEnabled: true });
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    await ipcHandlers.get(UPDATE.CHECK)();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
  });

  it('update-available is terminal: broadcast carries the version, snapshot has notifyOnly', () => {
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: true, updater, isPackaged: false });
    updater.emit('update-available', { version: '2.0.0' });
    for (const win of windows) {
      expect(payloadsOn(win, UPDATE.AVAILABLE)).toEqual([{ version: '2.0.0' }]);
      expect(snapshotsFor(win).at(-1)).toMatchObject({ status: 'available', notifyOnly: true });
    }
    expect(getUpdateState()).toMatchObject({ status: 'available', version: '2.0.0' });
  });

  it('OPEN_DOWNLOAD_PAGE opens the GitHub Releases page externally', () => {
    const openExternal = vi.fn();
    initUpdateManager({ notifyOnly: true, updater: makeFakeUpdater(), isPackaged: true, openExternal });
    ipcListeners.get(UPDATE.OPEN_DOWNLOAD_PAGE)();
    expect(openExternal).toHaveBeenCalledWith('https://github.com/openpen-platform/openpen/releases/latest');
  });

  it('QUIT_AND_INSTALL stays guarded: never installs from the available state', () => {
    const updater = makeFakeUpdater();
    initUpdateManager({ notifyOnly: true, updater, isPackaged: true, autoCheckEnabled: false });
    updater.emit('update-available', { version: '2.0.0' });
    ipcListeners.get(UPDATE.QUIT_AND_INSTALL)();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
});
