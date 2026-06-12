/**
 * UpdateManager — in-app auto-update over GitHub Releases.
 *
 * Wraps electron-updater's autoUpdater. The main process is the single source
 * of truth for update state (checking / available / downloading / downloaded /
 * error + the target version); the renderer only renders snapshots pushed over
 * IPC and issues intents (check, set-auto-check, quit-and-install).
 *
 * Download is automatic once a newer version is found, but installation is
 * always user-initiated (quitAndInstall) so the app never restarts under the
 * user during a presentation.
 *
 * macOS runs in notify-only mode: Squirrel.Mac refuses to install updates into
 * an unsigned app, and the release pipeline ships unsigned mac builds (no
 * Apple Developer signing secrets). Auto-downloading there would end in a
 * guaranteed install failure on every launch, so mac only surfaces the newer
 * version and routes the user to the GitHub Releases download page.
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import electronUpdater from 'electron-updater';
import { UPDATE } from './ipc-channels.js';

const { autoUpdater } = electronUpdater;

/**
 * Detect a Windows portable (electron-builder `portable` target) runtime.
 *
 * A portable build is a single self-extracting .exe with no installer, so
 * electron-updater's quitAndInstall cannot apply a downloaded update there —
 * the user would download a payload that can never be installed. electron-builder
 * sets PORTABLE_EXECUTABLE_DIR in the process env only for portable runs, which
 * is the sole reliable in-process signal (app.isPackaged is still true).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isPortableBuild(env = process.env) {
  return typeof env.PORTABLE_EXECUTABLE_DIR === 'string' && env.PORTABLE_EXECUTABLE_DIR.length > 0;
}

/**
 * Detect a platform where updates are notify-only (no in-place install).
 *
 * macOS: Squirrel.Mac validates the running app's code signature before
 * installing, so unsigned builds can check the feed but never self-install.
 * Until Apple Developer signing secrets land in the release pipeline, mac
 * surfaces "update available" with a link to the Releases download page.
 * @param {NodeJS.Platform} [platform]
 * @returns {boolean}
 */
export function isNotifyOnlyPlatform(platform = process.platform) {
  return platform === 'darwin';
}

/** Where notify-only platforms send the user to grab the new build manually. */
const DOWNLOAD_PAGE_URL = 'https://github.com/openpen-platform/openpen/releases/latest';

/** IPC invoke channels this manager owns (handle-based, single handler each). */
const INVOKE_CHANNELS = [UPDATE.GET_STATE, UPDATE.CHECK, UPDATE.SET_AUTO_CHECK];
/** Updater events this manager subscribes to. */
const UPDATER_EVENTS = [
  'checking-for-update',
  'update-available',
  'update-not-available',
  'download-progress',
  'update-downloaded',
  'error',
];

/**
 * @typedef {'idle'|'checking'|'available'|'downloading'|'downloaded'|'not-available'|'error'} UpdateStatus
 * @typedef {{
 *   status: UpdateStatus;
 *   version: string | null;
 *   percent: number;
 *   error: string | null;
 *   autoCheckEnabled: boolean;
 *   supported: boolean;
 *   notifyOnly: boolean;
 * }} UpdateState
 */

/** @type {UpdateState} */
let state = {
  status: 'idle',
  version: null,
  percent: 0,
  error: null,
  autoCheckEnabled: true,
  supported: true,
  notifyOnly: false,
};

/**
 * Broadcast the current update state to every live renderer window.
 */
function broadcastState() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(UPDATE.STATE_CHANGED, { ...state });
    }
  }
}

/**
 * Send a one-off event channel in addition to the full STATE_CHANGED snapshot,
 * so a renderer can subscribe to a specific transition without diffing state.
 * @param {string} channel
 * @param {unknown} payload
 */
function broadcast(channel, payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

/**
 * @returns {UpdateState} A defensive copy of the current state.
 */
export function getUpdateState() {
  return { ...state };
}

/**
 * Initialise the update manager.
 *
 * @param {object} [deps]
 * @param {boolean} [deps.autoCheckEnabled] Whether to check on launch.
 * @param {(enabled: boolean) => void} [deps.persistAutoCheck] Persist the toggle (settings-store).
 * @param {() => void} [deps.prepareForInstall] Tear down transparent overlays before relaunch.
 * @param {typeof autoUpdater} [deps.updater] Injectable for tests; defaults to electron-updater's autoUpdater.
 * @param {boolean} [deps.isPackaged] Override packaged detection (tests); defaults to app.isPackaged.
 * @param {boolean} [deps.portable] Override portable detection (tests); defaults to isPortableBuild().
 * @param {boolean} [deps.notifyOnly] Override notify-only detection (tests); defaults to isNotifyOnlyPlatform().
 * @param {(url: string) => void} [deps.openExternal] Injectable for tests; defaults to shell.openExternal.
 */
export function initUpdateManager(deps = {}) {
  const {
    autoCheckEnabled = true,
    persistAutoCheck,
    prepareForInstall,
    updater = autoUpdater,
    isPackaged = app.isPackaged,
    portable = isPortableBuild(),
    notifyOnly = isNotifyOnlyPlatform(),
    openExternal = (url) => shell.openExternal(url),
  } = deps;

  state = {
    status: 'idle',
    version: null,
    percent: 0,
    error: null,
    autoCheckEnabled,
    supported: !portable,
    notifyOnly,
  };

  // Re-entrancy guard: a second initUpdateManager call must not throw on
  // ipcMain.handle (duplicate channel) or leak duplicated updater listeners.
  // Tear down any prior registration before re-wiring.
  for (const channel of INVOKE_CHANNELS) ipcMain.removeHandler(channel);
  ipcMain.removeAllListeners(UPDATE.QUIT_AND_INSTALL);
  ipcMain.removeAllListeners(UPDATE.OPEN_DOWNLOAD_PAGE);
  for (const event of UPDATER_EVENTS) updater.removeAllListeners(event);

  // GET_STATE is registered unconditionally so the renderer (About tab) always
  // resolves to a clean snapshot — including on portable, where it learns the
  // feature is unsupported via state.supported === false.
  ipcMain.handle(UPDATE.GET_STATE, () => getUpdateState());

  // A portable .exe has no installer, so a downloaded update could never be
  // applied (quitAndInstall is a no-op/throws). Don't wire updater events,
  // don't register check/install IPC, and never auto-check — the renderer sees
  // supported:false and hides the update controls.
  if (portable) return;

  // Installation is user-initiated; the updater must not silently relaunch.
  // On notify-only platforms the download is suppressed entirely — the payload
  // could never be installed, so fetching it would only waste bandwidth and
  // surface a guaranteed install failure later.
  updater.autoDownload = !notifyOnly;
  updater.autoInstallOnAppQuit = false;

  ipcMain.on(UPDATE.OPEN_DOWNLOAD_PAGE, () => {
    openExternal(DOWNLOAD_PAGE_URL);
  });

  updater.on('checking-for-update', () => {
    state = { ...state, status: 'checking', error: null };
    broadcastState();
  });

  updater.on('update-available', (info) => {
    state = { ...state, status: 'available', version: info?.version ?? null, error: null };
    broadcast(UPDATE.AVAILABLE, { version: state.version });
    broadcastState();
  });

  updater.on('update-not-available', () => {
    state = { ...state, status: 'not-available', version: null };
    broadcastState();
  });

  updater.on('download-progress', (progress) => {
    const percent = typeof progress?.percent === 'number' ? Math.round(progress.percent) : 0;
    state = { ...state, status: 'downloading', percent };
    broadcast(UPDATE.DOWNLOAD_PROGRESS, { percent });
    broadcastState();
  });

  updater.on('update-downloaded', (info) => {
    state = { ...state, status: 'downloaded', version: info?.version ?? state.version, percent: 100 };
    broadcast(UPDATE.DOWNLOADED, { version: state.version });
    broadcastState();
  });

  updater.on('error', (err) => {
    state = { ...state, status: 'error', error: err?.message ?? String(err) };
    broadcastState();
  });

  ipcMain.handle(UPDATE.CHECK, async () => {
    // An unpacked build has no app-update.yml; calling checkForUpdates would
    // throw. Surface a no-op state rather than an error in dev.
    if (!isPackaged) return getUpdateState();
    try {
      await updater.checkForUpdates();
    } catch (err) {
      state = { ...state, status: 'error', error: err?.message ?? String(err) };
      broadcastState();
    }
    return getUpdateState();
  });

  ipcMain.handle(UPDATE.SET_AUTO_CHECK, (_event, enabled) => {
    const next = !!enabled;
    state = { ...state, autoCheckEnabled: next };
    if (typeof persistAutoCheck === 'function') persistAutoCheck(next);
    broadcastState();
    return getUpdateState();
  });

  ipcMain.on(UPDATE.QUIT_AND_INSTALL, () => {
    if (state.status !== 'downloaded') return;
    // The renderer's update prompt is the only UI that survives into the quit
    // transition; collapse the transparent frameless overlays first so the
    // installer/relaunch isn't painted over by a ghost surface.
    if (typeof prepareForInstall === 'function') prepareForInstall();
    updater.quitAndInstall();
  });

  // Auto-check on launch. Guarded by isPackaged: dev/test builds ship no
  // app-update.yml, so a real check would throw. Listeners are still wired
  // above so an injected fake updater (tests) can drive the full flow.
  if (isPackaged && state.autoCheckEnabled) {
    updater.checkForUpdates().catch((err) => {
      state = { ...state, status: 'error', error: err?.message ?? String(err) };
      broadcastState();
    });
  }
}
