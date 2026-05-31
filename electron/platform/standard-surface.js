/**
 * StandardSurface — the OverlayPlatform implementation for macOS, Windows and
 * Linux/X11: one persistent fullscreen always-on-top window per display, with
 * per-pixel passthrough and a globalShortcut-driven toggle. This is the model
 * that worked before the Wayland divergence.
 *
 * Methods are added here (mirroring WaylandSurface) as each concern migrates off
 * the shared window-manager functions in later refactor phases. P1: holds only
 * the resolved capabilities.
 *
 * @implements {import('./overlay-platform.js').OverlayPlatform}
 */
export class StandardSurface {
  /** @param {import('./platform-capabilities.js').PlatformCapabilities} caps */
  constructor(caps) {
    /** @type {import('./platform-capabilities.js').PlatformCapabilities} */
    this.caps = caps;
  }

  /**
   * Make a window click-through. Keep `{forward:true}` so the renderer's hover
   * guard still receives forwarded mousemove events.
   * @param {import('electron').BrowserWindow} win
   */
  setClickThrough(win) {
    if (win.isDestroyed()) return;
    win.setIgnoreMouseEvents(true, { forward: true });
  }

  /**
   * Apply a drawing-mode transition to the persistent overlay: capture input
   * while drawing, restore click-through on exit, and keep the control-bar
   * window on top so it stays interactive during drawing.
   * @param {boolean} enabled
   * @param {{ activeOverlay?: import('electron').BrowserWindow, activeMain?: import('electron').BrowserWindow }} deps
   */
  applyDrawingMode(enabled, { activeOverlay, activeMain }) {
    if (!activeOverlay || activeOverlay.isDestroyed()) return;
    if (enabled) activeOverlay.setIgnoreMouseEvents(false);
    else this.setClickThrough(activeOverlay);
    if (activeMain && !activeMain.isDestroyed()) activeMain.moveTop();
  }
}
