import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import {
  createRendererReadyWatchdog,
  resolveTimeoutMs,
} from '../../electron/renderer-ready-watchdog.js';

function setupWatchdog({ timeoutMs }) {
  const ipc = new EventEmitter();
  const onTimeout = vi.fn();
  const log = { error: vi.fn() };
  const watchdog = createRendererReadyWatchdog({
    timeoutMs,
    ipc,
    channel: 'window:content-ready',
    onTimeout,
    log,
  });
  return { ipc, onTimeout, log, watchdog };
}

describe('createRendererReadyWatchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires onTimeout if no CONTENT_READY arrives before the deadline', () => {
    // Rules out the regression where the watchdog silently never fires —
    // the user would stay locked out staring at a foreign renderer.
    const { onTimeout, log } = setupWatchdog({ timeoutMs: 30000 });

    vi.advanceTimersByTime(29999);
    expect(onTimeout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(log.error).toHaveBeenCalledTimes(1);
    expect(log.error.mock.calls[0][0]).toMatch(/30000ms/);
  });

  it('does not fire onTimeout when CONTENT_READY arrives before the deadline', () => {
    // Rules out spurious quit during legitimate slow cold-starts — would make
    // the app un-launchable on slow machines.
    const { ipc, onTimeout, log } = setupWatchdog({ timeoutMs: 30000 });

    vi.advanceTimersByTime(10000);
    ipc.emit('window:content-ready');

    vi.advanceTimersByTime(60000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('cancel() prevents the timeout from firing', () => {
    // Rules out a leaked timer firing app.quit() after the app is already
    // tearing down (caller invokes cancel as part of quit handling).
    const { onTimeout, watchdog } = setupWatchdog({ timeoutMs: 30000 });

    watchdog.cancel();
    vi.advanceTimersByTime(60000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('does not double-fire when CONTENT_READY arrives after the timeout', () => {
    // Rules out app.quit() being called twice (timeout AND late event) which
    // could race with the existing quit broadcast path in main.js.
    const { ipc, onTimeout } = setupWatchdog({ timeoutMs: 30000 });

    vi.advanceTimersByTime(30000);
    expect(onTimeout).toHaveBeenCalledTimes(1);

    ipc.emit('window:content-ready');
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('timeoutMs=0 disables the watchdog — no listener registered, no timer scheduled', () => {
    // Rules out OPENPEN_RENDERER_READY_TIMEOUT_MS=0 silently keeping the default
    // 30s deadline. Disabling must mean disabled.
    const { ipc, onTimeout } = setupWatchdog({ timeoutMs: 0 });
    expect(ipc.listenerCount('window:content-ready')).toBe(0);

    vi.advanceTimersByTime(60000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('negative timeoutMs disables the watchdog', () => {
    const { ipc, onTimeout } = setupWatchdog({ timeoutMs: -1 });
    expect(ipc.listenerCount('window:content-ready')).toBe(0);

    vi.advanceTimersByTime(60000);
    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('NaN timeoutMs disables the watchdog (defensive against malformed env)', () => {
    const { ipc, onTimeout } = setupWatchdog({ timeoutMs: NaN });
    expect(ipc.listenerCount('window:content-ready')).toBe(0);

    vi.advanceTimersByTime(60000);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});

describe('resolveTimeoutMs', () => {
  it('returns defaultMs when env var is unset', () => {
    expect(resolveTimeoutMs({}, 30000)).toBe(30000);
  });

  it('returns defaultMs when env var is empty string', () => {
    expect(resolveTimeoutMs({ OPENPEN_RENDERER_READY_TIMEOUT_MS: '' }, 30000)).toBe(30000);
  });

  it('returns 0 when env var is explicit "0" — disables the watchdog', () => {
    // Rules out "0" being treated as falsy and falling back to default.
    expect(resolveTimeoutMs({ OPENPEN_RENDERER_READY_TIMEOUT_MS: '0' }, 30000)).toBe(0);
  });

  it('returns parsed value when env var is a positive number string', () => {
    expect(resolveTimeoutMs({ OPENPEN_RENDERER_READY_TIMEOUT_MS: '5000' }, 30000)).toBe(5000);
  });

  it('returns defaultMs when env var is non-numeric garbage', () => {
    expect(resolveTimeoutMs({ OPENPEN_RENDERER_READY_TIMEOUT_MS: 'abc' }, 30000)).toBe(30000);
  });

  it('returns defaultMs when env var is negative — negative is invalid, not a disable signal', () => {
    expect(resolveTimeoutMs({ OPENPEN_RENDERER_READY_TIMEOUT_MS: '-1' }, 30000)).toBe(30000);
  });
});
