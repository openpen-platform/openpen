/**
 * Animation behavior tests for usePositioning.
 *
 * Verifies that when the engine broadcasts a snap-with-animation state,
 * the composable actually interpolates ballViewportPos through intermediate
 * values rather than jumping instantly to the target.
 *
 * Specifically exercises the vbar (left/right) snap path where barLayoutClass
 * transitions 'horizontal' → 'vbar-left' / 'vbar-right' — the only structural
 * difference between side snaps and top/bottom snaps.
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

/** Flush all queued RAFs, advancing `performance.now()` by `advanceMs`. */
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
  workArea: { x: 0, y: 25, width: 1920, height: 1055 },
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

/** Deliver a positioning state-changed payload to the composable's subscriber. */
function broadcastState(state, animation = null) {
  stateChangedHandler?.({ state, animation });
}

// ─── withSetup helper ─────────────────────────────────────────────────────────

/**
 * Mount a minimal component that calls `composableFn` in its setup().
 * Returns { result, wrapper } — result is whatever setup() returns.
 * Lifecycle hooks (onMounted/onUnmounted) fire correctly via mount/unmount.
 */
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

// ─── State builder ────────────────────────────────────────────────────────────

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

describe('usePositioning — vbar snap animation', () => {
  beforeEach(() => {
    installTimeStubs();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.resetModules();
    stateChangedHandler = null;
    rafCallbacks = [];
  });

  it('left snap: ballViewportPos interpolates X, does not teleport (barLayoutClass = vbar-left)', async () => {
    const dragState = makeState({
      ballScreenPos: { x: 80, y: 400 },
      barLayoutClass: 'horizontal',
      snapEdge: null,
    });
    installApiMock(dragState);

    // Must reset modules so module-level shared state is clean for each test.
    vi.resetModules();
    const { usePositioning } = await import('../../src/composables/usePositioning');

    const { result, wrapper } = withSetup(() => usePositioning());
    const { ballViewportPos } = result;

    // Await mount: getDisplayInfo + getPositioningState (both async).
    await Promise.resolve();
    await Promise.resolve();

    // Seed drag-move position — simulates last broadcast before drag-end.
    broadcastState(dragState);

    // Deliver snap state with easeOutBack animation.
    const snapState = makeState({
      ballScreenPos: { x: 26, y: 400 },   // wa.x + BALL_HALF = 0 + 26
      barLayoutClass: 'vbar-left',
      snapEdge: 'left',
    });
    broadcastState(snapState, { durationMs: 250, easing: 'easeOutBack', purpose: 'snap' });

    const positions = [];
    flushRafs(0);    positions.push(ballViewportPos.value?.x ?? null);
    flushRafs(75);   positions.push(ballViewportPos.value?.x ?? null);
    flushRafs(100);  positions.push(ballViewportPos.value?.x ?? null);
    flushRafs(75);   positions.push(ballViewportPos.value?.x ?? null);

    // All positions must be non-null (animation produces values at each tick).
    expect(positions.every((p) => p !== null)).toBe(true);

    // Final position: snap target viewport X = 26 - 0 (wa.x) = 26.
    expect(positions[positions.length - 1]).toBeCloseTo(26, 1);

    // Start position must be the drag position (80 - 0 = 80 viewport).
    expect(positions[0]).toBeCloseTo(80, 1);

    // At least one intermediate value must lie strictly between start and end,
    // proving the RAF loop interpolates rather than teleports.
    const startX = positions[0];
    const endX = positions[positions.length - 1];
    const intermediates = positions.slice(1, -1);
    const hasIntermediate = intermediates.some((x) => x !== null && x > endX && x < startX);
    expect(hasIntermediate).toBe(true);

    wrapper.unmount();
  });

  it('right snap: ballViewportPos interpolates X toward right edge (barLayoutClass = vbar-right)', async () => {
    const dragX = 1840;  // near right edge during drag
    const snapX = 1894;  // wa.x + wa.width - BALL_HALF = 0 + 1920 - 26
    const dragState = makeState({
      ballScreenPos: { x: dragX, y: 400 },
      barLayoutClass: 'horizontal',
      snapEdge: null,
    });
    installApiMock(dragState);

    vi.resetModules();
    const { usePositioning } = await import('../../src/composables/usePositioning');

    const { result, wrapper } = withSetup(() => usePositioning());
    const { ballViewportPos } = result;
    await Promise.resolve();
    await Promise.resolve();

    broadcastState(dragState);

    const snapState = makeState({
      ballScreenPos: { x: snapX, y: 400 },
      barLayoutClass: 'vbar-right',
      snapEdge: 'right',
    });
    broadcastState(snapState, { durationMs: 250, easing: 'easeOutBack', purpose: 'snap' });

    const positions = [];
    flushRafs(0);    positions.push(ballViewportPos.value?.x ?? null);
    flushRafs(75);   positions.push(ballViewportPos.value?.x ?? null);
    flushRafs(100);  positions.push(ballViewportPos.value?.x ?? null);
    flushRafs(75);   positions.push(ballViewportPos.value?.x ?? null);

    expect(positions.every((p) => p !== null)).toBe(true);
    expect(positions[positions.length - 1]).toBeCloseTo(snapX, 1); // wa.x=0 so viewport=screen
    expect(positions[0]).toBeCloseTo(dragX, 1);

    const startX = positions[0];
    const endX = positions[positions.length - 1];
    const intermediates = positions.slice(1, -1);
    const hasIntermediate = intermediates.some((x) => x !== null && x > startX && x < endX);
    expect(hasIntermediate).toBe(true);

    wrapper.unmount();
  });

  it('top snap: ballViewportPos interpolates Y (barLayoutClass stays horizontal)', async () => {
    const dragY = 200;
    const snapYScreen = DISPLAY.workArea.y + 26; // 25 + 26 = 51
    const dragState = makeState({
      ballScreenPos: { x: 400, y: dragY },
      barLayoutClass: 'horizontal',
      snapEdge: null,
    });
    installApiMock(dragState);

    vi.resetModules();
    const { usePositioning } = await import('../../src/composables/usePositioning');

    const { result, wrapper } = withSetup(() => usePositioning());
    const { ballViewportPos } = result;
    await Promise.resolve();
    await Promise.resolve();

    broadcastState(dragState);

    const snapState = makeState({
      ballScreenPos: { x: 400, y: snapYScreen },
      barLayoutClass: 'horizontal',
      snapEdge: 'top',
    });
    broadcastState(snapState, { durationMs: 250, easing: 'easeOutBack', purpose: 'snap' });

    const yPositions = [];
    flushRafs(0);    yPositions.push(ballViewportPos.value?.y ?? null);
    flushRafs(75);   yPositions.push(ballViewportPos.value?.y ?? null);
    flushRafs(100);  yPositions.push(ballViewportPos.value?.y ?? null);
    flushRafs(75);   yPositions.push(ballViewportPos.value?.y ?? null);

    // Final Y in viewport: snapYScreen - wa.y = 51 - 25 = 26.
    expect(yPositions[yPositions.length - 1]).toBeCloseTo(26, 1);
    // Start Y in viewport: dragY - wa.y = 200 - 25 = 175.
    expect(yPositions[0]).toBeCloseTo(175, 1);

    const startY = yPositions[0];
    const endY = yPositions[yPositions.length - 1];
    const intermediates = yPositions.slice(1, -1);
    const hasIntermediate = intermediates.some((y) => y !== null && y < startY && y > endY);
    expect(hasIntermediate).toBe(true);

    wrapper.unmount();
  });

  it('no animation when prev is null (first state on mount — instant jump to position)', async () => {
    installApiMock(null);

    vi.resetModules();
    const { usePositioning } = await import('../../src/composables/usePositioning');

    const { result, wrapper } = withSetup(() => usePositioning());
    const { ballViewportPos } = result;
    await Promise.resolve();
    await Promise.resolve();

    const snapState = makeState({
      ballScreenPos: { x: 26, y: 400 },
      barLayoutClass: 'vbar-left',
      snapEdge: 'left',
    });
    // First ever broadcast — prev is null, animation hint must be ignored.
    broadcastState(snapState, { durationMs: 250, easing: 'easeOutBack', purpose: 'snap' });

    // No RAF should be queued (no animation).
    expect(rafCallbacks.length).toBe(0);
    // Position jumps instantly.
    expect(ballViewportPos.value?.x).toBeCloseTo(26, 1);

    wrapper.unmount();
  });

  it('left snap uses easeOutCubic (no invisible overshoot past viewport wall)', async () => {
    // easeOutBack overshoots past the snap target. For left snap the target
    // sits at x=26px (flush against the viewport left boundary), so any
    // overshoot would push x < 26 and clip invisibly. applyState must
    // override the easing to easeOutCubic, which decelerates smoothly into
    // the wall without clipping.
    const dragState = makeState({
      ballScreenPos: { x: 80, y: 400 },
      barLayoutClass: 'horizontal',
      snapEdge: null,
    });
    installApiMock(dragState);

    vi.resetModules();
    const { usePositioning } = await import('../../src/composables/usePositioning');

    const { result, wrapper } = withSetup(() => usePositioning());
    const { ballViewportPos } = result;
    await Promise.resolve();
    await Promise.resolve();

    broadcastState(dragState);

    const snapState = makeState({
      ballScreenPos: { x: 26, y: 400 },
      barLayoutClass: 'vbar-left',
      snapEdge: 'left',
    });
    // Engine sends easeOutBack — renderer must override to easeOutCubic for side snaps.
    broadcastState(snapState, { durationMs: 250, easing: 'easeOutBack', purpose: 'snap' });

    const xValues = [];
    for (let ms = 0; ms <= 250; ms += 16) {
      flushRafs(16);
      xValues.push(ballViewportPos.value?.x ?? null);
    }

    // easeOutCubic never overshoots: x must stay >= 26 (snap target) throughout.
    // Any x < 26 would indicate easeOutBack leaked through, meaning the ball
    // would clip into the viewport wall and the bounce would be invisible.
    const hasOvershootBeyondTarget = xValues.some((x) => x !== null && x < 26);
    expect(hasOvershootBeyondTarget).toBe(false);

    // The ball must still reach the snap target.
    expect(xValues[xValues.length - 1]).toBeCloseTo(26, 1);

    wrapper.unmount();
  });

  it('top snap still uses easeOutBack (overshoot along Y is handled differently)', async () => {
    // The easing override is scoped to left/right edge snaps only. Top/bottom
    // snaps keep easeOutBack so the overshoot behaviour is preserved.
    const dragState = makeState({
      ballScreenPos: { x: 400, y: 200 },
      barLayoutClass: 'horizontal',
      snapEdge: null,
    });
    installApiMock(dragState);

    vi.resetModules();
    const { usePositioning } = await import('../../src/composables/usePositioning');

    const { result, wrapper } = withSetup(() => usePositioning());
    const { ballViewportPos } = result;
    await Promise.resolve();
    await Promise.resolve();

    broadcastState(dragState);

    const snapYScreen = DISPLAY.workArea.y + 26; // 25 + 26 = 51 → viewport y = 26
    const snapState = makeState({
      ballScreenPos: { x: 400, y: snapYScreen },
      barLayoutClass: 'horizontal',
      snapEdge: 'top',
    });
    broadcastState(snapState, { durationMs: 250, easing: 'easeOutBack', purpose: 'snap' });

    const yValues = [];
    for (let ms = 0; ms <= 250; ms += 16) {
      flushRafs(16);
      yValues.push(ballViewportPos.value?.y ?? null);
    }

    // easeOutBack is still used for top — the ball overshoots y < 26 (above wall).
    const hasOvershoot = yValues.some((y) => y !== null && y < 26);
    expect(hasOvershoot).toBe(true);

    wrapper.unmount();
  });
});

describe('usePositioning — animation not cancelled by non-animated re-broadcasts mid-flight', () => {
  // useBarBoundsCache watches ballViewportX/Y and sends bar-expand intents
  // whenever position changes, which trigger STATE_CHANGED broadcasts with
  // animation=null. When such a re-broadcast targets the same destination as
  // the running animation (within 0.5px), applyState must leave the
  // animation running rather than cancel and teleport to the target.

  beforeEach(() => {
    installTimeStubs();
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    vi.resetModules();
    stateChangedHandler = null;
    rafCallbacks = [];
  });

  it('bar-expand re-broadcast mid-snap does NOT cancel the running animation', async () => {
    // Scenario: ball snaps left (horizontal → vbar-left). On the first RAF tick,
    // useBarBoundsCache fires a bar-expand intent (because ballViewportX changed).
    // The engine re-broadcasts the same state without an animation hint.
    // The animation must survive this re-broadcast and continue interpolating.

    const dragState = makeState({
      ballScreenPos: { x: 300, y: 400 },
      barLayoutClass: 'horizontal',
      snapEdge: null,
    });
    installApiMock(dragState);

    vi.resetModules();
    const { usePositioning } = await import('../../src/composables/usePositioning');

    const { result, wrapper } = withSetup(() => usePositioning());
    const { ballViewportPos } = result;
    await Promise.resolve();
    await Promise.resolve();

    // Seed position from drag.
    broadcastState(dragState);

    // Snap broadcast (animation starts).
    const snapX = 26;
    const snapState = makeState({
      ballScreenPos: { x: snapX, y: 400 },
      barLayoutClass: 'vbar-left',
      snapEdge: 'left',
    });
    broadcastState(snapState, { durationMs: 250, easing: 'easeOutCubic', purpose: 'snap' });

    // After one RAF tick, the bar-expand re-broadcast arrives (same ballScreenPos,
    // no animation hint) — this simulates what useBarBoundsCache triggers.
    flushRafs(16);
    const xAfterFirstTick = ballViewportPos.value?.x ?? null;

    // Re-broadcast the same state without animation (bar-expand response).
    broadcastState(snapState, null);

    // The animation must still be in progress (RAF still queued).
    expect(rafCallbacks.length).toBeGreaterThan(0);

    // Advance to mid-animation and verify position is still interpolating.
    flushRafs(100);
    const xAtMid = ballViewportPos.value?.x ?? null;

    flushRafs(134); // total elapsed ~250ms → animation should be complete
    const xAtEnd = ballViewportPos.value?.x ?? null;

    // xAfterFirstTick must be between start (300) and snap target (26),
    // proving the animation was already running.
    expect(xAfterFirstTick).not.toBeNull();
    expect(xAfterFirstTick).toBeGreaterThan(snapX);
    expect(xAfterFirstTick).toBeLessThan(300);

    // Animation must have continued past mid-point (not teleported to 26 after re-broadcast).
    expect(xAtMid).not.toBeNull();
    expect(xAtMid).toBeGreaterThan(snapX);

    // Final position must reach snap target.
    expect(xAtEnd).toBeCloseTo(snapX, 1);

    wrapper.unmount();
  });

  it('non-animated broadcast with DIFFERENT target still cancels the animation', async () => {
    // Safety check: if a re-broadcast arrives with a genuinely different ballScreenPos,
    // it must still cancel the running animation (user moved the ball to a new position).

    const dragState = makeState({
      ballScreenPos: { x: 300, y: 400 },
      barLayoutClass: 'horizontal',
      snapEdge: null,
    });
    installApiMock(dragState);

    vi.resetModules();
    const { usePositioning } = await import('../../src/composables/usePositioning');

    const { result, wrapper } = withSetup(() => usePositioning());
    const { ballViewportPos } = result;
    await Promise.resolve();
    await Promise.resolve();

    broadcastState(dragState);

    // Start snap animation toward x=26.
    const snapState = makeState({
      ballScreenPos: { x: 26, y: 400 },
      barLayoutClass: 'vbar-left',
      snapEdge: 'left',
    });
    broadcastState(snapState, { durationMs: 250, easing: 'easeOutCubic', purpose: 'snap' });

    // One tick so animation is in-flight.
    flushRafs(16);

    // New non-animated broadcast with a DIFFERENT target (summon to a new position).
    const newState = makeState({
      ballScreenPos: { x: 960, y: 552 },
      barLayoutClass: 'horizontal',
      snapEdge: null,
    });
    broadcastState(newState, null);

    // Animation must be cancelled — no RAF queued.
    expect(rafCallbacks.length).toBe(0);

    // Position must jump instantly to the new target.
    // DISPLAY.workArea.y = 25, so viewport y = 552 - 25 = 527.
    expect(ballViewportPos.value?.x).toBeCloseTo(960, 1);
    expect(ballViewportPos.value?.y).toBeCloseTo(527, 1);

    wrapper.unmount();
  });
});
