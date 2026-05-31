import { describe, it, expect } from 'vitest';
import { detectCapabilities } from '../../electron/platform/platform-capabilities.js';
import { createOverlayPlatform } from '../../electron/platform/overlay-platform.js';
import { StandardSurface } from '../../electron/platform/standard-surface.js';
import { WaylandSurface } from '../../electron/platform/wayland-surface.js';

const envFor = (platform, sessionType, extraEnv = {}) => ({
  platform,
  env: { ...(sessionType ? { XDG_SESSION_TYPE: sessionType } : {}), ...extraEnv },
});

describe('detectCapabilities', () => {
  it('macOS uses the standard model (persistent window, restack, global shortcuts)', () => {
    const c = detectCapabilities(envFor('darwin'));
    expect(c).toMatchObject({
      isWayland: false,
      canRestackWindows: true,
      supportsPerPixelPassthrough: true,
      supportsTransparentFullscreenRemap: true,
      supportsGlobalShortcuts: true,
      usesOnDemandWindows: false,
      usesDesktopShortcut: false,
    });
  });

  it('Windows uses the standard model and is flagged isWindows', () => {
    const c = detectCapabilities(envFor('win32'));
    expect(c.isWindows).toBe(true);
    expect(c.isWayland).toBe(false);
    expect(c.usesOnDemandWindows).toBe(false);
  });

  it('Linux/X11 follows the standard model (NOT the Wayland model)', () => {
    const c = detectCapabilities(envFor('linux', 'x11'));
    expect(c.isWayland).toBe(false);
    expect(c.canRestackWindows).toBe(true);
    expect(c.usesOnDemandWindows).toBe(false);
    expect(c.usesDesktopShortcut).toBe(false);
  });

  it('Linux/Wayland uses the on-demand model with the limited capabilities', () => {
    const c = detectCapabilities(envFor('linux', 'wayland'));
    expect(c).toMatchObject({
      isWayland: true,
      canRestackWindows: false,
      supportsPerPixelPassthrough: false,
      supportsTransparentFullscreenRemap: false,
      supportsGlobalShortcuts: false,
      usesOnDemandWindows: true,
      usesDesktopShortcut: true,
    });
  });

  it('matches XDG_SESSION_TYPE case-insensitively and as a substring (e.g. "wayland")', () => {
    expect(detectCapabilities(envFor('linux', 'Wayland')).isWayland).toBe(true);
    expect(detectCapabilities(envFor('linux', undefined)).isWayland).toBe(false);
  });

  it('matches window-manager IS_WAYLAND (XDG only): a bare WAYLAND_DISPLAY does NOT trigger Wayland yet', () => {
    // The WAYLAND_DISPLAY fail-safe is deferred until all Wayland detection is
    // unified onto caps; until then caps.isWayland must equal the IS_WAYLAND
    // (XDG-only) formula so the adapter selection can never disagree with the
    // remaining `if (IS_WAYLAND)` guards at the call sites.
    const c = detectCapabilities(envFor('linux', undefined, { WAYLAND_DISPLAY: 'wayland-0' }));
    expect(c.isWayland).toBe(false);
    expect(c.usesOnDemandWindows).toBe(false);
  });

  it('is frozen so callers cannot mutate the resolved capabilities', () => {
    const c = detectCapabilities(envFor('darwin'));
    expect(Object.isFrozen(c)).toBe(true);
  });
});

describe('createOverlayPlatform', () => {
  it('returns a WaylandSurface on a Wayland session', () => {
    const p = createOverlayPlatform(envFor('linux', 'wayland'));
    expect(p).toBeInstanceOf(WaylandSurface);
    expect(p.caps.isWayland).toBe(true);
  });

  it('returns a StandardSurface everywhere else (mac / win / X11)', () => {
    expect(createOverlayPlatform(envFor('darwin'))).toBeInstanceOf(StandardSurface);
    expect(createOverlayPlatform(envFor('win32'))).toBeInstanceOf(StandardSurface);
    expect(createOverlayPlatform(envFor('linux', 'x11'))).toBeInstanceOf(StandardSurface);
  });
});
