/**
 * macos-window: the Stationary collection-behavior tweak must be a strict no-op
 * off darwin (Windows behaviour unchanged) and must degrade to a no-op on any
 * native failure.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import log from 'electron-log/main.js';

vi.mock('electron-log/main.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import {
  keepWindowStationary,
  NS_COLLECTION_BEHAVIOR as B,
  __setBindingsForTest,
} from '../../electron/macos-window.js';

const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
const setPlatform = (value) => Object.defineProperty(process, 'platform', { value, configurable: true });

function fakeWindow() {
  return { isDestroyed: vi.fn(() => false), getNativeWindowHandle: vi.fn(() => Buffer.alloc(8)) };
}

/** Fake objc bindings backed by a single mutable collectionBehavior value. */
function fakeBindings(initial) {
  const state = { behavior: initial, sets: [] };
  return {
    state,
    viewFromHandle: vi.fn(() => ({ view: true })),
    sendPtr: vi.fn(() => ({ nsWindow: true })),
    sendUInt: vi.fn(() => state.behavior),
    sendSetUInt: vi.fn((_obj, _sel, v) => { state.behavior = v; state.sets.push(v); }),
  };
}

afterEach(() => {
  Object.defineProperty(process, 'platform', realPlatform);
  __setBindingsForTest(null);
});

describe.each(['win32', 'linux'])('off darwin (%s)', (platform) => {
  beforeEach(() => setPlatform(platform));

  it('keepWindowStationary returns false and never touches the window', () => {
    const win = fakeWindow();
    expect(keepWindowStationary(win)).toBe(false);
    expect(win.getNativeWindowHandle).not.toHaveBeenCalled();
    expect(win.isDestroyed).not.toHaveBeenCalled();
  });
});

describe('darwin', () => {
  beforeEach(() => setPlatform('darwin'));

  it('sets Stationary, clears Managed/Transient, keeps the other bits', () => {
    const b = fakeBindings(B.CAN_JOIN_ALL_SPACES | B.FULL_SCREEN_AUXILIARY | B.MANAGED);
    __setBindingsForTest(b);
    expect(keepWindowStationary(fakeWindow())).toBe(true);
    expect(b.state.behavior).toBe(B.CAN_JOIN_ALL_SPACES | B.FULL_SCREEN_AUXILIARY | B.STATIONARY);
    expect(b.sendSetUInt).toHaveBeenCalledTimes(1);
  });

  it('maps the bit field observed on macOS 15 (0x185) to 0x191', () => {
    // 0x185 = CanJoinAllSpaces | Managed | FullScreenPrimary | FullScreenAuxiliary, as left by
    // setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }) on a frameless Electron window.
    const b = fakeBindings(0x185);
    __setBindingsForTest(b);
    expect(keepWindowStationary(fakeWindow())).toBe(true);
    expect(b.state.behavior).toBe(0x191);
  });

  it('does not rewrite the field when Stationary is already the only Expose bit', () => {
    const b = fakeBindings(B.CAN_JOIN_ALL_SPACES | B.STATIONARY);
    __setBindingsForTest(b);
    expect(keepWindowStationary(fakeWindow())).toBe(true);
    expect(b.sendSetUInt).not.toHaveBeenCalled();
  });

  it('returns false when the bit does not read back', () => {
    const b = fakeBindings(0);
    b.sendSetUInt = vi.fn(); // write is ignored by the system
    __setBindingsForTest(b);
    expect(keepWindowStationary(fakeWindow())).toBe(false);
  });

  it('degrades to false (no throw) when a native call throws', () => {
    const b = fakeBindings(0);
    b.sendUInt = vi.fn(() => { throw new Error('boom'); });
    __setBindingsForTest(b);
    expect(() => keepWindowStationary(fakeWindow())).not.toThrow();
    expect(keepWindowStationary(fakeWindow())).toBe(false);
  });

  it('returns false when native bindings are unavailable', () => {
    __setBindingsForTest(null);
    expect(keepWindowStationary(fakeWindow())).toBe(false);
  });

  it('returns false for a destroyed window', () => {
    __setBindingsForTest(fakeBindings(0));
    const win = fakeWindow();
    win.isDestroyed = vi.fn(() => true);
    expect(keepWindowStationary(win)).toBe(false);
  });

  it('clears a Transient bit as well (Managed / Transient / Stationary are exclusive)', () => {
    const b = fakeBindings(B.CAN_JOIN_ALL_SPACES | B.TRANSIENT);
    __setBindingsForTest(b);
    expect(keepWindowStationary(fakeWindow())).toBe(true);
    expect(b.state.behavior).toBe(B.CAN_JOIN_ALL_SPACES | B.STATIONARY);
  });

  it('returns false when the native handle cannot be read', () => {
    __setBindingsForTest(fakeBindings(0));
    const win = fakeWindow();
    win.getNativeWindowHandle = vi.fn(() => { throw new Error('no handle'); });
    expect(() => keepWindowStationary(win)).not.toThrow();
    expect(keepWindowStationary(win)).toBe(false);
  });

  it('returns false when the view or its NSWindow is null', () => {
    const noView = fakeBindings(0);
    noView.viewFromHandle = vi.fn(() => null);
    __setBindingsForTest(noView);
    expect(keepWindowStationary(fakeWindow())).toBe(false);
    const noWindow = fakeBindings(0);
    noWindow.sendPtr = vi.fn(() => null);
    __setBindingsForTest(noWindow);
    expect(keepWindowStationary(fakeWindow())).toBe(false);
    expect(noWindow.sendSetUInt).not.toHaveBeenCalled();
  });

  it('logs a call failure only once', () => {
    log.warn.mockClear();
    const b = fakeBindings(0);
    b.sendUInt = vi.fn(() => { throw new Error('boom'); });
    __setBindingsForTest(b);
    keepWindowStationary(fakeWindow());
    keepWindowStationary(fakeWindow());
    expect(log.warn).toHaveBeenCalledTimes(1);
  });
});
