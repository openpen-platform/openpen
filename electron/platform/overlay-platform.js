/**
 * OverlayPlatform — the port (interface) that isolates the window / control-
 * surface lifecycle that diverges across platforms. The generic core depends on
 * this interface and never branches on platform identity; the single binding
 * decision lives in `createOverlayPlatform()` below (the composition root).
 *
 * This is the OpenPen analogue of Chromium's `OzonePlatform`, Qt's
 * `QPlatformIntegration`, SDL's video driver, and Tauri's `Runtime` trait:
 * one factory, two implementations (Standard for macOS/Windows/X11, Wayland for
 * native Wayland), platform chosen once.
 *
 * The interface is grown incrementally — each refactor phase moves one concern
 * (drawing-mode lifecycle, overlay creation, hotplug, settings, …) out of the
 * shared window-manager functions and onto this port. P1 establishes only the
 * boundary + capabilities; methods are added as concerns migrate.
 *
 * @typedef {Object} OverlayPlatform
 * @property {import('./platform-capabilities.js').PlatformCapabilities} caps
 *   Resolved-once capability set; the renderer and core query these instead of
 *   re-detecting the platform.
 * @property {(win: import('electron').BrowserWindow) => void} setClickThrough
 *   Make a window click-through in the platform-correct way (Mac/Win/X11 keep
 *   {forward:true}; Wayland uses a bare empty input region).
 * @property {(enabled: boolean, deps: object) => void} applyDrawingMode
 *   Apply a drawing-mode transition's overlay-lifecycle: Standard toggles the
 *   persistent overlay's passthrough + keeps the bar on top; Wayland runs the
 *   on-demand coordinator (deps.reconcileWayland). Each adapter reads only the
 *   deps it needs (activeOverlay/activeMain vs reconcileWayland).
 */

import { detectCapabilities } from './platform-capabilities.js';
import { StandardSurface } from './standard-surface.js';
import { WaylandSurface } from './wayland-surface.js';

/**
 * The ONE place the platform decision is made. Everything downstream takes the
 * returned OverlayPlatform by injection and must not branch on platform again.
 *
 * @param {{ platform: NodeJS.Platform, env: Record<string, string | undefined> }} [env]
 * @returns {OverlayPlatform}
 */
export function createOverlayPlatform(env = process) {
  const caps = detectCapabilities(env);
  return caps.usesOnDemandWindows ? new WaylandSurface(caps) : new StandardSurface(caps);
}
