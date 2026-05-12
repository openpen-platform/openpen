/**
 * App Config — OpenPen
 *
 * Developer-facing Config-as-Code. User preferences live in the
 * settings store (see `electron/settings-store.js`).
 *
 * Usage:
 * 1) Restart the app after editing — hot reload is not supported.
 * 2) Only the keys defined here are honoured; unknown keys are
 *    dropped with a console warning.
 *
 * Validation rules: `electron/config-loader.js`.
 */

const appConfig = {
  ui: {
    settingsWindow: {
      /** Settings window background opacity. Range: 0.1 ~ 1.0. */
      opacity: 1,
    },

    eraser: {
      /**
       * Caret direction strategy for the eraser button.
       * - 'directional': follows the sub-panel expansion direction.
       * - 'down': always points down.
       */
      caretDirectionMode: 'directional',
    },

    popup: {
      /** Gap (px) between the trigger and the sub-panel border. Range: 0 ~ 64. */
      gapPx: 12,

      /** Safe margin (px) between the sub-panel and the window edge. Range: 0 ~ 64. */
      safeMarginPx: 8,

      /** Minimum arrow inset along the parallel axis (px); larger values push the arrow farther from the panel's rounded corners. Range: 0 ~ 64. */
      arrowInsetPx: 16,
    },
  },

  interaction: {
    drag: {
      /** Minimum displacement to count as a drag (px); smaller = more sensitive. Range: 0 ~ 40. */
      thresholdPx: 4,

      /** Snap-to-edge animation duration after release (ms). Range: 10 ~ 2000. */
      snapDurationMs: 250,

      /**
       * Delay (ms) before re-enabling click detection after a drag
       * ends. Reduces the chance of a stray click right after a drag.
       * Range: 0 ~ 1000.
       */
      dragEndDelayMs: 50,
    },
  },

  electron: {
    window: {
      /**
       * Main window `alwaysOnTop` level.
       * One of: 'normal' | 'floating' | 'torn-off-menu' | 'modal-panel' |
       *         'main-menu' | 'status' | 'pop-up-menu' | 'screen-saver'.
       */
      mainAlwaysOnTopLevel: 'screen-saver',

      /** Main window relative level (offset inside the same level). Range: 0 ~ 10. */
      mainAlwaysOnTopRelativeLevel: 1,

      /**
       * Overlay window `alwaysOnTop` level — normally kept at the
       * same level as the main window.
       * One of: 'normal' | 'floating' | 'torn-off-menu' | 'modal-panel' |
       *         'main-menu' | 'status' | 'pop-up-menu' | 'screen-saver'.
       */
      overlayAlwaysOnTopLevel: 'screen-saver',

      /** Overlay window relative level (offset inside the same level). Range: 0 ~ 10. */
      overlayAlwaysOnTopRelativeLevel: 0,
    },

    devtools: {
      /**
       * Enable auto-opening DevTools (dev workflow only). Takes
       * effect only when `ELECTRON_DEVTOOLS=1` is set (npm run dev).
       * When `false`, the three `open*` flags below have no effect.
       */
      enabled: false,

      /** Open DevTools on the main control-bar window (ball + toolbar). */
      openMainWindow: true,

      /** Open DevTools on the overlay window (full-screen transparent drawing layer). */
      openOverlayWindow: true,

      /** Open DevTools on the settings window. */
      openSettingsWindow: true,
    },
  },

  dev: {
    /**
     * Config validation policy:
     * - `true`: abort startup on invalid values (fail-fast).
     * - `false`: fall back to defaults and warn (default).
     */
    strictConfig: false,
  },
};

export default appConfig;
