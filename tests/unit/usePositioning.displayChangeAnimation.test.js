/**
 * display-change animation behavior for usePositioning.
 *
 * Verifies that a state broadcast carrying a `purpose: 'display-change'`
 * animation hint drives the RAF interpolation path (ball slides through
 * intermediate viewport positions) rather than teleporting to the target,
 * and that the easeOutBack→easeOutCubic override (scoped to 'snap') leaves a
 * display-change hint's easing untouched.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';

// ─── RAF / time stubs ─────────────────────────────────────────────────────────

let rafCallbacks = [];
let rafIdCounter = 0;
let mockedNow = 0;

function installTimeStubs() {
  rafCallbacks = [];
  rafIdCounter = 0;
  mockedNow = 0;

  vi.stubGlobal('requestAnimationFrame', (cb) => {
    const id = ++rafIdCounter;
    rafCallbacks.push({ id, cb });
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id) => {
    rafCallbacks = rafCallbacks.filter((e) => e.id !== id);
  });
  vi.stubGlobal('performance', { now: () => mockedNow });
}

function flushRafs(advanceMs = 0) {
  mockedNow += advanceMs;
  const batch = [...rafCallbacks];
  rafCallbacks = [];
  for (const { cb } of batch) cb(mockedNow);
}

// ─── Display fixture ──────────────────────────────────────────────────────────

const DISPLAY = {
  id: 1,
  scaleFactor: 1,
  bounds:   { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};

// ─── openPenApi mock ──────────────────────────────────────────────────────────

let stateChangedHandler = null;

function installApiMock(initialState) {
  stateChangedHandler = null;
  vi.stubGlobal('window', {
    openPenApi: {
      getDisplayInfo:          vi.fn(async () => [DISPLAY]),
      getPositioningState:     vi.fn(async () => initialState),
      onPositioningStateChanged: vi.fn((cb) => {
        stateChangedHandler = cb;
        return () => { stateChangedHandler = null; };
      }),
    },
  });
}

function broadcastState(state, animation = null) {
  stateChangedHandler?.({ state, animation });
}

function withSetup(composableFn) {
  let result;
  const Wrapper = defineComponent({
    setup() {
      result = composableFn();
      return () => h('div');
    },
  });
  const wrapper = mount(Wrapper, { attachTo: document.body });
  return { result, wrapper };
}

function makeState(overrides) {
  return {
    ballScreenPos:   { x: 960, y: 552 },
    activeDisplayId: DISPLAY.id,
    snapEdge:        null,
    barExpanded:     false,
    barLayoutClass:  'horizontal',
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('usePositioning — display-change animation', () => {
  beforeEach(() => {
    installTimeStubs();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.resetModules();
    stateChangedHandler = null;
    rafCallbacks = [];
  });

  it('interpolates ballViewportPos through intermediate values (does not teleport)', async () => {
    const fromState = makeState({ ballScreenPos: { x: 1600, y: 400 } });
    installApiMock(fromState);

    vi.resetModules();
    const { usePositioning } = await import('../../src/composables/usePositioning');

    const { result, wrapper } = withSetup(() => usePositioning());
    const { ballViewportPos } = result;
    await Promise.resolve();
    await Promise.resolve();

    // Seed the "before topology change" position.
    broadcastState(fromState);

    // Display change re-clamps the ball to a new position.
    const toX = 800;
    const toState = makeState({ ballScreenPos: { x: toX, y: 400 } });
    broadcastState(toState, { durationMs: 250, easing: 'easeOutCubic', purpose: 'display-change' });
    // A display-change broadcast refreshes cachedDisplays via getDisplayInfo()
    // before applying state, so the animation starts after the microtask chain.
    await Promise.resolve();
    await Promise.resolve();

    const positions = [];
    flushRafs(0);    positions.push(ballViewportPos.value?.x ?? null);
    flushRafs(75);   positions.push(ballViewportPos.value?.x ?? null);
    flushRafs(100);  positions.push(ballViewportPos.value?.x ?? null);
    flushRafs(75);   positions.push(ballViewportPos.value?.x ?? null);

    expect(positions.every((p) => p !== null)).toBe(true);

    // Start at the pre-change position (1600 - wa.x 0 = 1600 viewport).
    expect(positions[0]).toBeCloseTo(1600, 0);
    // End at the re-clamped target (800 viewport).
    expect(positions[positions.length - 1]).toBeCloseTo(toX, 0);

    // At least one intermediate value strictly between start and end => interpolation.
    const startX = positions[0];
    const endX = positions[positions.length - 1];
    const intermediates = positions.slice(1, -1);
    const hasIntermediate = intermediates.some((x) => x !== null && x < startX && x > endX);
    expect(hasIntermediate).toBe(true);

    wrapper.unmount();
  });

  it('keeps easeOutCubic for a display-change hint snapped to the left edge (override is snap-only)', async () => {
    // A display-change can leave the ball on a left-snapped layout. The easing
    // override that swaps easeOutBack→easeOutCubic is scoped to purpose 'snap';
    // a display-change hint is already easeOutCubic and must stay monotonic
    // (no easeOutBack overshoot below the left wall at x=26).
    const fromState = makeState({ ballScreenPos: { x: 200, y: 400 } });
    installApiMock(fromState);

    vi.resetModules();
    const { usePositioning } = await import('../../src/composables/usePositioning');

    const { result, wrapper } = withSetup(() => usePositioning());
    const { ballViewportPos } = result;
    await Promise.resolve();
    await Promise.resolve();

    broadcastState(fromState);

    const toState = makeState({
      ballScreenPos: { x: 26, y: 400 },
      barLayoutClass: 'vbar-left',
      snapEdge: 'left',
    });
    broadcastState(toState, { durationMs: 250, easing: 'easeOutCubic', purpose: 'display-change' });
    await Promise.resolve();
    await Promise.resolve();

    const xValues = [];
    for (let ms = 0; ms <= 250; ms += 16) {
      flushRafs(16);
      xValues.push(ballViewportPos.value?.x ?? null);
    }

    // easeOutCubic never overshoots: x must stay >= 26 throughout.
    const hasOvershoot = xValues.some((x) => x !== null && x < 26);
    expect(hasOvershoot).toBe(false);
    expect(xValues[xValues.length - 1]).toBeCloseTo(26, 1);

    wrapper.unmount();
  });

  it('jumps instantly when no prior state exists (first broadcast on mount)', async () => {
    installApiMock(null);

    vi.resetModules();
    const { usePositioning } = await import('../../src/composables/usePositioning');

    const { result, wrapper } = withSetup(() => usePositioning());
    const { ballViewportPos } = result;
    await Promise.resolve();
    await Promise.resolve();

    const toState = makeState({ ballScreenPos: { x: 800, y: 400 } });
    // First ever broadcast: prev is null, hint must be ignored (no animation).
    broadcastState(toState, { durationMs: 250, easing: 'easeOutCubic', purpose: 'display-change' });
    await Promise.resolve();
    await Promise.resolve();

    expect(rafCallbacks.length).toBe(0);
    expect(ballViewportPos.value?.x).toBeCloseTo(800, 1);

    wrapper.unmount();
  });
});

// ─── Cross-display topology refresh ─────────────────────────────────────────────

// Two displays laid out side by side: an external monitor (id 2) sits to the
// right of the primary (id 1). The ball starts on the external display; when it
// is unplugged the topology shrinks to just the primary, and the engine
// re-clamps the ball onto the primary with a 'display-change' hint.
const PRIMARY = {
  id: 1,
  scaleFactor: 1,
  bounds:   { x: 0, y: 0, width: 1920, height: 1080 },
  workArea: { x: 0, y: 0, width: 1920, height: 1040 },
};
const EXTERNAL = {
  id: 2,
  scaleFactor: 1,
  bounds:   { x: 1920, y: 0, width: 1920, height: 1080 },
  workArea: { x: 1920, y: 0, width: 1920, height: 1040 },
};

describe('usePositioning — cross-display topology refresh', () => {
  let currentDisplays;
  let getDisplayInfoMock;

  beforeEach(() => {
    installTimeStubs();
    // getDisplayInfo reads a mutable variable so the test can swap topology
    // (unplug the external monitor) between the mount-time pull and the
    // display-change broadcast.
    currentDisplays = [PRIMARY, EXTERNAL];
    getDisplayInfoMock = vi.fn(async () => currentDisplays);
    stateChangedHandler = null;
    vi.stubGlobal('window', {
      openPenApi: {
        getDisplayInfo:          getDisplayInfoMock,
        getPositioningState:     vi.fn(async () => null),
        onPositioningStateChanged: vi.fn((cb) => {
          stateChangedHandler = cb;
          return () => { stateChangedHandler = null; };
        }),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    stateChangedHandler = null;
    rafCallbacks = [];
  });

  it('refreshes cachedDisplays on a display-change so fromVP/target use the new workArea (cross-display migration)', async () => {
    vi.resetModules();
    const { usePositioning } = await import('../../src/composables/usePositioning');

    const { result, wrapper } = withSetup(() => usePositioning());
    const { ballViewportPos } = result;
    await Promise.resolve();
    await Promise.resolve();

    // Seed: ball sits on the external display, centered at screen x=2880
    // (external workArea.x 1920 + 960 → viewport x 960 on the external window).
    const fromState = makeState({ ballScreenPos: { x: 2880, y: 400 }, activeDisplayId: EXTERNAL.id });
    broadcastState(fromState);
    await Promise.resolve();
    flushRafs(0);
    expect(ballViewportPos.value?.x).toBeCloseTo(960, 0);

    // External monitor is unplugged: topology now has only the primary.
    currentDisplays = [PRIMARY];

    // Engine re-clamps the ball onto the primary workArea and broadcasts a
    // display-change hint. activeDisplayId migrates 2 → 1.
    const toState = makeState({ ballScreenPos: { x: 1900, y: 400 }, activeDisplayId: PRIMARY.id });
    broadcastState(toState, { durationMs: 250, easing: 'easeOutCubic', purpose: 'display-change' });

    // The handler must re-fetch getDisplayInfo before applying the state.
    await Promise.resolve();
    await Promise.resolve();

    // A fresh getDisplayInfo call happened (beyond the mount-time pull).
    expect(getDisplayInfoMock.mock.calls.length).toBeGreaterThanOrEqual(2);

    const xValues = [];
    for (let ms = 0; ms <= 250; ms += 16) {
      flushRafs(16);
      xValues.push(ballViewportPos.value?.x ?? null);
    }

    // Target viewport must be computed from the NEW topology: primary
    // workArea.x is 0, so 1900 − 0 = 1900. A stale lookup of the now-gone
    // external display (or its old workArea.x 1920) would yield a negative /
    // off-screen target.
    const endX = xValues[xValues.length - 1];
    expect(endX).toBeCloseTo(1900, 0);
    // The whole interpolation stays on-screen (never off the left edge).
    expect(xValues.every((x) => x !== null && x >= 0)).toBe(true);

    wrapper.unmount();
  });
});
