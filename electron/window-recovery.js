/**
 * Window recovery — one policy for a window whose renderer crashed, hung, or
 * failed to load.
 *
 * The windows are transparent, always-on-top and cover the desktop, so a dead
 * renderer must never be left in place:
 *
 * - `render-process-gone` (crash / OOM / killed): reload the window. A second
 *   crash within `stableMs` of the previous automatic reload means reloading is
 *   not helping, so stop reloading and escalate instead.
 * - `unresponsive`: give the renderer `unresponsiveGraceMs` to recover
 *   (`responsive`). If it does not, force the renderer process to exit, which
 *   re-enters the crash path above (and so reload / escalate).
 * - `did-fail-load` (main frame): retry the load a bounded number of times,
 *   then escalate.
 *
 * Escalation asks the user (via the injected `askUser`) to reload once more,
 * restart with every disk-installed plugin disabled, or quit. The helper is
 * dependency-injected so the policy runs under unit tests without Electron.
 */

/** Chromium's `ERR_ABORTED`: a navigation superseded by another one, not a failure. */
const ERR_ABORTED = -3;

export const DEFAULTS = Object.freeze({
  /** A crash this soon after an automatic reload counts as "crashed again". */
  stableMs: 60_000,
  /** How long a hung renderer may stay unresponsive before it is force-restarted. */
  unresponsiveGraceMs: 10_000,
  /** Load retries before escalating; delay grows linearly (retryDelayMs * attempt). */
  maxLoadRetries: 2,
  retryDelayMs: 1_000,
});

/** @typedef {'crash' | 'load-failed'} EscalationKind */
/** @typedef {'reload' | 'disable-plugins' | 'quit'} EscalationChoice */

/**
 * Union of the currently disabled module ids and the given plugin ids,
 * de-duplicated, keeping the original order.
 * @param {readonly string[]} currentlyDisabled
 * @param {readonly string[]} pluginIds
 * @returns {string[]}
 */
export function mergeDisabledModules(currentlyDisabled, pluginIds) {
  return [...new Set([...currentlyDisabled, ...pluginIds])];
}

/**
 * @param {object} deps
 * @param {{ info: Function, warn: Function, error: Function }} deps.log
 * @param {(ctx: { win: any, label: string, kind: EscalationKind, detail: string }) => Promise<EscalationChoice>} deps.askUser
 *   Ask the user how to proceed; must resolve even when no dialog can be shown.
 * @param {() => Promise<void> | void} deps.disablePluginsAndRelaunch
 * @param {() => void} deps.quitApp
 * @param {() => number} [deps.now]
 * @param {Partial<typeof DEFAULTS>} [deps.options]
 */
export function createWindowRecovery({
  log,
  askUser,
  disablePluginsAndRelaunch,
  quitApp,
  now = Date.now,
  options = {},
}) {
  const opts = { ...DEFAULTS, ...options };
  // Prompts from different windows are shown one at a time; once the user picks
  // restart or quit, later prompts are dropped.
  let promptQueue = Promise.resolve();
  let appEnding = false;

  /**
   * Watch one window.
   * @param {any} win BrowserWindow
   * @param {string} label  Short window name used in logs ('main', 'overlay', ...).
   * @param {{ onRecovered?: (win: any) => void }} [hooks]
   *   `onRecovered` runs after a recovery reload finished loading, so the owner
   *   can replay main-held state the fresh renderer has not seen.
   */
  function attach(win, label, hooks = {}) {
    const wc = win.webContents;
    let lastAutoReloadAt = null;
    let loadFailures = 0;
    let escalating = false;
    let recoveryPending = false;
    // Chromium still fires did-finish-load for the error page after a failed
    // load; that must not count as a successful (re)load.
    let loadFailedThisNavigation = false;
    let unresponsiveTimer = null;
    let loadRetryTimer = null;
    let failedUrl = null;

    const alive = () => !win.isDestroyed() && !wc.isDestroyed();

    const clearTimers = () => {
      clearTimeout(unresponsiveTimer);
      clearTimeout(loadRetryTimer);
      unresponsiveTimer = null;
      loadRetryTimer = null;
    };

    function reload(reason) {
      if (!alive()) return;
      recoveryPending = true;
      log.warn(`[WindowRecovery] reloading ${label} window (${reason})`);
      try {
        wc.reload();
      } catch (err) {
        log.error(`[WindowRecovery] reload of ${label} window threw:`, err);
      }
    }

    // A navigation that failed before committing leaves nothing for reload() to
    // reload, so retry the failed URL itself.
    function retryLoad(reason) {
      if (!alive()) return;
      if (!failedUrl || typeof wc.loadURL !== 'function') return reload(reason);
      recoveryPending = true;
      log.warn(`[WindowRecovery] retrying load of ${label} window (${reason})`);
      wc.loadURL(failedUrl).catch(() => {
        // Failure is reported through did-fail-load.
      });
    }

    function escalate(kind, detail) {
      if (escalating || !alive()) return Promise.resolve();
      escalating = true;
      promptQueue = promptQueue.then(() => runEscalation(kind, detail));
      return promptQueue;
    }

    async function runEscalation(kind, detail) {
      if (appEnding || !alive()) {
        escalating = false;
        return;
      }
      log.error(`[WindowRecovery] ${label} window did not recover (${kind}): ${detail} — asking the user`);
      let choice = 'reload';
      try {
        choice = await askUser({ win, label, kind, detail });
      } catch (err) {
        log.error('[WindowRecovery] recovery prompt failed, falling back to reload:', err);
      }
      if (choice === 'disable-plugins') {
        appEnding = true;
        log.warn('[WindowRecovery] user chose: disable all plugins and restart');
        await disablePluginsAndRelaunch();
      } else if (choice === 'quit') {
        appEnding = true;
        log.warn('[WindowRecovery] user chose: quit');
        quitApp();
      } else {
        escalating = false;
        // A deliberate manual reload starts a fresh budget.
        lastAutoReloadAt = null;
        loadFailures = 0;
        reload('user requested');
      }
    }

    wc.on('render-process-gone', (_event, details) => {
      clearTimers();
      if (details?.reason === 'clean-exit') return;
      log.error(`[WindowRecovery] ${label} window renderer gone`, {
        reason: details?.reason,
        exitCode: details?.exitCode,
      });
      if (escalating || !alive()) return;
      const t = now();
      if (lastAutoReloadAt !== null && t - lastAutoReloadAt < opts.stableMs) {
        void escalate('crash', `renderer gone again (${details?.reason}) within ${opts.stableMs}ms of a reload`);
        return;
      }
      lastAutoReloadAt = t;
      reload(`renderer gone: ${details?.reason}`);
    });

    wc.on('unresponsive', () => {
      if (unresponsiveTimer) return;
      log.warn(`[WindowRecovery] ${label} window unresponsive`);
      unresponsiveTimer = setTimeout(() => {
        unresponsiveTimer = null;
        if (!alive()) return;
        log.error(`[WindowRecovery] ${label} window still unresponsive after ${opts.unresponsiveGraceMs}ms — restarting its renderer`);
        try {
          wc.forcefullyCrashRenderer();
        } catch (err) {
          log.error('[WindowRecovery] forcefullyCrashRenderer failed, reloading instead:', err);
          reload('unresponsive');
        }
      }, opts.unresponsiveGraceMs);
    });

    wc.on('responsive', () => {
      if (!unresponsiveTimer) return;
      clearTimeout(unresponsiveTimer);
      unresponsiveTimer = null;
      log.info(`[WindowRecovery] ${label} window responsive again`);
    });

    wc.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (!isMainFrame || errorCode === ERR_ABORTED || escalating) return;
      loadFailedThisNavigation = true;
      failedUrl = validatedURL || null;
      loadFailures += 1;
      log.error(`[WindowRecovery] ${label} window failed to load`, {
        errorCode,
        errorDescription,
        url: validatedURL,
        attempt: loadFailures,
      });
      if (loadFailures > opts.maxLoadRetries) {
        void escalate('load-failed', `${errorDescription} (${errorCode}) loading ${validatedURL}`);
        return;
      }
      clearTimeout(loadRetryTimer);
      loadRetryTimer = setTimeout(() => {
        loadRetryTimer = null;
        retryLoad(`load failed: ${errorDescription}`);
      }, opts.retryDelayMs * loadFailures);
    });

    wc.on('did-start-loading', () => {
      loadFailedThisNavigation = false;
    });

    wc.on('did-finish-load', () => {
      // The error page also finishes loading; it is not a successful load.
      if (loadFailedThisNavigation || wc.getURL?.().startsWith('chrome-error://')) return;
      loadFailures = 0;
      if (!recoveryPending) return;
      recoveryPending = false;
      log.info(`[WindowRecovery] ${label} window recovered`);
      try {
        hooks.onRecovered?.(win);
      } catch (err) {
        log.error('[WindowRecovery] onRecovered hook threw:', err);
      }
    });
  }

  return { attach };
}
