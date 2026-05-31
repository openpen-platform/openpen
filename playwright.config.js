import { defineConfig } from '@playwright/test';
import { IS_WAYLAND_SESSION } from './tests/e2e/session.js';

// Specs whose window-model assumptions are session-specific. The `functional`
// project testIgnores the set that can't pass on the current session, so a run is
// "green or a real failure" with no model-mismatch noise. See tests/e2e/session.js.
//
// WAYLAND_ONLY: asserts the Wayland always-bar / on-demand-overlay model.
// STANDARD_ONLY: asserts the ball / expand-collapse / drag-snap / vbar /
//   fullscreen-`?window=overlay` model, OR uses shared helpers (getMainWindow /
//   expandControlBar / getOverlayWindow) that click the ball or look for the
//   persistent overlay — neither exists on Wayland.
// Specs in NEITHER list are session-agnostic and run on both.
// prod-smoke is excluded from `functional` entirely (it needs a prod build and is
// its own gate — see the `prod-smoke` project); it self-skips on Wayland inline.
const PROD_SMOKE = '**/prod-smoke.spec.js';

const WAYLAND_ONLY = [
  '**/control-bar/wayland-always-bar.spec.js',
  '**/control-bar/wayland-stroke-gate.spec.js',
];

const STANDARD_ONLY = [
  // NOTE: app/lifecycle.spec.js is session-agnostic except for ONE opacity-dim
  // test, which carries its own inline IS_WAYLAND_SESSION skip — so the file
  // stays in `functional` on both sessions for its IPC/tray/lifecycle coverage.
  '**/app/settings.spec.js',
  '**/control-bar/ball-screen-pos.spec.js',
  '**/control-bar/bar-bounds-stale.spec.js',
  '**/control-bar/clear-canvas-confirm.spec.js',
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
  '**/drawing/drawing-mode-visual.spec.js',
  '**/drawing/overlay.spec.js',
  '**/drawing/persisted-defaults.spec.js',
  '**/drawing/tools.spec.js',
  '**/drawing/undo-redo.spec.js',
  '**/modules-tab/disabled-module-metadata.spec.js',
  '**/modules-tab/disable-module.spec.js',
  '**/notifications/drawing-mode-hud.spec.js',
  '**/notifications/i18n-hud.spec.js',
  '**/plugins-tab/marketplace.spec.js',
  '**/plugins-tab/plugin-id-conflict.spec.js',
  '**/ui/popup-anchor.spec.js',
  '**/ui/stroke-style.spec.js',
];

export default defineConfig({
  workers: 1,
  testDir: './tests/e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'tests/e2e/report' }]],

  // globalSetup boots Vite programmatically so the port is whatever's free,
  // mirroring scripts/dev.mjs in production. The resolved URL is exposed via
  // OPENPEN_E2E_VITE_URL and consumed by tests/e2e/launch.js. Replaces the
  // prior `webServer: { command: 'npx vite', url: 'http://localhost:5173' }`
  // setup, which broke when 5173 was already taken by another local project.
  globalSetup: './tests/e2e/global-setup.js',

  use: {
    screenshot: 'only-on-failure',
    video: 'off',
  },

  projects: [
    {
      // The functional suite. testIgnore drops the specs that can't pass on the
      // current session (forced via XDG_SESSION_TYPE by the test:e2e:* scripts).
      name: 'functional',
      testMatch: '**/*.spec.js',
      testIgnore: [PROD_SMOKE, ...(IS_WAYLAND_SESSION ? STANDARD_ONLY : WAYLAND_ONLY)],
    },
    {
      // Prod-build smoke gate (its own `test:prod-smoke` script + dist:* pipeline).
      // Needs `npm run build` first; self-skips on Wayland (standard-model).
      name: 'prod-smoke',
      testMatch: PROD_SMOKE,
    },
  ],
});
