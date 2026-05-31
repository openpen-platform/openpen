/**
 * Desktop-session detection for the e2e suite — the SAME predicate the app uses
 * (electron/window-manager.js, electron/main.js) to choose its window model.
 *
 * OpenPen has two window models:
 *   - STANDARD (macOS / Windows / Linux-X11): floating ball ↔ expandable bar,
 *     draggable + edge-snap + pin, vbar layout, persistent fullscreen overlay
 *     (`?window=overlay`).
 *   - WAYLAND (native Wayland/GNOME): one persistent fixed-size always-shown bar
 *     window (`role=panel`), no ball; the overlay is on-demand (`role=overlay-bar`).
 *
 * Most specs assert standard-model behavior, so on a Wayland session they would
 * fail en masse (model mismatch, not real regressions). playwright.config.js uses
 * this flag to testIgnore the non-applicable specs per session, so a run on either
 * session is "green or a real failure" with no model-mismatch noise.
 *
 * Read at config-load time from the runner's env. The dual-session npm scripts
 * (`test:e2e:standard` / `test:e2e:wayland`) force `XDG_SESSION_TYPE` so both
 * window models can be exercised on a single Linux box (the standard path via
 * XWayland).
 *
 * Re-exported from the app's own predicate module so the test classifier can
 * NEVER drift from the window model the app actually selects.
 */
export { IS_WAYLAND_SESSION } from '../../electron/is-wayland-session.js';
