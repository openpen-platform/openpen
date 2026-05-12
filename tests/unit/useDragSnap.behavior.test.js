/**
 * Behavior tests for the useDragSnap composable.
 *
 * The composable is a thin intent emitter; all position math lives in the
 * main-process PositioningEngine. Tests here verify:
 *   - Drag detection state flags (isPointerDragging, hasDragMotion, wasDragged).
 *   - The correct drag-end intent is sent for screen-delta and client-delta paths.
 *   - snapEdge is updated from the engine's intent response.
 *   - isSnapAnimatingToSide is set for side-edge snaps.
 *   - enableDragAutoSnap=false clears snapEdge immediately.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref } from 'vue';
import { useDragSnap } from '../../src/composables/useDragSnap';

function makeOpts(enableDragAutoSnap = true, barLayoutClass = 'horizontal') {
  return {
    barEl: { value: null },
    enableDragAutoSnap: ref(enableDragAutoSnap),
    barLayoutClass: ref(barLayoutClass),
  };
}

vi.mock('../../src/services/config-bridge', () => ({
  getAppConfig: () => ({
    interaction: { drag: { thresholdPx: 4, snapDurationMs: 250, dragEndDelayMs: 50 } },
  }),
}));

// ─── Mock setup ──────────────────────────────────────────────────────────────

const MOCK_DISPLAYS = [
  {
    bounds:   { x: 0, y: 0, width: 1920, height: 1080 },
    workArea: { x: 0, y: 25, width: 1920, height: 1055 },
  },
];

const MOCK_BALL_SCREEN_POS = { x: 960, y: 552 }; // workArea center

/**
 * Build an API mock.
 * @param {object} opts
 * @param {string} [opts.snapEdge] - Snap edge returned by the engine on drag-end (default: 'right').
 * @param {object} [opts.ballScreenPos] - Ball screen position returned by drag-start (default: workArea center).
 */
function makeApi({ snapEdge = 'right', ballScreenPos = MOCK_BALL_SCREEN_POS } = {}) {
  return {
    getDisplayInfo: vi.fn(async () => MOCK_DISPLAYS),
    setWindowPosition: vi.fn(),
    sendPositioningIntent: vi.fn(async (intent) => {
      if (intent.type === 'drag-start') {
        return { state: { ballScreenPos, snapEdge: null } };
      }
      if (intent.type === 'drag-end' && intent.hadMotion && intent.enableDragAutoSnap) {
        return { state: { snapEdge } };
      }
      return { state: { snapEdge: null } };
    }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete window.openPenApi;
});

// Advance the fake timer by DRAG_END_DELAY (50ms) and flush async work.
const advance = () => vi.advanceTimersByTimeAsync(50);

// ─── Screen delta drag path ──────────────────────────────────────────────────

describe('useDragSnap — screen delta drag path', () => {
  it('screenX delta > 4px after mouseup -> sends drag-end intent and sets snapEdge', async () => {
    const api = makeApi();
    window.openPenApi = api;
    const { snapEdge, onMouseDown } = useDragSnap(makeOpts());

    onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 190, clientY: 70, screenX: 500, screenY: 300 }));
    await Promise.resolve(); // flush drag-start intent

    document.dispatchEvent(new MouseEvent('mouseup', {
      button: 0, clientX: 190, clientY: 70, screenX: 800, screenY: 300, bubbles: true,
    }));

    await advance();

    expect(api.getDisplayInfo).toHaveBeenCalled();
    expect(api.sendPositioningIntent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'drag-end', hadMotion: true })
    );
    expect(snapEdge.value).not.toBeNull();
  });

  it('screenX delta <= 4px -> treated as click, no drag-end intent', async () => {
    const api = makeApi();
    window.openPenApi = api;
    const { snapEdge, onMouseDown } = useDragSnap(makeOpts());

    onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 190, clientY: 70, screenX: 500, screenY: 300 }));
    await Promise.resolve();

    // 3px screen move — within threshold.
    document.dispatchEvent(new MouseEvent('mouseup', {
      button: 0, clientX: 190, clientY: 70, screenX: 503, screenY: 300, bubbles: true,
    }));

    await advance();

    expect(api.getDisplayInfo).not.toHaveBeenCalled();
    expect(snapEdge.value).toBeNull();
  });
});

// ─── Client delta fallback path ──────────────────────────────────────────────

describe('useDragSnap — client delta fallback path', () => {
  it('clientX delta > 4px with no screen movement -> sends drag-end intent', async () => {
    const api = makeApi();
    window.openPenApi = api;
    const { snapEdge, onMouseDown } = useDragSnap(makeOpts());

    onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 190, clientY: 70, screenX: 500, screenY: 300 }));
    await Promise.resolve();

    document.dispatchEvent(new MouseEvent('mouseup', {
      button: 0, clientX: 490, clientY: 70, screenX: 500, screenY: 300, bubbles: true,
    }));

    await advance();

    expect(api.getDisplayInfo).toHaveBeenCalled();
    expect(snapEdge.value).not.toBeNull();
  });

  it('clientX delta <= 4px and screenX delta <= 4px -> treated as click, no snap', async () => {
    const api = makeApi();
    window.openPenApi = api;
    const { snapEdge, onMouseDown } = useDragSnap(makeOpts());

    onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 190, clientY: 70, screenX: 500, screenY: 300 }));
    await Promise.resolve();

    // 2px moves.
    document.dispatchEvent(new MouseEvent('mouseup', {
      button: 0, clientX: 192, clientY: 70, screenX: 502, screenY: 300, bubbles: true,
    }));

    await advance();

    expect(api.getDisplayInfo).not.toHaveBeenCalled();
    expect(snapEdge.value).toBeNull();
  });
});

// ─── onMouseDown state reset ────────────────────────────────────────────────

describe('useDragSnap — onMouseDown state reset', () => {
  it('keeps snapEdge during a drag to prevent layout jumping', async () => {
    const api = makeApi();
    window.openPenApi = api;
    const { snapEdge, onMouseDown } = useDragSnap(makeOpts());

    // First drag + snap sets snapEdge.
    onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 190, clientY: 70, screenX: 500, screenY: 300 }));
    await Promise.resolve();
    document.dispatchEvent(new MouseEvent('mouseup', {
      button: 0, clientX: 190, clientY: 70, screenX: 800, screenY: 300, bubbles: true,
    }));
    await advance();
    expect(snapEdge.value).not.toBeNull();
    const prevEdge = snapEdge.value;

    // Second mousedown must not clear snapEdge; prior edge stays so a subsequent
    // click-to-expand can use it.
    window.openPenApi = makeApi();
    onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 190, clientY: 70, screenX: 500, screenY: 300 }));
    expect(snapEdge.value).toBe(prevEdge);

    // Dragging past threshold still keeps the prior snapEdge so layout doesn't flip mid-drag.
    document.dispatchEvent(new MouseEvent('mousemove', {
      button: 0, clientX: 195, clientY: 70, screenX: 505, screenY: 300, bubbles: true,
    }));
    expect(snapEdge.value).toBe(prevEdge);

    document.dispatchEvent(new MouseEvent('mouseup', {
      button: 0, clientX: 195, clientY: 70, screenX: 505, screenY: 300, bubbles: true,
    }));
    await advance();
  });

  it('non-left-button mousedown is ignored', async () => {
    const api = makeApi();
    window.openPenApi = api;
    const { snapEdge, onMouseDown } = useDragSnap(makeOpts());

    // Right button (button=2) -> no mouseup listener registered.
    onMouseDown(new MouseEvent('mousedown', { button: 2, clientX: 190, clientY: 70, screenX: 500, screenY: 300 }));

    document.dispatchEvent(new MouseEvent('mouseup', {
      button: 2, clientX: 490, clientY: 70, screenX: 800, screenY: 300, bubbles: true,
    }));
    await advance();

    expect(api.sendPositioningIntent).not.toHaveBeenCalled();
    expect(snapEdge.value).toBeNull();
  });

  it('isPointerDragging flips true on mousedown and false on mouseup', async () => {
    const api = makeApi();
    window.openPenApi = api;
    const { isPointerDragging, onMouseDown } = useDragSnap(makeOpts());

    onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 190, clientY: 70, screenX: 500, screenY: 300 }));
    expect(isPointerDragging.value).toBe(true);

    document.dispatchEvent(new MouseEvent('mouseup', {
      button: 0, clientX: 190, clientY: 70, screenX: 500, screenY: 300, bubbles: true,
    }));
    expect(isPointerDragging.value).toBe(false);

    await advance();
    expect(isPointerDragging.value).toBe(false);
  });

  it('hasDragMotion flips true after 1px of motion and resets on mouseup', async () => {
    const api = makeApi();
    window.openPenApi = api;
    const { hasDragMotion, wasDragged, onMouseDown } = useDragSnap(makeOpts());

    onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 190, clientY: 70, screenX: 500, screenY: 300 }));
    expect(hasDragMotion.value).toBe(false);
    expect(wasDragged.value).toBe(false);

    // 1px motion triggers hasDragMotion but not wasDragged (which needs 4px).
    document.dispatchEvent(new MouseEvent('mousemove', {
      button: 0, clientX: 191, clientY: 70, screenX: 501, screenY: 300, bubbles: true,
    }));
    expect(hasDragMotion.value).toBe(true);
    expect(wasDragged.value).toBe(false);

    document.dispatchEvent(new MouseEvent('mouseup', {
      button: 0, clientX: 191, clientY: 70, screenX: 501, screenY: 300, bubbles: true,
    }));
    expect(hasDragMotion.value).toBe(false);
  });

  it('side snap: isSnapAnimatingToSide is set true after a side-edge drag-end', async () => {
    const api = makeApi({ snapEdge: 'left' });
    window.openPenApi = api;
    const { snapEdge, isSnapAnimatingToSide, onMouseDown, cleanup } = useDragSnap(makeOpts());

    onMouseDown(new MouseEvent('mousedown', {
      button: 0, clientX: 190, clientY: 70, screenX: 500, screenY: 300, bubbles: true,
    }));
    await Promise.resolve();

    document.dispatchEvent(new MouseEvent('mouseup', {
      button: 0, clientX: 190, clientY: 70, screenX: 800, screenY: 300, bubbles: true,
    }));

    await advance();

    expect(snapEdge.value).toBe('left');
    expect(isSnapAnimatingToSide.value).toBe(true);

    cleanup();
    expect(isSnapAnimatingToSide.value).toBe(false);
  });

  it('drag-start intent sends ball position to engine before mouse moves', async () => {
    const api = makeApi({ ballScreenPos: { x: 960, y: 552 } });
    window.openPenApi = api;
    const { onMouseDown } = useDragSnap(makeOpts());

    onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 190, clientY: 70, screenX: 500, screenY: 300 }));

    expect(api.sendPositioningIntent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'drag-start' })
    );
  });
});

// ─── cleanup ────────────────────────────────────────────────────────────────

describe('useDragSnap — cleanup', () => {
  it('cleanup does not throw', () => {
    window.openPenApi = makeApi();
    const { cleanup } = useDragSnap(makeOpts());
    expect(() => cleanup()).not.toThrow();
  });
});

// ─── enableDragAutoSnap setting ───────────────────────────────────────────────

describe('useDragSnap — enableDragAutoSnap=false: no edge snap, snapEdge stays null', () => {
  it('drag end with enableDragAutoSnap=false -> snapEdge remains null', async () => {
    const api = makeApi();
    window.openPenApi = api;
    const { snapEdge, onMouseDown } = useDragSnap({
      barEl: { value: null },
      enableDragAutoSnap: ref(false),
      barLayoutClass: ref('horizontal'),
    });

    onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 190, clientY: 70, screenX: 500, screenY: 300 }));
    await Promise.resolve();

    document.dispatchEvent(new MouseEvent('mouseup', {
      button: 0, clientX: 190, clientY: 70, screenX: 800, screenY: 300, bubbles: true,
    }));

    await advance();

    // Drag was detected (screen delta) but snap is disabled — snapEdge must stay null.
    expect(api.getDisplayInfo).toHaveBeenCalled();
    expect(snapEdge.value).toBeNull();
  });

  it('drag end with enableDragAutoSnap=false -> setWindowPosition NOT called', async () => {
    const api = makeApi();
    window.openPenApi = api;
    const { onMouseDown } = useDragSnap({
      barEl: { value: null },
      enableDragAutoSnap: ref(false),
      barLayoutClass: ref('horizontal'),
    });

    onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 190, clientY: 70, screenX: 500, screenY: 300 }));
    await Promise.resolve();

    document.dispatchEvent(new MouseEvent('mouseup', {
      button: 0, clientX: 190, clientY: 70, screenX: 800, screenY: 300, bubbles: true,
    }));

    await advance();

    // Renderer never calls setWindowPosition — engine handles all movement.
    expect(api.setWindowPosition).not.toHaveBeenCalled();
  });

  it('flipping the ref from ON to OFF mid-session disables snap and clears stale snapEdge', async () => {
    const api = makeApi();
    window.openPenApi = api;
    const enableDragAutoSnap = ref(true);
    const { snapEdge, onMouseDown } = useDragSnap({
      barEl: { value: null },
      enableDragAutoSnap,
      barLayoutClass: ref('horizontal'),
    });

    // First drag with snap=ON to set snapEdge non-null.
    onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 190, clientY: 70, screenX: 500, screenY: 300 }));
    await Promise.resolve();
    document.dispatchEvent(new MouseEvent('mouseup', {
      button: 0, clientX: 190, clientY: 70, screenX: 800, screenY: 300, bubbles: true,
    }));
    await advance();
    expect(snapEdge.value).not.toBeNull();

    // Flip OFF — watch should fire and zero the ref synchronously (after flush).
    enableDragAutoSnap.value = false;
    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(snapEdge.value).toBeNull();
  });
});

describe('useDragSnap — enableDragAutoSnap=true: existing snap behavior preserved', () => {
  it('screen delta drag with enableDragAutoSnap=true -> snapEdge is set (snap to edge)', async () => {
    const api = makeApi();
    window.openPenApi = api;
    const { snapEdge, onMouseDown } = useDragSnap({
      barEl: { value: null },
      enableDragAutoSnap: ref(true),
      barLayoutClass: ref('horizontal'),
    });

    onMouseDown(new MouseEvent('mousedown', { button: 0, clientX: 190, clientY: 70, screenX: 500, screenY: 300 }));
    await Promise.resolve();

    document.dispatchEvent(new MouseEvent('mouseup', {
      button: 0, clientX: 190, clientY: 70, screenX: 800, screenY: 300, bubbles: true,
    }));

    await advance();

    expect(api.getDisplayInfo).toHaveBeenCalled();
    expect(snapEdge.value).not.toBeNull();
  });
});
