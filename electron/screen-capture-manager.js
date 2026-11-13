/**
 * Screen capture — grabs the display under the cursor and hands the image to a
 * sink (PNG file or clipboard).
 *
 * What you see is what you get: the overlay stays visible while the capture
 * runs, so strokes, whiteboard backgrounds and HTML annotation layers land in
 * the image exactly as drawn. Only host chrome is hidden for the duration (the
 * control bar, notification toasts, the custom cursor, the settings window) so
 * the picture shows the user's content, not OpenPen's controls.
 *
 * `captureDisplayImage()` is the reusable core: it returns the raw image plus
 * the display it came from, so a future magnifier or recorder can build on it
 * without going through the save / copy sinks. Pass `includeAnnotations: false`
 * to get the bare screen with the overlay hidden as well.
 *
 * All Electron dependencies are injected so the logic is unit-testable.
 */

import path from 'node:path';
import fsPromises from 'node:fs/promises';
import { app, BrowserWindow, clipboard, desktopCapturer, ipcMain, screen, shell, systemPreferences } from 'electron';
import { CAPTURE } from './ipc-channels.js';
import { log } from './logger.js';
import { handleValidated } from './ipc-validation.js';
import { captureTargetSchema } from './ipc-payload-schemas.js';

/** Time for the compositor to present the hidden-chrome frame before grabbing it. */
const SETTLE_MS = 120;

const PERMISSION_PANE_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

/** CSS applied to windows that are entirely host chrome. */
const HIDE_WINDOW_CSS = 'html { visibility: hidden !important; }';
/** CSS applied to overlay windows: hide only the marked chrome, keep annotations. */
const HIDE_CHROME_CSS = '[data-capture-exclude] { visibility: hidden !important; }';

const NEXT_FRAMES_JS = 'new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))';

/**
 * A global shortcut is broadcast to every window, and each one asks for a
 * capture. Requests of the same target inside this span count as one.
 */
const DUPLICATE_REQUEST_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** `OpenPen-2026-11-11-153045.png` in local time. */
export function formatCaptureFileName(date) {
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `OpenPen-${stamp}.png`;
}

/**
 * Pick the desktopCapturer source that belongs to `display`. Falls back to
 * the display's position in the list when the platform reports no display ids
 * (older X11 stacks).
 */
export function pickSourceForDisplay(sources, display, allDisplays) {
  const byId = sources.find((s) => s.display_id && String(s.display_id) === String(display.id));
  if (byId) return byId;
  if (sources.some((s) => s.display_id)) return null;
  const index = allDisplays.findIndex((d) => d.id === display.id);
  return index >= 0 ? sources[index] ?? null : null;
}

/**
 * @param {object} deps
 * @param {Electron.Screen} deps.screen
 * @param {Electron.DesktopCapturer} deps.desktopCapturer
 * @param {{ getMediaAccessStatus: (media: string) => string } | null} deps.systemPreferences
 * @param {Pick<Electron.Clipboard, 'writeImage'>} deps.clipboard
 * @param {{ mkdir: Function, writeFile: Function }} deps.fs
 * @param {NodeJS.Platform} deps.platform
 * @param {boolean} deps.supported  false where the platform forbids reading the screen (Wayland)
 * @param {() => string} deps.getSaveDir
 * @param {() => { chrome: Electron.BrowserWindow[], overlays: Electron.BrowserWindow[] }} deps.getWindows
 * @param {() => Date} [deps.now]
 * @param {(ms: number) => Promise<void>} [deps.sleep]
 */
export function createScreenCapture(deps) {
  const now = deps.now ?? (() => new Date());
  const wait = deps.sleep ?? sleep;
  let busy = false;
  let lastRequest = { target: '', at: -Infinity };

  /** @param {Electron.BrowserWindow} win */
  const alive = (win) => win && !win.isDestroyed();

  async function hideChrome(includeAnnotations) {
    const { chrome, overlays } = deps.getWindows();
    /** @type {Array<{ win: Electron.BrowserWindow, key: string }>} */
    const inserted = [];
    const targets = [
      ...chrome.map((win) => ({ win, css: HIDE_WINDOW_CSS })),
      ...overlays.map((win) => ({ win, css: includeAnnotations ? HIDE_CHROME_CSS : HIDE_WINDOW_CSS })),
    ];
    async function restore() {
      for (const { win, key } of inserted) {
        if (!alive(win)) continue;
        try { await win.webContents.removeInsertedCSS(key); } catch { /* window closing */ }
      }
    }
    try {
      for (const { win, css } of targets) {
        if (!alive(win)) continue;
        try {
          inserted.push({ win, key: await win.webContents.insertCSS(css) });
        } catch (err) {
          log.warn('[capture] insertCSS failed:', err);
        }
      }
      // Two animation frames in every window so the hidden state has been painted.
      await Promise.all(inserted.map(({ win }) => alive(win)
        ? win.webContents.executeJavaScript(NEXT_FRAMES_JS).catch(() => undefined)
        : undefined));
      await wait(SETTLE_MS);
    } catch (err) {
      // Never leave the control bar hidden because the settle step failed.
      await restore();
      throw err;
    }
    return restore;
  }

  /**
   * Capture the display under the cursor.
   * @param {{ includeAnnotations?: boolean }} [opts]
   * @returns {Promise<{ ok: true, image: Electron.NativeImage, display: Electron.Display } | { ok: false, error: 'permission-denied' | 'unsupported' | 'busy' | 'failed' }>}
   */
  async function captureDisplayImage({ includeAnnotations = true } = {}) {
    if (!deps.supported) return { ok: false, error: 'unsupported' };
    if (busy) return { ok: false, error: 'busy' };
    busy = true;
    let restore = null;
    try {
      const display = deps.screen.getDisplayNearestPoint(deps.screen.getCursorScreenPoint());
      const size = {
        width: Math.round(display.size.width * display.scaleFactor),
        height: Math.round(display.size.height * display.scaleFactor),
      };

      // macOS refuses to hand over other apps' pixels without the Screen
      // Recording grant. Asking for sources once also registers the app in the
      // System Settings list, which is the only way it shows up there.
      if (deps.platform === 'darwin' && deps.systemPreferences?.getMediaAccessStatus('screen') !== 'granted') {
        await deps.desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } }).catch(() => []);
        return { ok: false, error: 'permission-denied' };
      }

      restore = await hideChrome(includeAnnotations);
      const sources = await deps.desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
      await restore();
      restore = null;

      const source = pickSourceForDisplay(sources, display, deps.screen.getAllDisplays());
      if (!source || source.thumbnail.isEmpty()) return { ok: false, error: 'failed' };
      return { ok: true, image: source.thumbnail, display };
    } catch (err) {
      log.error('[capture] failed:', err);
      return { ok: false, error: 'failed' };
    } finally {
      if (restore) await restore();
      busy = false;
    }
  }

  /** @param {'save' | 'copy'} target */
  async function capture(target) {
    if (target !== 'save' && target !== 'copy') return { ok: false, error: 'failed' };
    const stamp = now().getTime();
    if (lastRequest.target === target && stamp - lastRequest.at < DUPLICATE_REQUEST_MS) {
      return { ok: false, error: 'busy' };
    }
    lastRequest = { target, at: stamp };
    const result = await captureDisplayImage();
    if (!result.ok) return result;
    try {
      if (target === 'copy') {
        deps.clipboard.writeImage(result.image);
        return { ok: true, target };
      }
      const dir = deps.getSaveDir();
      await deps.fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, formatCaptureFileName(now()));
      await deps.fs.writeFile(file, result.image.toPNG());
      return { ok: true, target, path: file };
    } catch (err) {
      log.error('[capture] sink failed:', err);
      return { ok: false, error: 'failed' };
    }
  }

  return { capture, captureDisplayImage };
}

/**
 * The control bar lives in a window without a toast layer, so a capture it
 * asked for would finish with no visible confirmation. Hand the outcome to the
 * overlay windows, which own the toast layer. A request from an overlay
 * (the global shortcuts) already shows its own toast, and `busy` and
 * `permission-denied` are answered in the asking window, so none of those relay.
 *
 * @param {Electron.WebContents} sender
 * @param {'save' | 'copy'} target
 * @param {{ ok: boolean, error?: string }} result
 * @param {Electron.BrowserWindow[]} overlays
 */
export function relayResultToOverlays(sender, target, result, overlays) {
  if (!result.ok && result.error !== 'unsupported' && result.error !== 'failed') return;
  if (overlays.some((win) => !win.isDestroyed() && win.webContents === sender)) return;
  for (const win of overlays) {
    if (!win.isDestroyed()) win.webContents.send(CAPTURE.RESULT, { target, result });
  }
}

/**
 * Wire the real Electron objects and register the IPC handlers.
 *
 * @param {{
 *   getAllOverlayWindows: () => Electron.BrowserWindow[],
 *   supported: boolean,
 * }} opts
 */
export function initScreenCaptureManager({ getAllOverlayWindows, supported }) {
  const service = createScreenCapture({
    screen,
    desktopCapturer,
    systemPreferences,
    clipboard,
    fs: fsPromises,
    platform: process.platform,
    supported,
    getSaveDir: () => path.join(app.getPath('pictures'), 'OpenPen'),
    getWindows: () => {
      const overlays = getAllOverlayWindows();
      const overlaySet = new Set(overlays);
      const chrome = BrowserWindow.getAllWindows().filter((w) => !overlaySet.has(w));
      return { chrome, overlays };
    },
  });

  handleValidated(ipcMain, CAPTURE.REQUEST, captureTargetSchema, async (event, target) => {
    const result = await service.capture(target);
    relayResultToOverlays(event.sender, target, result, getAllOverlayWindows());
    return result;
  }, {
    onInvalid: () => ({ ok: false, error: 'failed' }),
  });
  ipcMain.handle(CAPTURE.OPEN_PERMISSION_SETTINGS, async () => {
    if (process.platform !== 'darwin') return;
    await shell.openExternal(PERMISSION_PANE_URL);
  });
  return service;
}
