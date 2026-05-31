/**
 * Single source of truth for "is this a native Wayland session" — the predicate
 * that selects OpenPen's Wayland window model (window-manager.js) and Chromium's
 * ozone backend (main.js). The e2e suite imports the SAME constant
 * (tests/e2e/session.js) so spec selection can't drift from the app's actual
 * window model.
 *
 * Pure — no Electron import — so the Playwright config / Node test runner can
 * import it. Read once at module load: the window model and ozone backend are
 * decided at startup, so a single load-time read is the correct granularity.
 *
 * Known limitation (pre-existing, tracked separately): keys off XDG_SESSION_TYPE
 * only, not WAYLAND_DISPLAY — a launch with WAYLAND_DISPLAY set but
 * XDG_SESSION_TYPE missing would fall to the standard path. Centralising the
 * predicate here is the prerequisite for fixing that in one place.
 */
export const IS_WAYLAND_SESSION =
  process.platform === 'linux' && /wayland/i.test(process.env.XDG_SESSION_TYPE || '');
