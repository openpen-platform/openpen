// Specs whose window-model assumptions are session-specific. The `functional`
// project testIgnores the set that can't pass on the current session, so a run is
// "green or a real failure" with no model-mismatch noise. See session.js.
//
// WAYLAND_ONLY: asserts the Wayland always-bar / on-demand-overlay model.
// STANDARD_ONLY: asserts the ball / expand-collapse / drag-snap / vbar /
//   fullscreen-`?window=overlay` model, OR uses shared helpers (getMainWindow /
//   expandControlBar / getOverlayWindow) that click the ball or look for the
//   persistent overlay — neither exists on Wayland.
// Specs in NEITHER list are session-agnostic and run on both.
// prod-smoke is excluded from `functional` entirely (it needs a prod build and is
// its own gate — see the `prod-smoke` project); it self-skips on Wayland inline.
export const PROD_SMOKE = '**/prod-smoke.spec.js';

export const WAYLAND_ONLY = [
  '**/control-bar/wayland-always-bar.spec.js',
  '**/control-bar/wayland-stroke-gate.spec.js',
];

export const STANDARD_ONLY = [
  // NOTE: app/lifecycle.spec.js is session-agnostic except for ONE opacity-dim
  // test, which carries its own inline IS_WAYLAND_SESSION skip — so the file
  // stays in `functional` on both sessions for its IPC/tray/lifecycle coverage.
  '**/app/settings.spec.js',
  '**/settings/layout-tab.spec.ts',
  '**/control-bar/ball-screen-pos.spec.js',
  '**/control-bar/bar-bounds-stale.spec.js',
  '**/control-bar/clear-canvas-confirm.spec.js',
  '**/screen-capture/capture-button.spec.js',
  '**/control-bar/collapse.spec.js',
  '**/control-bar/dialog-pauses-collapse.spec.js',
  '**/control-bar/drag-auto-snap-toggle.spec.js',
  '**/control-bar/drag-handle-anchor.spec.js',
  '**/control-bar/drag-snap.spec.js',
  '**/control-bar/drawing-mode-zorder.win.spec.js',
  '**/control-bar/layout-repair.spec.js',
  '**/control-bar/layout.spec.js',
  '**/control-bar/matrix-coverage.spec.js',
  '**/control-bar/multi-display.spec.js',
  '**/control-bar/p1-1-cold-start.spec.js',
  '**/control-bar/popup-bounds.spec.js',
  '**/control-bar/settings-btn-drawing-mode.spec.js',
  '**/control-bar/stroke-slider-vbar-direction.spec.js',
  '**/control-bar/tooltip-near-top.spec.js',
  '**/dev-only/inspect-dialog-height.spec.js',
  '**/dev-only/repro-color-mode-save.spec.js',
  '**/drawing/canvas.spec.js',
  '**/drawing/cursor-dom.spec.js',
  '**/drawing/drawing-hotkeys.spec.js',
  '**/drawing/drawing-mode-visual.spec.js',
  '**/drawing/overlay.spec.js',
  '**/drawing/persisted-defaults.spec.js',
  '**/drawing/tools.spec.js',
  '**/drawing/undo-redo.spec.js',
  '**/modules-tab/disabled-module-metadata.spec.js',
  '**/modules-tab/disable-module.spec.js',
  '**/notifications/drawing-mode-hud.spec.js',
  '**/notifications/i18n-hud.spec.js',
  '**/plugins-tab/dialog-focus.spec.js',
  '**/plugins-tab/dialog-escape-layering.spec.js',
  '**/plugins-tab/marketplace.spec.js',
  '**/plugins-tab/plugin-id-conflict.spec.js',
  '**/ui/popup-anchor.spec.js',
  '**/ui/stroke-style.spec.js',
];

// CI_STABLE: functional specs gated on every PR, run under Xvfb on Linux X11 by
// `npm run test:e2e:ci`. A spec is listed only when every test in it passed in
// every one of repeated Linux X11 runs. Specs that assert window-manager
// geometry (work-area coverage, edge snapping, drag anchoring) or need multiple
// displays fail under a bare Xvfb server and stay out. Paths are relative to
// tests/e2e.
export const CI_STABLE = [
  'app/renderer-ready-watchdog.spec.js',
  'app/settings-content-ready-race.spec.js',
  'app/settings.spec.js',
  'control-bar/ball-screen-pos.spec.js',
  'control-bar/clear-canvas-confirm.spec.js',
  'control-bar/collapse.spec.js',
  'control-bar/dialog-pauses-collapse.spec.js',
  'control-bar/drag-auto-snap-toggle.spec.js',
  'control-bar/layout-repair.spec.js',
  'control-bar/settings-btn-drawing-mode.spec.js',
  'control-bar/tooltip-near-top.spec.js',
  'drawing/canvas.spec.js',
  'drawing/cursor-dom.spec.js',
  'drawing/drawing-mode-visual.spec.js',
  'drawing/overlay.spec.js',
  'drawing/persisted-defaults.spec.js',
  'drawing/tools.spec.js',
  'drawing/undo-redo.spec.js',
  'modules-tab/disable-module.spec.js',
  'modules-tab/disabled-module-metadata.spec.js',
  'notifications/drawing-mode-hud.spec.js',
  'notifications/i18n-hud.spec.js',
  'plugins-tab/marketplace.spec.js',
  'plugins-tab/plugin-id-conflict.spec.js',
  'plugins-tab/plugin-renderer-import.spec.js',
  'settings/layout-tab.spec.ts',
  'settings/module-settings-zod4.spec.js',
  'ui/popup-anchor.spec.js',
  'ui/stroke-style.spec.js',
];
