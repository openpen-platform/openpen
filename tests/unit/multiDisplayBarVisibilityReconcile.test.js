/**
 * Verifies that bar visibility is a per-display derived state of the single
 * global `barHidden` flag (issue #50). Each display owns its own transparent
 * fullscreen control-bar window; they MUST hide/show together so toggling the
 * bar, switching the active display, or hot-plugging a monitor never lets one
 * display drift out of sync with the others.
 *
 * Core invariant under test: hide/show/active-switch/hotplug all reconcile
 * EVERY per-display window to `barHidden`, not just the active display's window.
 *
 * Assertions observe each individual mock window's show()/hide() calls (and its
 * resulting isVisible() state), never just that a coordinator function ran.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Force the non-Wayland (standard) path so reconcileStandardBarWindows runs
// instead of reconcileLinuxWindows, regardless of the host session type.
// vi.hoisted runs before the window-manager import that reads XDG_SESSION_TYPE.
vi.hoisted(() => { process.env.XDG_SESSION_TYPE = 'x11'; });

// ─── Shared mock state ──────────────────────────────────────────────────────

/** Tracks each `new BrowserWindow(...)` instance in creation order. */
const browserWindowInstances = [];

/**
 * CONTENT_READY callbacks registered via `win.webContents.ipc.once(...)`,
 * keyed by the BrowserWindow instance that registered it. Driving this callback
 * simulates the renderer signalling first paint.
 */
const contentReadyByWindow = new Map();

/** Handlers registered via `screen.on(event, cb)`, keyed by event name. */
const screenHandlers = new Map();

/** The display list returned by screen.getAllDisplays() — mutable per test. */
let displayList = [];

const CONTENT_READY_CHANNEL = 'window:content-ready';

/**
 * Build a stateful BrowserWindow mock. show()/hide() flip an internal `visible`
 * flag that isVisible() reads back, so reconcile's `if (win.isVisible())` guards
 * behave like the real window lifecycle. Created hidden (show:false in source).
 */
function makeWindowMock() {
  let visible = false;
  let destroyed = false;
  const instance = {
    isVisible: vi.fn(() => visible),
    isDestroyed: vi.fn(() => destroyed),
    show: vi.fn(() => { visible = true; }),
    hide: vi.fn(() => { visible = false; }),
    destroy: vi.fn(() => { destroyed = true; }),
    setOpacity: vi.fn(),
    setPosition: vi.fn(),
    getPosition: vi.fn(() => [0, 0]),
    setBounds: vi.fn(),
    moveTop: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setVisibleOnAllWorkspaces: vi.fn(),
    focus: vi.fn(),
    close: vi.fn(),
    loadURL: vi.fn(() => Promise.resolve()),
    webContents: {
      ipc: {
        once: vi.fn((channel, cb) => {
          if (channel === CONTENT_READY_CHANNEL) contentReadyByWindow.set(instance, cb);
        }),
      },
      on: vi.fn(),
      send: vi.fn(),
      setBackgroundThrottling: vi.fn(),
      openDevTools: vi.fn(),
    },
    on: vi.fn(),
  };
  return instance;
}

// ─── Electron mock ──────────────────────────────────────────────────────────

vi.mock('electron', () => {
  const screen = {
    getAllDisplays: vi.fn(() => displayList),
    getPrimaryDisplay: vi.fn(() => displayList[0]),
    getCursorScreenPoint: vi.fn(() => ({ x: 10, y: 10 })),
    on: vi.fn((event, cb) => { screenHandlers.set(event, cb); }),
  };

  const BrowserWindow = vi.fn().mockImplementation(() => {
    const instance = makeWindowMock();
    browserWindowInstances.push(instance);
    return instance;
  });

  const app = { isPackaged: false };
  return { app, BrowserWindow, ipcMain: { on: vi.fn(), handle: vi.fn() }, screen };
});

vi.mock('../../electron/ipc-channels.js', () => ({
  WINDOW: {
    OPEN_SETTINGS: 'window:open-settings',
    CLOSE_SETTINGS: 'window:close-settings',
    CONTENT_READY: 'window:content-ready',
    SET_POSITION: 'window:set-position',
    GET_DISPLAY_INFO: 'window:get-display-info',
    GET_POSITION: 'window:get-position',
    SET_IGNORE_MOUSE_EVENTS: 'window:set-ignore-mouse-events',
    GET_CURSOR_POSITION: 'window:get-cursor-position',
  },
  OVERLAY: { SET_DRAWING_MODE: 'overlay:set-drawing-mode', DRAWING_MODE_CHANGED: 'overlay:drawing-mode-changed' },
  CONTROL_BAR: { TOOL_CHANGED: 'c:tc', TOOL_CONFIG_CHANGED: 'c:tcc', STROKE_STYLE: 'c:ss', STROKE_STYLE_CHANGED: 'c:ssc', CLEAR_CANVAS: 'c:cc', CLEAR_CANVAS_TRIGGERED: 'c:cct' },
  HISTORY: { UNDO: 'h:u', REDO: 'h:r', TRIGGER_UNDO: 'h:tu', TRIGGER_REDO: 'h:tr', STATE_CHANGED: 'h:sc' },
  POSITIONING: { STATE_CHANGED: 'positioning:state-changed', INTENT: 'positioning:intent', GET_STATE: 'positioning:get-state' },
  CURSOR: { GET_POSITION: 'cursor:get-position' },
}));

vi.mock('../../electron/config-loader.js', () => ({
  getAppConfig: vi.fn(() => ({
    electron: {
      window: {
        mainAlwaysOnTopLevel: 'screen-saver',
        mainAlwaysOnTopRelativeLevel: 1,
        overlayAlwaysOnTopLevel: 'screen-saver',
        overlayAlwaysOnTopRelativeLevel: 0,
      },
      devtools: { enabled: false, openMainWindow: false, openOverlayWindow: false, openSettingsWindow: false },
    },
  })),
}));

vi.mock('../../electron/module-manifest-loader.js', () => ({
  sendModuleManifests: vi.fn(),
}));

vi.mock('../../electron/shortcut-manager.js', () => ({
  suspendShortcuts: vi.fn(),
  resumeShortcuts: vi.fn(),
}));

vi.mock('electron-log/main.js', () => ({
  default: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// The hotplug reconcile lazily imports positioning-engine; stub it so the
// dynamic import resolves without pulling the real engine.
vi.mock('../../electron/positioning-engine.js', () => ({
  processIntent: vi.fn(() => Promise.resolve()),
}));

// ─── Subject ──────────────────────────────────────────────────────────────────

// The window-manager keeps module-level state (mainWindowsByDisplayId, barHidden,
// activeDisplayId). Re-import a fresh instance per test via vi.resetModules so
// one test's per-display windows can't leak into the next (the hotplug tests
// depend on a given display.id being genuinely new). Bound in beforeEach.
let initWindowManager;
let createMainWindowForDisplay;
let showMainWindow;
let hideMainWindow;
let setActiveDisplayId;

// ─── Fixtures ───────────────────────────────────────────────────────────────

const DISPLAY_A = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1440, height: 900 },
  workArea: { x: 0, y: 25, width: 1440, height: 875 },
  scaleFactor: 2,
};
const DISPLAY_B = {
  id: 2,
  bounds: { x: 1440, y: 0, width: 1920, height: 1080 },
  workArea: { x: 1440, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
};
const DISPLAY_C = {
  id: 3,
  bounds: { x: 3360, y: 0, width: 1280, height: 720 },
  workArea: { x: 3360, y: 0, width: 1280, height: 720 },
  scaleFactor: 1,
};

/**
 * Create a main window for `display` and drive its CONTENT_READY so it reveals
 * (subject to barHidden), matching the real renderer-ready lifecycle. Returns
 * the freshly created mock window.
 */
function createAndReady(display) {
  const before = browserWindowInstances.length;
  createMainWindowForDisplay(display);
  const win = browserWindowInstances[before];
  const cb = contentReadyByWindow.get(win);
  if (cb) cb();
  return win;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('reconcileStandardBarWindows — per-display bar visibility derived from barHidden', () => {
  beforeEach(async () => {
    browserWindowInstances.length = 0;
    contentReadyByWindow.clear();
    screenHandlers.clear();
    displayList = [DISPLAY_A, DISPLAY_B];

    vi.clearAllMocks();
    vi.resetModules();
    ({
      initWindowManager,
      createMainWindowForDisplay,
      showMainWindow,
      hideMainWindow,
      setActiveDisplayId,
    } = await import('../../electron/window-manager.js'));

    initWindowManager('http://localhost:5173');
  });

  it('hideMainWindow hides EVERY per-display window, not just the active one', () => {
    const winA = createAndReady(DISPLAY_A);
    const winB = createAndReady(DISPLAY_B);
    setActiveDisplayId(DISPLAY_A.id);
    expect(winA.isVisible()).toBe(true);
    expect(winB.isVisible()).toBe(true);

    winA.hide.mockClear();
    winB.hide.mockClear();

    hideMainWindow();

    expect(winA.hide).toHaveBeenCalledTimes(1);
    expect(winB.hide).toHaveBeenCalledTimes(1);
    expect(winA.isVisible()).toBe(false);
    expect(winB.isVisible()).toBe(false);
  });

  it('showMainWindow shows EVERY per-display window after a hide', () => {
    const winA = createAndReady(DISPLAY_A);
    const winB = createAndReady(DISPLAY_B);
    setActiveDisplayId(DISPLAY_A.id);

    hideMainWindow();
    expect(winA.isVisible()).toBe(false);
    expect(winB.isVisible()).toBe(false);

    winA.show.mockClear();
    winB.show.mockClear();

    showMainWindow();

    expect(winA.show).toHaveBeenCalledTimes(1);
    expect(winB.show).toHaveBeenCalledTimes(1);
    expect(winA.isVisible()).toBe(true);
    expect(winB.isVisible()).toBe(true);
  });

  it('reconciles all THREE windows together when a third display is present', () => {
    const winA = createAndReady(DISPLAY_A);
    const winB = createAndReady(DISPLAY_B);
    const winC = createAndReady(DISPLAY_C);
    setActiveDisplayId(DISPLAY_A.id);

    hideMainWindow();

    expect(winA.isVisible()).toBe(false);
    expect(winB.isVisible()).toBe(false);
    expect(winC.isVisible()).toBe(false);
  });

  it('does NOT re-hide an already-hidden window (no redundant hide call)', () => {
    const winA = createAndReady(DISPLAY_A);
    const winB = createAndReady(DISPLAY_B);
    setActiveDisplayId(DISPLAY_A.id);

    hideMainWindow();
    winA.hide.mockClear();
    winB.hide.mockClear();

    // Second hide while already hidden — guard `if (win.isVisible())` must skip.
    hideMainWindow();

    expect(winA.hide).not.toHaveBeenCalled();
    expect(winB.hide).not.toHaveBeenCalled();
  });

  describe('active-display switch reconciliation (the original bug)', () => {
    it('switching active display while hidden does NOT re-reveal the new active window', () => {
      const winA = createAndReady(DISPLAY_A);
      const winB = createAndReady(DISPLAY_B);
      setActiveDisplayId(DISPLAY_A.id);

      hideMainWindow();
      expect(winA.isVisible()).toBe(false);
      expect(winB.isVisible()).toBe(false);

      winA.show.mockClear();
      winB.show.mockClear();

      // The original bug: switching the active display re-showed the bar on the
      // newly active display, contradicting the user's hidden state.
      setActiveDisplayId(DISPLAY_B.id);

      expect(winB.show).not.toHaveBeenCalled();
      expect(winA.show).not.toHaveBeenCalled();
      expect(winB.isVisible()).toBe(false);
      expect(winA.isVisible()).toBe(false);
    });

    it('switching active display while visible keeps every window visible (no spurious hide)', () => {
      const winA = createAndReady(DISPLAY_A);
      const winB = createAndReady(DISPLAY_B);
      setActiveDisplayId(DISPLAY_A.id);
      expect(winA.isVisible()).toBe(true);
      expect(winB.isVisible()).toBe(true);

      winA.hide.mockClear();
      winB.hide.mockClear();

      setActiveDisplayId(DISPLAY_B.id);

      expect(winA.hide).not.toHaveBeenCalled();
      expect(winB.hide).not.toHaveBeenCalled();
      expect(winA.isVisible()).toBe(true);
      expect(winB.isVisible()).toBe(true);
    });
  });

  describe('hotplug while hidden', () => {
    it('a display added while barHidden stays hidden (CONTENT_READY does NOT show it)', () => {
      const winA = createAndReady(DISPLAY_A);
      const winB = createAndReady(DISPLAY_B);
      setActiveDisplayId(DISPLAY_A.id);

      hideMainWindow();
      expect(winA.isVisible()).toBe(false);
      expect(winB.isVisible()).toBe(false);

      // Simulate hotplug: a third display appears. The debounced display-added
      // handler runs _reconcileDisplayWindows which creates the new main window.
      vi.useFakeTimers();
      try {
        const knownBefore = new Set(browserWindowInstances);
        displayList = [DISPLAY_A, DISPLAY_B, DISPLAY_C];
        const onAdded = screenHandlers.get('display-added');
        expect(onAdded).toBeTypeOf('function');
        onAdded();
        vi.advanceTimersByTime(200); // flush the 200ms hotplug debounce

        // Hotplug creates the new display's main window AND its overlay window;
        // the main window is the new instance that registered a CONTENT_READY
        // callback (the overlay does not use this channel).
        const winC = browserWindowInstances.find(
          (w) => !knownBefore.has(w) && contentReadyByWindow.has(w),
        );
        expect(winC).toBeDefined();
        // Drive its renderer-ready signal — the source guards `win.show()` on
        // !barHidden, so a hidden session must keep the new window hidden.
        contentReadyByWindow.get(winC)();

        expect(winC.show).not.toHaveBeenCalled();
        expect(winC.isVisible()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('a display added while visible is shown on CONTENT_READY', () => {
      const winA = createAndReady(DISPLAY_A);
      const winB = createAndReady(DISPLAY_B);
      setActiveDisplayId(DISPLAY_A.id);
      // barHidden is false (reset in beforeEach).

      vi.useFakeTimers();
      try {
        const knownBefore = new Set(browserWindowInstances);
        displayList = [DISPLAY_A, DISPLAY_B, DISPLAY_C];
        const onAdded = screenHandlers.get('display-added');
        onAdded();
        vi.advanceTimersByTime(200);

        const winC = browserWindowInstances.find(
          (w) => !knownBefore.has(w) && contentReadyByWindow.has(w),
        );
        expect(winC).toBeDefined();
        contentReadyByWindow.get(winC)();

        expect(winC.isVisible()).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('reconcile does not force-show a pre-CONTENT_READY window (DWM flicker guard)', () => {
    it('hotplug while visible does NOT show the new window before its CONTENT_READY (left to self-reveal)', () => {
      const winA = createAndReady(DISPLAY_A);
      const winB = createAndReady(DISPLAY_B);
      setActiveDisplayId(DISPLAY_A.id);
      // barHidden is false (reset in beforeEach): the bar is visible.

      vi.useFakeTimers();
      try {
        const knownBefore = new Set(browserWindowInstances);
        displayList = [DISPLAY_A, DISPLAY_B, DISPLAY_C];
        const onAdded = screenHandlers.get('display-added');
        onAdded();
        // Flush the hotplug debounce: this creates the new main window AND runs
        // reconcileStandardBarWindows() — all while the new window is still
        // pre-CONTENT_READY. Reconcile MUST NOT force-show it (would bypass the
        // show:false DWM flicker guard).
        vi.advanceTimersByTime(200);

        const winC = browserWindowInstances.find(
          (w) => !knownBefore.has(w) && contentReadyByWindow.has(w),
        );
        expect(winC).toBeDefined();
        // Reconcile ran during the hotplug; assert it left the new window alone.
        expect(winC.show).not.toHaveBeenCalled();
        expect(winC.isVisible()).toBe(false);

        // The window self-reveals via its own CONTENT_READY handler (which
        // honours barHidden=false), so it ends up visible — without flicker.
        contentReadyByWindow.get(winC)();
        expect(winC.show).toHaveBeenCalledTimes(1);
        expect(winC.isVisible()).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('an explicit show/hide cycle still reconciles every READY window (regression guard)', () => {
      const winA = createAndReady(DISPLAY_A);
      const winB = createAndReady(DISPLAY_B);
      setActiveDisplayId(DISPLAY_A.id);

      hideMainWindow();
      expect(winA.isVisible()).toBe(false);
      expect(winB.isVisible()).toBe(false);

      winA.show.mockClear();
      winB.show.mockClear();

      // Both windows are already CONTENT_READY, so showMainWindow must reveal
      // every one of them (the flicker guard must not suppress ready windows).
      showMainWindow();

      expect(winA.show).toHaveBeenCalledTimes(1);
      expect(winB.show).toHaveBeenCalledTimes(1);
      expect(winA.isVisible()).toBe(true);
      expect(winB.isVisible()).toBe(true);
    });

    it('a pre-CONTENT_READY window is shown by a later show/hide cycle only AFTER it becomes ready', () => {
      const winA = createAndReady(DISPLAY_A);
      setActiveDisplayId(DISPLAY_A.id);

      // Create winB but never drive CONTENT_READY: it stays pre-ready.
      createMainWindowForDisplay(DISPLAY_B);
      const winB = browserWindowInstances[browserWindowInstances.length - 1];
      expect(winB.isVisible()).toBe(false);

      // A reconcile pass (hide then show) must NOT force-show the pre-ready winB.
      hideMainWindow();
      showMainWindow();
      expect(winB.show).not.toHaveBeenCalled();
      expect(winB.isVisible()).toBe(false);

      // Once winB self-reveals via CONTENT_READY, it tracks barHidden normally.
      contentReadyByWindow.get(winB)();
      expect(winB.isVisible()).toBe(true);

      winB.hide.mockClear();
      winB.show.mockClear();
      hideMainWindow();
      expect(winB.hide).toHaveBeenCalledTimes(1);
      showMainWindow();
      expect(winB.show).toHaveBeenCalledTimes(1);
      expect(winB.isVisible()).toBe(true);
    });
  });

  describe('CONTENT_READY / fallback respect barHidden at creation', () => {
    it('CONTENT_READY does NOT show a window created while barHidden=true', () => {
      const winA = createAndReady(DISPLAY_A);
      setActiveDisplayId(DISPLAY_A.id);
      hideMainWindow();

      // A new window is created while hidden (e.g. mid-session display setup).
      const winB = createAndReady(DISPLAY_B);

      expect(winB.show).not.toHaveBeenCalled();
      expect(winB.isVisible()).toBe(false);
    });

    it('the 3s fallback does NOT force-show a window created while barHidden=true', () => {
      hideMainWindow();

      vi.useFakeTimers();
      try {
        createMainWindowForDisplay(DISPLAY_A);
        const winA = browserWindowInstances[browserWindowInstances.length - 1];
        // Do NOT drive CONTENT_READY — let the fallback timer fire instead.
        vi.advanceTimersByTime(3000);

        expect(winA.show).not.toHaveBeenCalled();
        expect(winA.isVisible()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('the 3s fallback DOES force-show a window when barHidden=false and CONTENT_READY never arrives', () => {
      vi.useFakeTimers();
      try {
        createMainWindowForDisplay(DISPLAY_A);
        const winA = browserWindowInstances[browserWindowInstances.length - 1];
        vi.advanceTimersByTime(3000);

        expect(winA.show).toHaveBeenCalledTimes(1);
        expect(winA.isVisible()).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('destroyed window is skipped', () => {
    it('hideMainWindow does not throw and skips a destroyed window while hiding the rest', () => {
      const winA = createAndReady(DISPLAY_A);
      const winB = createAndReady(DISPLAY_B);
      setActiveDisplayId(DISPLAY_A.id);

      // Destroy winA's underlying window; the map still holds the reference.
      winA.destroy();
      expect(winA.isDestroyed()).toBe(true);

      winB.hide.mockClear();

      expect(() => hideMainWindow()).not.toThrow();

      // The destroyed window is skipped (no hide call), the live one is hidden.
      expect(winA.hide).not.toHaveBeenCalled();
      expect(winB.hide).toHaveBeenCalledTimes(1);
      expect(winB.isVisible()).toBe(false);
    });
  });
});
