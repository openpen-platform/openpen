import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  createWindowRecovery,
  mergeDisabledModules,
} from '../../electron/window-recovery.js';

function makeWindow() {
  const wc = new EventEmitter();
  wc.reload = vi.fn();
  wc.forcefullyCrashRenderer = vi.fn();
  wc.isDestroyed = () => false;
  const win = new EventEmitter();
  win.webContents = wc;
  win.isDestroyed = () => false;
  return { win, wc };
}

function setup({ choice = 'reload', options } = {}) {
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const askUser = vi.fn().mockResolvedValue(choice);
  const disablePluginsAndRelaunch = vi.fn();
  const quitApp = vi.fn();
  let clock = 1_000_000;
  const recovery = createWindowRecovery({
    log,
    askUser,
    disablePluginsAndRelaunch,
    quitApp,
    now: () => clock,
    options,
  });
  const { win, wc } = makeWindow();
  const onRecovered = vi.fn();
  recovery.attach(win, 'overlay', { onRecovered });
  return {
    win, wc, log, askUser, disablePluginsAndRelaunch, quitApp, onRecovered,
    advanceClock: (ms) => { clock += ms; },
  };
}

const crash = (wc, reason = 'crashed') => wc.emit('render-process-gone', {}, { reason, exitCode: 11 });
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('window recovery: crash', () => {
  it('reloads the window and logs why the renderer died', () => {
    // Rules out a crashed overlay staying blank over the desktop.
    const { wc, log } = setup();
    crash(wc, 'oom');
    expect(wc.reload).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('renderer gone'),
      expect.objectContaining({ reason: 'oom', exitCode: 11 }),
    );
  });

  it('does not reload on a clean exit', () => {
    const { wc } = setup();
    crash(wc, 'clean-exit');
    expect(wc.reload).not.toHaveBeenCalled();
  });

  it('stops reloading when the same window crashes again soon after, and asks the user', async () => {
    // Rules out an endless crash-reload loop with no way out.
    const { wc, askUser, advanceClock } = setup();
    crash(wc);
    advanceClock(5_000);
    crash(wc);
    expect(wc.reload).toHaveBeenCalledTimes(1);
    await flush();
    expect(askUser).toHaveBeenCalledWith(expect.objectContaining({ kind: 'crash', label: 'overlay' }));
  });

  it('treats a crash after a long stable period as a fresh first crash', () => {
    const { wc, askUser, advanceClock } = setup();
    crash(wc);
    advanceClock(61_000);
    crash(wc);
    expect(wc.reload).toHaveBeenCalledTimes(2);
    expect(askUser).not.toHaveBeenCalled();
  });

  it('runs onRecovered once the recovery reload finished loading, not on ordinary loads', () => {
    const { wc, onRecovered } = setup();
    wc.emit('did-finish-load');
    expect(onRecovered).not.toHaveBeenCalled();
    crash(wc);
    wc.emit('did-finish-load');
    wc.emit('did-finish-load');
    expect(onRecovered).toHaveBeenCalledTimes(1);
  });
});

describe('window recovery: escalation choices', () => {
  it('disable-plugins hands over to the restart path without reloading', async () => {
    const { wc, disablePluginsAndRelaunch, advanceClock } = setup({ choice: 'disable-plugins' });
    crash(wc);
    advanceClock(1_000);
    crash(wc);
    await flush();
    expect(disablePluginsAndRelaunch).toHaveBeenCalledTimes(1);
    expect(wc.reload).toHaveBeenCalledTimes(1);
  });

  it('reload gives a fresh budget; quit quits', async () => {
    const reloadCase = setup({ choice: 'reload' });
    crash(reloadCase.wc);
    crash(reloadCase.wc);
    await flush();
    expect(reloadCase.wc.reload).toHaveBeenCalledTimes(2);

    const quitCase = setup({ choice: 'quit' });
    crash(quitCase.wc);
    crash(quitCase.wc);
    await flush();
    expect(quitCase.quitApp).toHaveBeenCalledTimes(1);
  });
});

describe('window recovery: unresponsive', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('force-restarts a renderer that stays unresponsive past the grace period', () => {
    // Rules out a hung window staying frozen indefinitely.
    const { wc } = setup();
    wc.emit('unresponsive');
    vi.advanceTimersByTime(9_999);
    expect(wc.forcefullyCrashRenderer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(wc.forcefullyCrashRenderer).toHaveBeenCalledTimes(1);
  });

  it('leaves a renderer alone when it becomes responsive within the grace period', () => {
    const { wc } = setup();
    wc.emit('unresponsive');
    vi.advanceTimersByTime(5_000);
    wc.emit('responsive');
    vi.advanceTimersByTime(20_000);
    expect(wc.forcefullyCrashRenderer).not.toHaveBeenCalled();
  });
});

describe('window recovery: load failure', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  // Chromium also reports did-finish-load for the error page of a failed load.
  const fail = (wc, code = -102, isMainFrame = true) => {
    wc.emit('did-start-loading');
    wc.emit('did-fail-load', {}, code, 'ERR_CONNECTION_REFUSED', 'http://x/', isMainFrame);
    wc.emit('did-finish-load');
  };

  it('retries a failed main-frame load, then escalates once retries are used up', async () => {
    // Rules out a window left blank after a failed load.
    const { wc, askUser } = setup({ choice: 'quit' });
    fail(wc);
    vi.advanceTimersByTime(1_000);
    expect(wc.reload).toHaveBeenCalledTimes(1);
    fail(wc);
    vi.advanceTimersByTime(2_000);
    expect(wc.reload).toHaveBeenCalledTimes(2);
    fail(wc);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(wc.reload).toHaveBeenCalledTimes(2);
    expect(askUser).toHaveBeenCalledWith(expect.objectContaining({ kind: 'load-failed' }));
  });

  it('does not run onRecovered for the error page of a failed load', () => {
    const { wc, onRecovered } = setup();
    crash(wc);
    fail(wc);
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it('ignores aborted navigations and sub-frame failures', () => {
    const { wc } = setup();
    fail(wc, -3);
    fail(wc, -102, false);
    vi.advanceTimersByTime(10_000);
    expect(wc.reload).not.toHaveBeenCalled();
  });
});

describe('mergeDisabledModules', () => {
  it('adds plugin ids to the already-disabled ones without duplicates or losing any', () => {
    expect(mergeDisabledModules(['@openpen/line', '@x/a'], ['@x/a', '@x/b'])).toEqual([
      '@openpen/line',
      '@x/a',
      '@x/b',
    ]);
  });
});

describe('window recovery: hardening', () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));

  it('retries a failed load with loadURL when nothing was committed', async () => {
    // Rules out a blank window when reload() has no committed entry to reload.
    vi.useFakeTimers();
    try {
      const { wc } = setup();
      wc.loadURL = vi.fn().mockResolvedValue(undefined);
      wc.emit('did-start-loading');
      wc.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'http://x/', true);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(wc.loadURL).toHaveBeenCalledWith('http://x/');
      expect(wc.reload).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not reset the failure budget when the error page finishes loading', async () => {
    // Rules out endless retries when start-loading fires again for the error page.
    vi.useFakeTimers();
    try {
      const { wc, askUser } = setup();
      wc.getURL = () => 'chrome-error://chromewebdata/';
      for (let i = 0; i < 3; i += 1) {
        wc.emit('did-start-loading');
        wc.emit('did-fail-load', {}, -105, 'ERR', 'http://x/', true);
        wc.emit('did-start-loading'); // error page navigation
        wc.emit('did-finish-load');
        await vi.advanceTimersByTimeAsync(5_000);
      }
      expect(askUser).toHaveBeenCalledWith(expect.objectContaining({ kind: 'load-failed' }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows one prompt at a time and drops later ones after restart is chosen', async () => {
    // Rules out two dialogs and two relaunches when several windows die together.
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const askUser = vi.fn().mockResolvedValue('disable-plugins');
    const disablePluginsAndRelaunch = vi.fn();
    let clock = 1_000_000;
    const recovery = createWindowRecovery({
      log, askUser, disablePluginsAndRelaunch, quitApp: vi.fn(), now: () => clock,
    });
    const a = makeWindow();
    const b = makeWindow();
    recovery.attach(a.win, 'a');
    recovery.attach(b.win, 'b');
    for (const { wc } of [a, b]) {
      crash(wc);
      clock += 1_000;
      crash(wc);
    }
    await settle();
    await settle();
    expect(askUser).toHaveBeenCalledTimes(1);
    expect(disablePluginsAndRelaunch).toHaveBeenCalledTimes(1);
  });
});
