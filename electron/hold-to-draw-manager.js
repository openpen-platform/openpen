/**
 * Hold-to-draw manager: polls the modifier keys every 16 ms while a hold key is
 * set (or the settings row is recording one), and hands the mouse to the
 * overlay while the key is held on its own. Owns the HOLD_TO_DRAW IPC.
 *
 * Polling, rather than a keyboard hook, needs no Accessibility or Input
 * Monitoring permission on macOS and also reads Fn, which a web page never
 * receives.
 */

import { BrowserWindow, ipcMain } from 'electron';
import log from 'electron-log/main.js';
import { HOLD_TO_DRAW } from './ipc-channels.js';
import { handleValidated } from './ipc-validation.js';
import { holdToDrawKeySchema } from './ipc-payload-schemas.js';
import { createNativeKeyReader } from './hold-key-native.js';
import { createHoldToDrawController } from './hold-to-draw-controller.js';
import { getHoldToDrawKey, setHoldToDrawKey } from './settings-store.js';
import { onShortcutsSuspendChange } from './shortcut-manager.js';
import { resolveHoldKey } from '../shared/hold-to-draw.js';

const POLL_MS = 16;

/** @type {ReturnType<typeof createHoldToDrawController> | null} */
let controller = null;
/** @type {ReturnType<typeof createNativeKeyReader>} */
let reader = null;
/** @type {ReturnType<typeof setInterval> | null} */
let timer = null;
let suspended = false;

/**
 * @param {{
 *   isDrawingMode: () => boolean,
 *   setHoldToDraw: (active: boolean) => void,
 * }} deps
 */
export function initHoldToDrawManager({ isDrawingMode, setHoldToDraw }) {
  reader = createNativeKeyReader();
  if (reader) {
    const activeReader = reader;
    controller = createHoldToDrawController({
      sample: () => activeReader.sample(),
      platform: process.platform,
      fnReadable: activeReader.fnReadable,
      getStoredKey: getHoldToDrawKey,
      isDrawingMode,
      // Shortcuts are suspended while the settings window is open or a
      // shortcut is being recorded; the hold key follows them.
      isSuspended: () => suspended,
      onStart: () => setHoldToDraw(true),
      onEnd: () => setHoldToDraw(false),
    });
    onShortcutsSuspendChange((s) => { suspended = s; });
    _syncPolling();
  }
  _registerIpcHandlers();
}

/** Release the mouse and stop polling (app quitting). */
export function shutdownHoldToDrawManager() {
  controller?.cancel();
  if (timer) clearInterval(timer);
  timer = null;
}

/** @returns {{ stored: string | null, key: string | null, fallback: boolean, supported: boolean }} */
function _status() {
  const stored = getHoldToDrawKey();
  if (!reader) return { stored, key: null, fallback: false, supported: false };
  const { key, fallback } = resolveHoldKey(stored, process.platform, { fnReadable: reader.fnReadable });
  return { stored, key, fallback, supported: true };
}

function _broadcast() {
  const status = _status();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(HOLD_TO_DRAW.UPDATED, status);
  }
}

/** Run the poll timer only while something needs it. */
function _syncPolling() {
  const wanted = controller?.wantsPolling() ?? false;
  if (wanted && !timer) {
    timer = setInterval(() => {
      try {
        controller?.tick();
      } catch (err) {
        log.warn('[hold-to-draw] poll failed, stopping:', err?.message);
        shutdownHoldToDrawManager();
      }
    }, POLL_MS);
    // Never keep the process alive just for this timer.
    timer.unref?.();
  } else if (!wanted && timer) {
    clearInterval(timer);
    timer = null;
  }
}

function _registerIpcHandlers() {
  ipcMain.handle(HOLD_TO_DRAW.GET, () => _status());

  handleValidated(ipcMain, HOLD_TO_DRAW.SET, holdToDrawKeySchema, (_event, { key }) => {
    setHoldToDrawKey(key);
    _syncPolling();
    _broadcast();
    return _status();
  }, { onInvalid: () => null });

  ipcMain.handle(HOLD_TO_DRAW.RECORD, async () => {
    if (!controller) return null;
    const recording = controller.startRecording();
    _syncPolling();
    const key = await recording;
    _syncPolling();
    return key;
  });

  ipcMain.on(HOLD_TO_DRAW.CANCEL_RECORD, () => {
    controller?.finishRecording(null);
    _syncPolling();
  });
}
