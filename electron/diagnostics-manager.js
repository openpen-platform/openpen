/**
 * DiagnosticsManager — sidecar corruption-event log.
 *
 * Maintains <userData>/diagnostics.json independently of config.json so that
 * an L1 full-reset does not wipe the corruption history. Each corruption event
 * (L1 JSON-parse failure, L2 schema failure, L3b heavy ghost trim) is appended
 * here together with the path of the pre-reset backup copy.
 *
 * The sidecar is always read fresh on init and written atomically (.tmp → rename).
 * If the sidecar itself is missing or unparseable it is silently reset to an
 * empty event list — no recursive backup of the diagnostics file.
 */

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DIAGNOSTICS } from './ipc-channels.js';
import { fsyncDir } from './fs-utils.js';

// ── Types (JSDoc) ─────────────────────────────────────────────────────────────
/**
 * @typedef {{ id: string; layer: 'L1'|'L2'|'L3b'; backupPath: string; detectedAt: string; acknowledgedAt: string|null }} DiagnosticsEvent
 * @typedef {{ events: DiagnosticsEvent[] }} DiagnosticsState
 */

/** Maximum number of events retained. */
const MAX_EVENTS = 10;

/** @type {DiagnosticsState} */
let state = { events: [] };

/** @returns {string} Path to diagnostics.json in userData. */
function getDiagnosticsPath() {
  return path.join(app.getPath('userData'), 'diagnostics.json');
}

/**
 * Hydrate state from disk. Silently resets to empty on any error.
 */
function loadState() {
  const filePath = getDiagnosticsPath();
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.events)) {
        state = { events: parsed.events };
        return;
      }
    }
  } catch (_) {
    // Silent reset — do not recursively backup diagnostics.json itself.
  }
  state = { events: [] };
}

/**
 * Atomically persist state to diagnostics.json (.tmp → rename).
 */
function persistState() {
  const filePath = getDiagnosticsPath();
  const tmpPath = filePath + '.tmp';
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const data = JSON.stringify(state, null, 2);
    const fd = fs.openSync(tmpPath, 'w');
    try {
      fs.writeSync(fd, data, 0, 'utf-8');
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmpPath, filePath);
    fsyncDir(path.dirname(filePath));
  } catch (e) {
    console.error('[DiagnosticsManager] Failed to write diagnostics.json:', e.message);
    try { fs.unlinkSync(tmpPath); } catch (_) { /* ignore */ }
  }
}

/**
 * Broadcast the current state to all live renderer windows.
 */
function broadcastState() {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(DIAGNOSTICS.STATE_CHANGED, { events: state.events });
    }
  }
}

/**
 * Generate a unique event id without external dependencies.
 * Uses millisecond timestamp + 4 random bytes → e.g. "1746300000000-a1b2c3d4".
 * @returns {string}
 */
function generateId() {
  try {
    return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  } catch (_) {
    // Fallback: pure timestamp + Math.random for environments where crypto is restricted.
    return `${Date.now()}-${Math.floor(Math.random() * 0xffffffff).toString(16)}`;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise the manager: hydrate state from disk and register IPC handlers.
 * Must be called before initSettingsStore() so recordDiagnosticsEvent calls
 * during readConfig() land on an already-initialised manager.
 */
export function initDiagnosticsManager() {
  loadState();

  ipcMain.handle(DIAGNOSTICS.GET_STATE, () => getDiagnosticsState());

  ipcMain.handle(DIAGNOSTICS.ACKNOWLEDGE, (_, id) => {
    acknowledgeDiagnosticsEvent(id);
  });

  ipcMain.handle(DIAGNOSTICS.OPEN_BACKUP_DIR, (_, backupPath) => {
    if (typeof backupPath === 'string') {
      shell.showItemInFolder(backupPath);
    }
  });
}

/**
 * Return a read-only snapshot of the current diagnostics state.
 * @returns {DiagnosticsState}
 */
export function getDiagnosticsState() {
  return { events: [...state.events] };
}

/**
 * Append a new corruption event, persist, and broadcast.
 * Safe to call before initDiagnosticsManager() — in that case the event is
 * still written to the in-memory state and will be persisted on the next
 * persist call (init loads from disk first, so a true pre-init call loses
 * the event; prefer calling initDiagnosticsManager first).
 * @param {'L1'|'L2'|'L3b'} layer
 * @param {string} backupPath
 */
export function recordDiagnosticsEvent(layer, backupPath) {
  /** @type {DiagnosticsEvent} */
  const event = {
    id: generateId(),
    layer,
    backupPath,
    detectedAt: new Date().toISOString(),
    acknowledgedAt: null,
  };

  // Newest-first; cap at MAX_EVENTS.
  state.events.unshift(event);
  if (state.events.length > MAX_EVENTS) {
    state.events = state.events.slice(0, MAX_EVENTS);
  }

  persistState();
  broadcastState();
}

/**
 * Mark a specific event as acknowledged. No-op for unknown ids.
 * @param {string} id
 */
export function acknowledgeDiagnosticsEvent(id) {
  const event = state.events.find((e) => e.id === id);
  if (!event) return;
  event.acknowledgedAt = new Date().toISOString();
  persistState();
  broadcastState();
}
