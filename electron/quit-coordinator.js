/**
 * Quit coordinator — the single place that decides how the main process ends.
 *
 * Entry points:
 *   - requestQuit(): user-facing quit (Cmd+Q shortcut, tray Quit). Asks the
 *     renderer to show the confirm dialog; with no renderer to ask, quits.
 *   - quitNow(): the confirmed quit path. Broadcasts the quit lifecycle so
 *     modules can run onQuit, flushes pending writes, then exits. A safety
 *     timer exits anyway if the flush hangs, so quitting never stalls.
 *   - handleBeforeQuit(): Electron's before-quit for an external app.quit()
 *     (system logout/shutdown, Activity Monitor Quit, SIGTERM/SIGINT —
 *     Electron turns those signals into app.quit()). Saves and exits without
 *     a confirm dialog: nobody may be there to answer it, and the dialog can
 *     land on the click-through overlay where it cannot be clicked.
 *   - handleWindowClose(): an OpenPen window closed from outside (Windows
 *     `taskkill` without /F sends WM_CLOSE). Internal code tears windows down
 *     with destroy(), which does not emit 'close', so any 'close' here came
 *     from outside. Without this, closing one window leaves the others alive
 *     and window-all-closed never fires.
 *   - handleSessionEnd(): Windows logoff / shutdown (session-end; Windows
 *     may end the process as soon as the handler returns). Starts the flush
 *     right away instead of after the lifecycle delay: Electron drains the
 *     microtask queue before returning from the event, so the already-queued
 *     settings writes and app.exit() run before control goes back to Windows.
 *     query-session-end is deliberately not used — another app can still
 *     cancel the logoff at that point, and OpenPen would have quit for
 *     nothing.
 *
 * app.exit() rather than app.quit() is deliberate: going through app.quit()
 * on macOS leaves transparent screen-saver-level windows in an unclean close
 * state that needs a second trigger.
 */

/** Upper bound from the start of quitting to process exit. */
export const QUIT_SAFETY_TIMEOUT_MS = 5000;

/** Gives renderers a moment to receive the quit lifecycle event before exit. */
const LIFECYCLE_FLUSH_MS = 50;

/**
 * @param {{
 *   onQuitStart: () => void,
 *   flush: () => Promise<void> | void,
 *   exit: (code: number) => void,
 *   requestConfirm: () => boolean,
 *   appQuit: () => void,
 *   log?: (msg: string) => void,
 * }} deps
 */
export function createQuitCoordinator({
  onQuitStart,
  flush,
  exit,
  requestConfirm,
  appQuit,
  log = () => {},
}) {
  let quitting = false;
  let exited = false;

  function exitOnce() {
    if (exited) return;
    exited = true;
    exit(0);
  }

  function startFlush() {
    Promise.resolve()
      .then(() => flush())
      .catch((err) => log(`[Quit] flush threw: ${err}`))
      .then(exitOnce);
  }

  /**
   * @param {string} reason
   * @param {{ immediate?: boolean }} [opts] immediate: start the flush now
   *   rather than after the lifecycle delay (Windows session end).
   */
  function quitNow(reason, { immediate = false } = {}) {
    if (quitting) return;
    quitting = true;
    log(`[Quit] quitting (${reason})`);
    setTimeout(() => {
      if (!exited) log(`[Quit] flush did not finish within ${QUIT_SAFETY_TIMEOUT_MS}ms; exiting anyway`);
      exitOnce();
    }, QUIT_SAFETY_TIMEOUT_MS);
    try {
      onQuitStart();
    } catch (err) {
      log(`[Quit] onQuitStart threw: ${err}`);
    }
    if (immediate) startFlush();
    else setTimeout(startFlush, LIFECYCLE_FLUSH_MS);
  }

  function requestQuit() {
    if (quitting) return;
    if (!requestConfirm()) quitNow('no renderer to confirm');
  }

  function handleBeforeQuit(event) {
    if (quitting) return;
    event.preventDefault();
    quitNow('external quit');
  }

  function handleWindowClose(event) {
    if (quitting) return;
    event.preventDefault();
    appQuit();
  }

  function handleSessionEnd() {
    quitNow('session end', { immediate: true });
  }

  return {
    isQuitting: () => quitting,
    quitNow,
    requestQuit,
    handleBeforeQuit,
    handleWindowClose,
    handleSessionEnd,
  };
}
