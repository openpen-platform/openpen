/**
 * Quit the app if no renderer reports ready within a configurable deadline.
 *
 * The overlay windows are transparent and always-on-top at `screen-saver` level.
 * If `loadURL` lands on a foreign Vite project (port collision, misconfigured
 * URL) or a renderer hangs mid-mount, the windows stay up — covering the
 * desktop with content that intercepts no `WINDOW.CONTENT_READY` IPC. The
 * watchdog detects this by listening for the first `CONTENT_READY` from any
 * webContents; if none arrives before the deadline, it fires `onTimeout`
 * (typically `app.quit`) so the user can recover the desktop.
 *
 * Reuses the existing `App.vue` → `signalContentReady()` IPC chain — no new
 * protocol or token. Foreign renderers don't know about openPenApi, so they
 * never trip the cancel path.
 *
 * @param {object} options
 * @param {number} options.timeoutMs        Deadline in ms. `<= 0` disables the watchdog.
 * @param {{ once: Function, removeListener: Function }} options.ipc  ipcMain-like surface.
 * @param {string} options.channel          IPC channel to listen on (typically WINDOW.CONTENT_READY).
 * @param {() => void} options.onTimeout    Called when the deadline elapses.
 * @param {{ error: Function, info?: Function }} options.log  Logger used for the timeout report.
 * @returns {{ cancel: () => void }}        Caller invokes `cancel()` to dispose listeners + timer.
 */
export function createRendererReadyWatchdog({ timeoutMs, ipc, channel, onTimeout, log }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return { cancel: () => {} };
  }

  let fired = false;
  const handler = () => {
    if (fired) return;
    fired = true;
    clearTimeout(timer);
  };

  const timer = setTimeout(() => {
    if (fired) return;
    fired = true;
    ipc.removeListener(channel, handler);
    log.error(
      `[RendererReadyWatchdog] no renderer reported ready within ${timeoutMs}ms — quitting to release the desktop`,
    );
    onTimeout();
  }, timeoutMs);

  ipc.once(channel, handler);

  return {
    cancel: () => {
      if (fired) return;
      fired = true;
      clearTimeout(timer);
      ipc.removeListener(channel, handler);
    },
  };
}

/**
 * Read the configured timeout in ms from env.
 *
 * - Unset → `defaultMs`.
 * - `0` → disabled.
 * - Non-numeric → `defaultMs` (treat malformed env as "use default").
 *
 * @param {NodeJS.ProcessEnv} env
 * @param {number} defaultMs
 * @returns {number}
 */
export function resolveTimeoutMs(env, defaultMs) {
  const raw = env.OPENPEN_RENDERER_READY_TIMEOUT_MS;
  if (raw === undefined || raw === '') return defaultMs;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return defaultMs;
  return parsed;
}
