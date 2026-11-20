/**
 * Unit tests for the main-process quit coordinator: every quit entry point
 * (renderer-confirmed quit, external app.quit(), an OpenPen window closed from
 * outside, Windows session end) must end in exactly one exit, and a hung
 * write flush must not keep the process alive past the safety timeout.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createQuitCoordinator, QUIT_SAFETY_TIMEOUT_MS } from '../../electron/quit-coordinator.js';

function setup(overrides = {}) {
  const deps = {
    onQuitStart: vi.fn(),
    flush: vi.fn(async () => {}),
    exit: vi.fn(),
    requestConfirm: vi.fn(() => true),
    appQuit: vi.fn(),
    ...overrides,
  };
  return { deps, quit: createQuitCoordinator(deps) };
}

const fakeEvent = () => ({ preventDefault: vi.fn() });

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('quit coordinator', () => {
  it('exits within the safety timeout even when the write flush never settles', async () => {
    const { deps, quit } = setup({ flush: vi.fn(() => new Promise(() => {})) });
    quit.quitNow('test');
    await vi.advanceTimersByTimeAsync(QUIT_SAFETY_TIMEOUT_MS);
    expect(QUIT_SAFETY_TIMEOUT_MS).toBeLessThanOrEqual(5000);
    expect(deps.onQuitStart).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  it('exits on an external quit (signal, logout) without asking for confirmation, and never runs twice', async () => {
    const { deps, quit } = setup();
    const ev = fakeEvent();
    quit.handleBeforeQuit(ev);
    expect(ev.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.requestConfirm).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(QUIT_SAFETY_TIMEOUT_MS);
    // A second before-quit (app.exit path re-entering) is let through untouched.
    const ev2 = fakeEvent();
    quit.handleBeforeQuit(ev2);
    quit.quitNow('again');
    await vi.advanceTimersByTimeAsync(QUIT_SAFETY_TIMEOUT_MS);
    expect(ev2.preventDefault).not.toHaveBeenCalled();
    expect(deps.onQuitStart).toHaveBeenCalledTimes(1);
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });

  it('turns an external close of an OpenPen window into an app quit, and session end into an exit', async () => {
    const { deps, quit } = setup();
    const ev = fakeEvent();
    quit.handleWindowClose(ev);
    expect(ev.preventDefault).toHaveBeenCalledTimes(1);
    expect(deps.appQuit).toHaveBeenCalledTimes(1);

    quit.handleSessionEnd();
    await vi.advanceTimersByTimeAsync(QUIT_SAFETY_TIMEOUT_MS);
    expect(deps.exit).toHaveBeenCalledTimes(1);
  });

  it('lets windows close normally once quitting has started', () => {
    const { deps, quit } = setup();
    quit.quitNow('test');
    const ev = fakeEvent();
    quit.handleWindowClose(ev);
    expect(ev.preventDefault).not.toHaveBeenCalled();
    expect(deps.appQuit).not.toHaveBeenCalled();
  });

  // Review follow-up: Windows may end the process as soon as session-end
  // returns, so the flush must not wait behind the lifecycle timer.
  it('starts flushing synchronously on Windows session end', () => {
    const { deps, quit } = setup();
    quit.handleSessionEnd();
    expect(deps.onQuitStart).toHaveBeenCalledTimes(1);
    return Promise.resolve().then(() => {
      expect(deps.flush).toHaveBeenCalledTimes(1);
    });
  });
});
