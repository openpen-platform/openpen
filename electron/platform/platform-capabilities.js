/**
 * Platform capability detection — the SINGLE place the host decides "what can
 * this platform do", resolved once at startup. The rest of the code branches on
 * these CAPABILITIES, never on platform identity (`IS_WAYLAND` / `process.platform`)
 * scattered through business logic.
 *
 * Why capabilities, not identity: the divergences are real capability gaps, not
 * "is it Wayland" facts — e.g. the transparent-fullscreen-remap crash is a
 * virtio-gpu/Viz limitation, and per-pixel passthrough is an Electron-on-Linux
 * gap (electron#16777). Modelling them as `supportsTransparentFullscreenRemap`
 * is more honest and more future-proof than `IS_WAYLAND`, and lets a future
 * backend (KDE/KWin, headless CI) opt into the right behaviour by capability.
 *
 * Mirrors how Chromium Ozone, Qt QPA and SDL model platform differences:
 * detect once, express gaps as capability flags / stubs, branch on the
 * interface — "interfaces, not ifdefs".
 */

/**
 * @typedef {Object} PlatformCapabilities
 * @property {NodeJS.Platform} platform              'darwin' | 'win32' | 'linux' | ...
 * @property {boolean} isWayland                     native Wayland session (Linux + XDG_SESSION_TYPE=wayland; matches window-manager IS_WAYLAND)
 * @property {boolean} isWindows                     win32 host
 * @property {boolean} canRestackWindows             moveTop / setAlwaysOnTop relativeLevel actually reorders toplevels
 * @property {boolean} supportsPerPixelPassthrough   setIgnoreMouseEvents(true,{forward:true}) forwards events (false on Linux)
 * @property {boolean} supportsTransparentFullscreenRemap  a transparent fullscreen window can be hidden then re-shown reliably (false on Wayland: Mutter won't park such a surface, and re-mapping it crashes Viz on virtio-gpu — the worst case)
 * @property {boolean} supportsGlobalShortcuts       Electron globalShortcut can grab keys
 * @property {boolean} usesOnDemandWindows           controls are small on-demand windows (ball/panel/overlay) vs one persistent fullscreen window
 * @property {boolean} usesDesktopShortcut           drawing-mode toggle routes through a desktop (gsettings) keybinding instead of globalShortcut
 */

/**
 * Detect the host's capabilities. `env` is injectable for tests.
 *
 * @param {{ platform: NodeJS.Platform, env: Record<string, string | undefined> }} [env]
 * @returns {PlatformCapabilities}
 */
export function detectCapabilities(env = process) {
  const platform = env.platform;
  const isWindows = platform === 'win32';
  const isLinux = platform === 'linux';
  // Detection must match window-manager's IS_WAYLAND (XDG_SESSION_TYPE) EXACTLY
  // while that flag still exists, so the adapter selection can never disagree
  // with the remaining `if (IS_WAYLAND)` guards at the call sites. A fail-safe
  // that also treats a bare WAYLAND_DISPLAY as Wayland is deferred to the phase
  // that unifies ALL Wayland detection onto caps (applied once, consistently);
  // adding it here while IS_WAYLAND / IS_WAYLAND_SESSION still read XDG-only
  // would make guard and adapter diverge on a WAYLAND_DISPLAY-without-XDG host.
  const isWayland = isLinux && /wayland/i.test(env.env?.XDG_SESSION_TYPE || '');

  // On a Linux X11/Xorg session the classic desktop model works (globalShortcut,
  // cursor query, passthrough), so X11 follows the same capabilities as Mac/Win.
  return Object.freeze({
    platform,
    isWayland,
    isWindows,
    canRestackWindows: !isWayland,
    supportsPerPixelPassthrough: !isWayland,
    supportsTransparentFullscreenRemap: !isWayland,
    supportsGlobalShortcuts: !isWayland,
    usesOnDemandWindows: isWayland,
    usesDesktopShortcut: isWayland,
  });
}
