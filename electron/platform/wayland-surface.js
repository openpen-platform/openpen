/**
 * WaylandSurface — the OverlayPlatform implementation for native Wayland/Mutter:
 * small on-demand windows (ball / panel / overlay) with the control bar rendered
 * inside the overlay during drawing, a single window-set coordinator, and a
 * gsettings desktop keybinding for the toggle. Encapsulates the Mutter/virtio-gpu
 * limitations (no restack, no per-pixel passthrough, no fullscreen re-map) so the
 * core never has to know about them. See memory: wayland-window-coordinator.
 *
 * Methods are added here (mirroring StandardSurface) as each concern migrates off
 * the shared window-manager functions in later refactor phases. P1: holds only
 * the resolved capabilities.
 *
 * @implements {import('./overlay-platform.js').OverlayPlatform}
 */
export class WaylandSurface {
  /** @param {import('./platform-capabilities.js').PlatformCapabilities} caps */
  constructor(caps) {
    /** @type {import('./platform-capabilities.js').PlatformCapabilities} */
    this.caps = caps;
  }

  /**
   * Make a window click-through. A bare `setIgnoreMouseEvents(true)` sets an
   * empty wl_surface input region, which Mutter honours — clicks fall through to
   * the desktop beneath. `{forward:true}` is unimplemented on Linux (electron
   * #16777), so it is deliberately omitted.
   * @param {import('electron').BrowserWindow} win
   */
  setClickThrough(win) {
    if (win.isDestroyed()) return;
    win.setIgnoreMouseEvents(true);
  }

  /**
   * Apply a drawing-mode transition on Wayland: the overlay is created/destroyed
   * on demand, so delegate to the injected coordinator callback (collapse the
   * bar + reconcile the window set). The fresh overlay learns drawing mode via
   * its own did-finish-load, so nothing is broadcast here.
   * @param {boolean} _enabled — unused; reconcile reads the authoritative flag
   * @param {{ reconcileWayland: () => void }} deps
   */
  applyDrawingMode(_enabled, { reconcileWayland }) {
    reconcileWayland();
  }
}
