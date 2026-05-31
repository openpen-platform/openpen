/**
 * TrayManager — system-tray icon and context menu for show/hide + settings.
 */

import { Tray, Menu, nativeImage, app } from 'electron';
import { t } from './i18n/index.js';

/** @type {Tray | null} */
let tray = null;

/** @type {boolean} Whether the main (control-bar) window is currently visible. */
let isMainVisible = true;

/** @type {boolean} Whether drawing mode is currently active — drives the toggle label. */
let isDrawingMode = false;

/**
 * Module-level reference to the last-built context-menu rebuild function.
 * Set by _buildContextMenu; cleared by destroyTray.
 * @type {(() => void) | null}
 */
let _rebuildContextMenu = null;

/** @type {import('electron').NativeImage | null} */
let _normalIcon = null;

/** @type {import('electron').NativeImage | null} */
let _drawingIcon = null;

// ── Icon rasterizer ────────────────────────────────────────────────────────

// SVG segment coordinates (24×24 viewBox) for the layers/stacked-cube tray icon.
// polygon = top diamond face; two polylines = middle and bottom edges.
const _SEGMENTS = [
  [12, 2,    22, 8.5 ],  // top face
  [22, 8.5,  12, 15  ],
  [12, 15,    2, 8.5 ],
  [ 2, 8.5,  12, 2   ],
  [ 2, 15,   12, 21.5],  // bottom edge
  [12, 21.5, 22, 15  ],
  [ 2, 11.5, 12, 18  ],  // middle edge
  [12, 18,   22, 11.5],
];

/**
 * Euclidean distance from (px,py) to the nearest point on segment (x1,y1)→(x2,y2).
 * @param {number} px @param {number} py
 * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
 * @returns {number}
 */
function _distToSeg(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-10) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Rasterize the layers icon into a raw BGRA buffer at the given pixel size.
 * White opaque pixels form the icon; transparent elsewhere.
 * Electron's nativeImage.createFromBuffer expects BGRA on macOS (white = [255,255,255,255]).
 *
 * @param {number} size - pixel dimensions (16 for @1x, 32 for @2x)
 * @returns {Buffer}
 */
function _rasterizeLayers(size) {
  const buf = Buffer.alloc(size * size * 4, 0);
  const scale = size / 24;
  const halfStroke = 1.05; // viewBox units; SVG stroke-width=2 → half=1, slight extra for small sizes
  const aaZone = 0.65;     // soft anti-aliasing band width (viewBox units)

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      // Sample at pixel centre, in viewBox coordinate space
      const sx = (px + 0.5) / scale;
      const sy = (py + 0.5) / scale;

      let minDist = Infinity;
      for (const [x1, y1, x2, y2] of _SEGMENTS) {
        const d = _distToSeg(sx, sy, x1, y1, x2, y2);
        if (d < minDist) minDist = d;
      }

      if (minDist <= halfStroke) {
        const i = (py * size + px) * 4;
        buf[i] = buf[i + 1] = buf[i + 2] = 255; // white (BGRA: B=G=R for white)
        buf[i + 3] = 255;
      } else if (minDist < halfStroke + aaZone) {
        const alpha = Math.round(((halfStroke + aaZone - minDist) / aaZone) * 255);
        const i = (py * size + px) * 4;
        buf[i] = buf[i + 1] = buf[i + 2] = 255;
        buf[i + 3] = alpha;
      }
    }
  }
  return buf;
}

/**
 * Paint an orange dot (#F97316) into the bottom-right corner of a raw bitmap.
 * Electron uses BGRA on macOS and RGBA on Win/Linux.
 *
 * @param {Buffer} bitmap @param {number} w @param {number} h
 * @returns {Buffer}
 */
function _overlayOrangeDot(bitmap, w, h) {
  const buf = Buffer.from(bitmap);
  // #F97316 = R:249 G:115 B:22 A:255
  const [c0, c1, c2, c3] = process.platform === 'darwin'
    ? [22, 115, 249, 255]   // BGRA
    : [249, 115, 22, 255];  // RGBA

  const radius = Math.round(w * 0.17); // 16→3px, 32→5px
  const cx = w - radius - 1;
  const cy = h - radius - 1;

  for (let y = Math.max(0, cy - radius); y <= Math.min(h - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(w - 1, cx + radius); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) {
        const i = (y * w + x) * 4;
        buf[i] = c0; buf[i + 1] = c1; buf[i + 2] = c2; buf[i + 3] = c3;
      }
    }
  }
  return buf;
}

/**
 * Build both tray icon states from rasterized layers icon pixels.
 * Uses createFromBuffer with scaleFactor:2 (32×32 → logical 16×16 @2x).
 *
 * @returns {{ normal: import('electron').NativeImage, drawing: import('electron').NativeImage }}
 */
function _buildIcons() {
  const buf32 = _rasterizeLayers(32);

  const normal = nativeImage.createFromBuffer(buf32, { width: 32, height: 32, scaleFactor: 2.0 });
  normal.setTemplateImage(true); // macOS adapts colour to menu-bar appearance

  const dot32 = _overlayOrangeDot(buf32, 32, 32);
  const drawing = nativeImage.createFromBuffer(dot32, { width: 32, height: 32, scaleFactor: 2.0 });

  return { normal, drawing };
}

// ── Manager ────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} TrayCallbacks
 * @property {() => void} onShowMain
 * @property {() => void} onHideMain
 * @property {() => void} onOpenSettings
 * @property {() => void} [onToggleDrawingMode]
 */

/**
 * @param {TrayCallbacks} callbacks
 */
export function initTrayManager(callbacks) {
  const { onShowMain, onHideMain, onOpenSettings, onToggleDrawingMode } = callbacks;

  // macOS: hide the Dock icon — the app is driven entirely from the tray.
  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  ({ normal: _normalIcon, drawing: _drawingIcon } = _buildIcons());

  tray = new Tray(_normalIcon);
  tray.setToolTip('OpenPen');

  _buildContextMenu(tray, { onShowMain, onHideMain, onOpenSettings, onToggleDrawingMode });
}

/**
 * Swap the tray icon to reflect drawing mode state, and rebuild the context
 * menu so the toggle label tracks the new state.
 *
 * The rebuild is deferred to a setImmediate task so it does NOT run inside the
 * original menu-item click handler. On Linux/GTK, calling
 * `tray.setContextMenu(newMenu)` while a click is still dispatching against the
 * old menu re-dispatches the click against the same screen row in the new menu
 * — landing on whichever item shifted into that row. Deferring breaks the
 * re-dispatch window so the click finishes cleanly first.
 *
 * @param {boolean} isDrawing
 */
export function setTrayDrawingMode(isDrawing) {
  if (!tray || tray.isDestroyed()) return;
  isDrawingMode = isDrawing;
  tray.setImage(isDrawing ? _drawingIcon : _normalIcon);
  setImmediate(() => {
    if (!tray || tray.isDestroyed()) return;
    _rebuildContextMenu?.();
  });
}

/**
 * Sync the hide/show menu label with the control bar's hidden state. Fired from
 * the window-manager barHidden listener so the label tracks the change whether
 * it came from the tray item or the toggleBar shortcut. Like setTrayDrawingMode,
 * the rebuild is deferred to break GTK's same-tick click re-dispatch.
 *
 * @param {boolean} hidden
 */
export function setTrayBarHidden(hidden) {
  if (!tray || tray.isDestroyed()) return;
  isMainVisible = !hidden;
  setImmediate(() => {
    if (!tray || tray.isDestroyed()) return;
    _rebuildContextMenu?.();
  });
}

/**
 * @param {import('electron').Tray} trayInstance
 * @param {TrayCallbacks} callbacks
 */
function _buildContextMenu(trayInstance, { onShowMain, onHideMain, onOpenSettings, onToggleDrawingMode }) {
  function rebuild() {
    /** @type {Electron.MenuItemConstructorOptions[]} */
    const template = [
      {
        label: isMainVisible ? t('tray.hideControlBar') : t('tray.showControlBar'),
        click: () => {
          // isMainVisible + the deferred rebuild are driven by setTrayBarHidden
          // (fired via the window-manager barHidden listener), so both the menu
          // click and the toggleBar shortcut keep the label in sync through one
          // path.
          if (isMainVisible) onHideMain();
          else onShowMain();
        },
      },
    ];

    // Drawing-mode toggle — UI fallback for entering drawing mode without the
    // keyboard accelerator. On Linux Wayland globalShortcut can't grab keys, so
    // this menu and the GNOME desktop keybinding are the entry points.
    if (onToggleDrawingMode) {
      template.push({
        label: isDrawingMode ? t('tray.exitDrawingMode') : t('tray.enterDrawingMode'),
        click: () => onToggleDrawingMode(),
      });
    }

    template.push(
      {
        label: t('tray.preferences'),
        click: () => onOpenSettings(),
      },
      { type: 'separator' },
      {
        label: t('tray.quit'),
        click: () => app.quit(),
      },
    );

    trayInstance.setContextMenu(Menu.buildFromTemplate(template));
  }

  _rebuildContextMenu = rebuild;
  rebuild();
}

/**
 * Rebuild the tray context menu with the current locale translations.
 * Call this after setLocale() to apply the new language to the tray labels.
 */
export function refreshTrayLocale() {
  if (_rebuildContextMenu) _rebuildContextMenu();
}

/**
 * @param {string} message
 */
export function setTrayWarning(message) {
  if (tray && !tray.isDestroyed()) {
    tray.setToolTip(message);
  }
}

/** Called on app-quit to release the tray icon. */
export function destroyTray() {
  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }
  _rebuildContextMenu = null;
}
