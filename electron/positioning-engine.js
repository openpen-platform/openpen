/**
 * PositioningEngine — single authority for all ball/bar screen-space positioning.
 *
 * All positional transitions (drag, snap, summon, expand, clamp, display hotplug)
 * go through this module. No other module computes ball or window positions independently.
 *
 * The main window is workArea-sized per display. Ball position is expressed in
 * screen coordinates; viewport coords = ballScreenPos − workArea.origin.
 * Animation (snap, summon) runs in the renderer via CSS variable interpolation.
 */

import { screen } from 'electron';
import { POSITIONING } from './ipc-channels.js';
import {
  BALL_HALF,
  findDisplay,
  clampToWorkArea,
  calcSnap,
} from '../shared/positioning-math.js';

/** Snap animation duration (ms) — renderer animates CSS variable from prev to new. */
const SNAP_DURATION_MS = 250;
/** Summon animation duration (ms) — renderer animates CSS variable from prev to new. */
const SUMMON_DURATION_MS = 320;
/** Pre-expand clamp animation duration (ms) — renderer animates CSS variable. */
const EXPAND_CLAMP_DURATION_MS = 80;

// ─── Engine state ────────────────────────────────────────────────────────────

/**
 * @typedef {{ x: number; y: number }} ScreenPoint
 * @typedef {{ x: number; y: number; width: number; height: number }} ScreenRect
 * @typedef {{ id: number; bounds: ScreenRect; workArea: ScreenRect; scaleFactor: number }} DisplayInfo
 *
 * @typedef {'top' | 'right' | 'bottom' | 'left' | null} SnapEdge
 * @typedef {'horizontal' | 'vbar-left' | 'vbar-right' | 'vbar-free'} BarLayoutClass
 *
 * @typedef {{
 *   ballScreenPos: ScreenPoint;
 *   activeDisplayId: number;
 *   snapEdge: SnapEdge;
 *   barExpanded: boolean;
 *   barLayoutClass: BarLayoutClass;
 * }} PositioningState
 *
 * @typedef {{
 *   state: PositioningState;
 *   windowCommands: Array<{
 *     displayId: number;
 *     role: 'main' | 'overlay';
 *     windowScreenPos: ScreenPoint;
 *     visible: boolean;
 *   }>;
 *   animation?: {
 *     durationMs: number;
 *     easing: 'easeOutBack' | 'easeOutCubic' | 'linear';
 *     purpose: 'snap' | 'summon' | 'clamp' | 'expand-precompute' | 'display-change';
 *   };
 * }} PositioningOutput
 *
 * @typedef {{
 *   leftFromBall: number;
 *   rightFromBall: number;
 *   topFromBall: number;
 *   bottomFromBall: number;
 * }} BarBounds
 */

/** @type {PositioningState} */
const _state = {
  ballScreenPos: { x: 0, y: 0 },
  activeDisplayId: -1,
  snapEdge: null,
  barExpanded: false,
  barLayoutClass: 'horizontal',
};

/** Whether a drag is in progress (engine tracks this to guard concurrent intents). */
let _isDragging = false;

/** Returns all active per-display main windows — injected at init; used for state broadcasts. */
let _getAllMainWindows = () => [];

/** Notifies the window-manager of the active display id after each intent. */
let _setActiveDisplayId = (_id) => {};

/** Optional per-state hook (Linux: moves/show-hides the ball/panel windows). */
let _onStateChange = (_state) => {};

/** Serial intent queue — prevents concurrent state mutations. */
let _queue = Promise.resolve();

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** @returns {DisplayInfo[]} */
function _getAllDisplays() {
  return screen.getAllDisplays().map(({ id, bounds, workArea, scaleFactor }) => ({
    id, bounds, workArea, scaleFactor,
  }));
}

/**
 * Derive barLayoutClass from state fields.
 *
 * @param {SnapEdge} snapEdge
 * @returns {BarLayoutClass}
 */
function _deriveBarLayoutClass(snapEdge) {
  if (snapEdge === 'left')  return 'vbar-left';
  if (snapEdge === 'right') return 'vbar-right';
  return 'horizontal';
}

/**
 * Build the window position command for the active display.
 * The main window is workArea-sized and fixed, so windowScreenPos = workArea origin.
 *
 * @param {DisplayInfo} display
 */
function _buildWindowCommand(display) {
  return {
    displayId: display.id,
    role: 'main',
    windowScreenPos: {
      x: display.workArea.x,
      y: display.workArea.y,
    },
    visible: true,
  };
}

/**
 * Broadcast the new state (and optional animation hint) to all per-display
 * main-window renderers. Each renderer compares state.activeDisplayId against
 * its own displayId (from URL query) to decide whether to show or hide the bar.
 *
 * @param {PositioningState} state
 * @param {PositioningOutput['animation']} [animation]
 */
function _broadcastState(state, animation) {
  const payload = { state, animation: animation ?? null };
  for (const win of _getAllMainWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send(POSITIONING.STATE_CHANGED, payload);
    }
  }
  // Keep the window-manager's activeDisplayId in sync so it routes IPC
  // (drawing-mode, clear-canvas, history) to the correct display.
  _setActiveDisplayId(state.activeDisplayId);
  // Per-state hook: on Linux this moves the ball window and swaps ball/panel
  // visibility to match ballScreenPos + barExpanded.
  _onStateChange(state);
}

// ─── Intent handlers ──────────────────────────────────────────────────────────

/**
 * @param {{ persistedSnapEdge?: SnapEdge; persistedBallScreenPos?: ScreenPoint }} payload
 * @returns {PositioningOutput}
 */
function _handleInit({ persistedSnapEdge, persistedBallScreenPos } = {}) {
  const displays = _getAllDisplays();
  const primary = screen.getPrimaryDisplay();

  // Default: ball at workArea center of the primary display.
  let ballX = primary.workArea.x + primary.workArea.width  / 2;
  let ballY = primary.workArea.y + primary.workArea.height / 2;

  if (persistedBallScreenPos) {
    ballX = persistedBallScreenPos.x;
    ballY = persistedBallScreenPos.y;
  }

  const snapEdge = persistedSnapEdge ?? null;
  const display = findDisplay(ballX, ballY, displays);

  _state.ballScreenPos = { x: ballX, y: ballY };
  _state.activeDisplayId = display.id;
  _state.snapEdge = snapEdge;
  _state.barExpanded = false;
  _state.barLayoutClass = _deriveBarLayoutClass(snapEdge);

  const cmd = _buildWindowCommand(display);

  return {
    state: { ..._state },
    windowCommands: [cmd],
  };
}

/**
 * @returns {PositioningOutput}
 */
function _handleDragStart() {
  _isDragging = true;
  return {
    state: { ..._state },
    windowCommands: [],
  };
}

/**
 * @param {{ ballScreenPos: ScreenPoint }} payload
 * @returns {PositioningOutput}
 */
function _handleDragMove({ ballScreenPos }) {
  if (!ballScreenPos) return { state: { ..._state }, windowCommands: [] };

  const displays = _getAllDisplays();
  const display = findDisplay(ballScreenPos.x, ballScreenPos.y, displays);

  _state.ballScreenPos = { x: ballScreenPos.x, y: ballScreenPos.y };
  _state.activeDisplayId = display.id;

  // Window stays fixed at workArea origin; renderer updates CSS variables.
  const cmd = _buildWindowCommand(display);

  return {
    state: { ..._state },
    windowCommands: [cmd],
  };
}

/**
 * @param {{ ballScreenPos: ScreenPoint; hadMotion: boolean; enableDragAutoSnap: boolean; barBounds?: BarBounds | null; barLayoutClass?: BarLayoutClass | null }} payload
 * @returns {PositioningOutput}
 */
function _handleDragEnd({ ballScreenPos, hadMotion, enableDragAutoSnap, barBounds, barLayoutClass: intentBarLayoutClass }) {
  _isDragging = false;

  if (!hadMotion) {
    return { state: { ..._state }, windowCommands: [] };
  }

  const displays = _getAllDisplays();
  const { ballX: clampedX, ballY: clampedY, wasClamped } = clampToWorkArea(
    ballScreenPos.x, ballScreenPos.y, displays, barBounds ?? null
  );

  if (!enableDragAutoSnap) {
    _state.snapEdge = null;
    _state.ballScreenPos = { x: clampedX, y: clampedY };
    _state.barLayoutClass = _deriveBarLayoutClass(null);
    const display = findDisplay(clampedX, clampedY, displays);
    _state.activeDisplayId = display.id;
    const cmd = _buildWindowCommand(display);

    const output = { state: { ..._state }, windowCommands: [cmd] };
    if (wasClamped) {
      // Renderer animates ball CSS variable from drag position to clamped position.
      output.animation = { durationMs: SNAP_DURATION_MS, easing: 'easeOutBack', purpose: 'clamp' };
    }
    return output;
  }

  const ballForSnap = wasClamped ? { x: clampedX, y: clampedY } : ballScreenPos;
  const { edge, snapBallX, snapBallY } = calcSnap(ballForSnap.x, ballForSnap.y, displays);

  _state.snapEdge = edge;
  _state.ballScreenPos = { x: snapBallX, y: snapBallY };
  _state.barLayoutClass = _deriveBarLayoutClass(edge);
  const display = findDisplay(snapBallX, snapBallY, displays);
  _state.activeDisplayId = display.id;

  const cmd = _buildWindowCommand(display);

  return {
    state: { ..._state },
    windowCommands: [cmd],
    animation: { durationMs: SNAP_DURATION_MS, easing: 'easeOutBack', purpose: 'snap' },
  };
}

/**
 * @returns {PositioningOutput}
 */
function _handleSummonToCursor() {
  const cursor = screen.getCursorScreenPoint();
  const displays = _getAllDisplays();
  const { ballX, ballY, display } = clampToWorkArea(cursor.x, cursor.y, displays);

  _state.ballScreenPos = { x: ballX, y: ballY };
  _state.activeDisplayId = display.id;
  _state.snapEdge = null;
  _state.barLayoutClass = _deriveBarLayoutClass(null);

  const cmd = _buildWindowCommand(display);

  return {
    state: { ..._state },
    windowCommands: [cmd],
    animation: { durationMs: SUMMON_DURATION_MS, easing: 'easeOutCubic', purpose: 'summon' },
  };
}

/**
 * @param {{ barBounds?: BarBounds | null; barLayoutClass?: BarLayoutClass | null }} [payload]
 * @returns {PositioningOutput}
 */
function _handleBarExpand(payload) {
  const barBounds = payload?.barBounds ?? null;
  const displays = _getAllDisplays();

  let { x: ballX, y: ballY } = _state.ballScreenPos;
  let wasClamped = false;

  if (barBounds && ballX !== 0 && ballY !== 0) {
    const result = clampToWorkArea(ballX, ballY, displays, barBounds);
    ballX = result.ballX;
    ballY = result.ballY;
    wasClamped = result.wasClamped;
  }

  _state.barExpanded = true;
  _state.ballScreenPos = { x: ballX, y: ballY };
  const display = findDisplay(ballX, ballY, displays);
  _state.activeDisplayId = display.id;

  // Window position is fixed (workArea origin); renderer animates CSS variable if clamped.
  const cmd = _buildWindowCommand(display);

  const output = { state: { ..._state }, windowCommands: [cmd] };
  if (wasClamped) {
    output.animation = { durationMs: EXPAND_CLAMP_DURATION_MS, easing: 'linear', purpose: 'expand-precompute' };
  }
  return output;
}

/**
 * @returns {PositioningOutput}
 */
function _handleBarCollapse() {
  _state.barExpanded = false;
  return {
    state: { ..._state },
    windowCommands: [],
  };
}

/**
 * @returns {PositioningOutput}
 */
function _handleDisplayChanged() {
  const displays = _getAllDisplays();
  if (displays.length === 0) return { state: { ..._state }, windowCommands: [] };

  const prevX = _state.ballScreenPos.x;
  const prevY = _state.ballScreenPos.y;

  // Re-clamp ball to the active display's (or nearest) workArea.
  const { ballX, ballY, display } = (() => {
    const result = clampToWorkArea(
      _state.ballScreenPos.x,
      _state.ballScreenPos.y,
      displays,
      null
    );
    return { ballX: result.ballX, ballY: result.ballY, display: result.display };
  })();

  _state.ballScreenPos = { x: ballX, y: ballY };
  _state.activeDisplayId = display.id;

  // Build a window command for every known display: active display is visible,
  // all others are invisible. This lets the window-manager / renderer know
  // which display should render the bar UI.
  const windowCommands = displays.flatMap((d) => [
    {
      displayId: d.id,
      role: 'main',
      windowScreenPos: { x: d.workArea.x, y: d.workArea.y },
      visible: d.id === display.id,
    },
    {
      displayId: d.id,
      role: 'overlay',
      windowScreenPos: { x: d.workArea.x, y: d.workArea.y },
      visible: true, // overlays are always present (independent drawing canvases)
    },
  ]);

  const output = {
    state: { ..._state },
    windowCommands,
  };

  // When the topology change re-clamps the ball to a new position (e.g. an
  // external monitor is unplugged and the ball migrates to the primary
  // workArea), animate the move so it slides in like a drag-snap instead of
  // teleporting. Only emit the hint when the ball actually moved — an
  // unchanged position would otherwise drive a no-op 250ms interpolation.
  if (Math.abs(ballX - prevX) > 0.5 || Math.abs(ballY - prevY) > 0.5) {
    output.animation = {
      durationMs: SNAP_DURATION_MS,
      easing: 'easeOutCubic',
      purpose: 'display-change',
    };
  }

  return output;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Process a positioning intent. Intents are queued serially.
 *
 * @param {{ type: string; [key: string]: unknown }} intent
 * @returns {Promise<PositioningOutput>}
 */
function processIntent(intent) {
  _queue = _queue.then(() => {
    /** @type {PositioningOutput} */
    let output;

    switch (intent.type) {
      case 'init':             output = _handleInit(intent); break;
      case 'drag-start':       output = _handleDragStart(); break;
      case 'drag-move':        output = _handleDragMove(intent); break;
      case 'drag-end':         output = _handleDragEnd(intent); break;
      case 'summon-to-cursor': output = _handleSummonToCursor(); break;
      case 'bar-expand':       output = _handleBarExpand(intent); break;
      case 'bar-collapse':     output = _handleBarCollapse(); break;
      case 'display-changed':  output = _handleDisplayChanged(); break;
      default:
        output = { state: { ..._state }, windowCommands: [] };
    }

    _broadcastState(output.state, output.animation);
    return output;
  });
  return _queue;
}

/**
 * @returns {Readonly<PositioningState>}
 */
function getState() {
  return { ..._state };
}

/**
 * Initialise the positioning engine. Must be called after the first per-display
 * windows are created, before IPC handlers are wired.
 *
 * @param {{
 *   getAllMainWindows: () => import('electron').BrowserWindow[];
 *   setActiveDisplayId: (id: number) => void;
 * }} deps
 */
export function initPositioningEngine({ getAllMainWindows, setActiveDisplayId, onStateChange }) {
  _getAllMainWindows = getAllMainWindows;
  _setActiveDisplayId = setActiveDisplayId;
  if (onStateChange) _onStateChange = onStateChange;
}

export { processIntent, getState };
