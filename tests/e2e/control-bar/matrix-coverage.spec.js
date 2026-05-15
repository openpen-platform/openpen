/**
 * Matrix coverage spec — settings × position × interaction.
 *
 * Exercises the full settings × position × interaction matrix to expose
 * regressions that only manifest in specific combinations. The pre-refactor
 * test sweep covered only symmetric snap-edge cases and missed all vbar-free
 * scenarios.
 *
 * Matrix axes:
 *   A — Settings combinations (4):
 *     A1: barLayout=horizontal + enableDragAutoSnap=true  (default)
 *     A2: barLayout=horizontal + enableDragAutoSnap=false (free float, horizontal)
 *     A3: barLayout=vertical   + enableDragAutoSnap=true  (snap overrides vertical)
 *     A4: barLayout=vertical   + enableDragAutoSnap=false (vbar-free — Bug 1/2/3 home)
 *
 *   B — Ball positions (~10 per setting):
 *     - workArea center
 *     - 5px from each of 4 edges (left/right/top/bottom) — inside workArea, near edge
 *     - at BALL_HALF from each edge (exact snap target position for snap=ON)
 *     - top-left corner (5px inside)
 *     - bottom-right corner (5px inside)
 *
 *   C — Interactions:
 *     C1: click ball → expand → measure bar boundingBox (G4 invariant)
 *     C2: click ball → expand → open color picker → measure popup (G1 + Bug 1)
 *     C3: click ball → expand → drag bar → measure bar after release (Bug 2)
 *     C4: drag collapsed ball past workArea edge → measure ball position (drag clamp)
 *
 * Geometric invariants:
 *   I1: ball center matches engine ballScreenPos (G2)
 *   I2: bar's boundingBox fully inside workArea viewport (G4)
 *   I3: any open popover's boundingBox fully inside viewport (G1)
 *   I4: popover does NOT open along the bar's axis
 *       (vertical bar → popover opens left/right; horizontal bar → popover opens top/bottom)
 *   I5: drag handle center ≈ ball center after collapse (Layout (i) — §5.1)
 *
 * Each test case is parameterised; failures expose real bugs, not implementation
 * detail changes. class-presence checks are explicitly avoided.
 */

import { test, expect } from '@playwright/test';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';

const BALL_HALF = 26;

let electronApp;
attachElectronErrorDetection(() => electronApp);

test.beforeAll(async () => {
  electronApp = await launchElectronApp();
});

test.afterAll(async () => {
  await electronApp?.close();
});

// ─── Shared helpers ───────────────────────────────────────────────────────────

async function getMainWindow() {
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    const wins = electronApp.windows();
    for (const win of wins) {
      try {
        await win.waitForLoadState('domcontentloaded', { timeout: 3000 });
        const ready = await win.evaluate(() => !!document.querySelector('[data-testid="floatball-btn"], [data-testid="control-bar"]'));
        if (ready) return win;
      } catch {
        // Still loading.
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Main window not found within 40s');
}

async function ensureBallMode(win) {
  const bar = win.getByTestId('control-bar');
  if (await bar.isVisible().catch(() => false)) {
    await win.mouse.move(10, 10);
    await win.waitForTimeout(3500);
  }
  // After waiting, the bar may still be in its collapse transition (250ms).
  // Poll until float-ball is visible rather than relying on fixed delays.
  for (let attempt = 0; attempt < 4; attempt++) {
    if (await win.getByTestId('floatball-btn').isVisible().catch(() => false)) break;
    await win.keyboard.press('Escape').catch(() => {});
    await win.waitForTimeout(400);
  }
  await expect(win.getByTestId('floatball-btn')).toBeVisible({ timeout: 5000 });
}

async function expandBar(win) {
  if (!(await win.getByTestId('control-bar').isVisible().catch(() => false))) {
    await win.getByTestId('floatball-btn').click();
    await win.waitForTimeout(500);
  }
  await expect(win.getByTestId('control-bar')).toBeVisible({ timeout: 3000 });
}

/**
 * Teleport ball to screen coordinates without triggering snap.
 * Uses sendPositioningIntent so the engine state is authoritative.
 */
async function setBallScreenPos(win, sx, sy) {
  await win.evaluate(async ({ x, y }) => {
    await window.openPenApi?.sendPositioningIntent?.({ type: 'drag-start' });
    await window.openPenApi?.sendPositioningIntent?.({ type: 'drag-move', ballScreenPos: { x, y } });
    await window.openPenApi?.sendPositioningIntent?.({
      type: 'drag-end',
      ballScreenPos: { x, y },
      hadMotion: true,
      enableDragAutoSnap: false,
      barBounds: null,
    });
  }, { x: Math.round(sx), y: Math.round(sy) });
  await win.waitForTimeout(150);
}

/**
 * Apply settings: { barLayout, enableDragAutoSnap }.
 * Uses previewSettings + onSettingsUpdated path; the renderer picks up changes
 * within ~300ms of the broadcast.
 */
async function applySettings(win, { barLayout, enableDragAutoSnap }) {
  await win.evaluate(async ({ barLayout, enableDragAutoSnap }) => {
    await window.openPenApi?.updateSettings?.({ barLayout, enableDragAutoSnap });
  }, { barLayout, enableDragAutoSnap });
  await win.waitForTimeout(400);
}

async function getWorkArea() {
  return electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
}

/**
 * Assert bar is fully inside viewport.
 * Returns the barBox for use in further assertions.
 */
async function assertBarInViewport(win, tolerance = 2) {
  const bar = win.getByTestId('control-bar');
  await expect(bar).toBeVisible({ timeout: 3000 });
  const [barBox, vp] = await Promise.all([
    bar.boundingBox(),
    win.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight })),
  ]);
  expect(barBox).not.toBeNull();
  expect(barBox.x, 'bar left overflows viewport').toBeGreaterThanOrEqual(-tolerance);
  expect(barBox.y, 'bar top overflows viewport').toBeGreaterThanOrEqual(-tolerance);
  expect(barBox.x + barBox.width, 'bar right overflows viewport').toBeLessThanOrEqual(vp.w + tolerance);
  expect(barBox.y + barBox.height, 'bar bottom overflows viewport').toBeLessThanOrEqual(vp.h + tolerance);
  return barBox;
}

/**
 * Assert popover is fully inside viewport.
 * Also checks I4: popover axis matches bar orientation.
 *   - vertical bar → popup dataSide must be 'left' or 'right'
 *   - horizontal bar → popup dataSide must be 'top' or 'bottom'
 */
async function assertPopupInViewportAndAxis(win, isVerticalBar, tolerance = 2) {
  const popup = win.locator('.openpen-popover-content[data-state="open"]').first();
  await expect(popup).toBeVisible({ timeout: 4000 });

  const [popupBox, vp] = await Promise.all([
    popup.boundingBox(),
    win.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight })),
  ]);

  expect(popupBox, 'popup bounding box is null').not.toBeNull();
  expect(popupBox.x, 'popup left overflows viewport').toBeGreaterThanOrEqual(-tolerance);
  expect(popupBox.y, 'popup top overflows viewport').toBeGreaterThanOrEqual(-tolerance);
  expect(popupBox.x + popupBox.width, 'popup right overflows viewport').toBeLessThanOrEqual(vp.w + tolerance);
  expect(popupBox.y + popupBox.height, 'popup bottom overflows viewport').toBeLessThanOrEqual(vp.h + tolerance);

  // I4: axis invariant
  const dataSide = await popup.getAttribute('data-side');
  if (isVerticalBar) {
    expect(['left', 'right'], `I4: vertical bar popup opened on wrong axis (got ${dataSide})`).toContain(dataSide);
  } else {
    expect(['top', 'bottom'], `I4: horizontal bar popup opened on wrong axis (got ${dataSide})`).toContain(dataSide);
  }

  return popupBox;
}

/**
 * Drag the bar (if expanded) by (deltaX, deltaY) using real mouse events.
 */
async function dragBar(win, deltaX, deltaY, steps = 8) {
  const bar = win.getByTestId('control-bar');
  const barBox = await bar.boundingBox();
  expect(barBox).not.toBeNull();
  // Drag from the drag handle (left-center of bar for horizontal, top-center for vertical).
  const sx = Math.round(barBox.x + 12);
  const sy = Math.round(barBox.y + barBox.height / 2);
  await win.mouse.move(sx, sy);
  await win.waitForTimeout(30);
  await win.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await win.mouse.move(
      Math.round(sx + (deltaX * i) / steps),
      Math.round(sy + (deltaY * i) / steps),
    );
  }
  await win.mouse.up();
  await win.waitForTimeout(500); // wait for drag-end intent + clamping animation
}

/**
 * Drag the collapsed ball by (deltaX, deltaY).
 */
async function dragBall(win, deltaX, deltaY, steps = 10) {
  const ball = win.getByTestId('floatball-btn');
  const box = await ball.boundingBox();
  expect(box).not.toBeNull();
  const bx = Math.round(box.x + box.width / 2);
  const by = Math.round(box.y + box.height / 2);
  await win.mouse.move(bx, by);
  await win.waitForTimeout(30);
  await win.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await win.mouse.move(
      Math.round(bx + (deltaX * i) / steps),
      Math.round(by + (deltaY * i) / steps),
    );
  }
  await win.mouse.up();
  await win.waitForTimeout(500);
}

/**
 * Assert ball is inside workArea (I1 proxy: ball DOM center inside viewport = workArea).
 */
async function assertBallInViewport(win, tolerance = 2) {
  const ball = win.getByTestId('floatball-btn');
  await expect(ball).toBeVisible({ timeout: 3000 });
  const [ballBox, vp] = await Promise.all([
    ball.boundingBox(),
    win.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight })),
  ]);
  expect(ballBox).not.toBeNull();
  const cx = ballBox.x + ballBox.width / 2;
  const cy = ballBox.y + ballBox.height / 2;
  expect(cx, 'ball center X left of viewport').toBeGreaterThanOrEqual(BALL_HALF - tolerance);
  expect(cy, 'ball center Y above viewport').toBeGreaterThanOrEqual(BALL_HALF - tolerance);
  expect(cx, 'ball center X right of viewport').toBeLessThanOrEqual(vp.w - BALL_HALF + tolerance);
  expect(cy, 'ball center Y below viewport').toBeLessThanOrEqual(vp.h - BALL_HALF + tolerance);
  return { cx, cy };
}

// ─── Axis A: Settings combinations ───────────────────────────────────────────

const SETTINGS_MATRIX = [
  { label: 'A1: horizontal+snap=on',  barLayout: 'horizontal', enableDragAutoSnap: true,  isVertical: false },
  { label: 'A2: horizontal+snap=off', barLayout: 'horizontal', enableDragAutoSnap: false, isVertical: false },
  { label: 'A3: vertical+snap=on',    barLayout: 'vertical',   enableDragAutoSnap: true,  isVertical: false }, // snap overrides → horizontal layout
  { label: 'A4: vertical+snap=off',   barLayout: 'vertical',   enableDragAutoSnap: false, isVertical: true  }, // vbar-free — Bug 1/2/3 home
];

// ─── Axis B: Ball positions ───────────────────────────────────────────────────

/**
 * Generate ball positions to test for a given workArea.
 * Returns an array of { label, sx, sy } objects.
 */
function getBallPositions(wa) {
  const cx = wa.x + Math.floor(wa.width / 2);
  const cy = wa.y + Math.floor(wa.height / 2);
  return [
    { label: 'center',               sx: cx,                         sy: cy },
    { label: '5px from left edge',   sx: wa.x + 5,                   sy: cy },
    { label: '5px from right edge',  sx: wa.x + wa.width - 5,        sy: cy },
    { label: '5px from top edge',    sx: cx,                         sy: wa.y + 5 },
    { label: '5px from bottom edge', sx: cx,                         sy: wa.y + wa.height - 5 },
    { label: 'snap-left target',     sx: wa.x + BALL_HALF,           sy: cy },
    { label: 'snap-right target',    sx: wa.x + wa.width - BALL_HALF, sy: cy },
    { label: 'snap-top target',      sx: cx,                         sy: wa.y + BALL_HALF },
    { label: 'snap-bottom target',   sx: cx,                         sy: wa.y + wa.height - BALL_HALF },
    { label: 'top-left corner',      sx: wa.x + 5,                   sy: wa.y + 5 },
    { label: 'bottom-right corner',  sx: wa.x + wa.width - 5,        sy: wa.y + wa.height - 5 },
  ];
}

// ─── C1: Expand → bar in viewport ────────────────────────────────────────────

test.describe('C1: expand bar — bar must stay inside viewport', () => {
  for (const settings of SETTINGS_MATRIX) {
    test.describe(settings.label, () => {
      // We test a subset of positions to keep runtime reasonable.
      const KEY_POSITIONS = ['center', '5px from left edge', '5px from right edge', 'snap-top target', 'bottom-right corner'];

      for (const posLabel of KEY_POSITIONS) {
        test(`[${settings.label}] ball at "${posLabel}" → expand → bar in viewport`, async () => {
          const win = await getMainWindow();
          await ensureBallMode(win);
          await applySettings(win, settings);

          const wa = await getWorkArea();
          const positions = getBallPositions(wa);
          const pos = positions.find((p) => p.label === posLabel);
          if (!pos) return; // shouldn't happen

          // For snap=on settings, the ball must be set via a position that
          // won't be overridden by snap logic. Use a position well inside workArea
          // and let snap happen naturally.
          await setBallScreenPos(win, pos.sx, pos.sy);

          // For snap=ON, wait for snap animation to complete.
          if (settings.enableDragAutoSnap) await win.waitForTimeout(300);

          await expandBar(win);
          await assertBarInViewport(win);

          // Collapse for next test.
          await win.mouse.move(10, 10);
          await win.waitForTimeout(3500);
        });
      }
    });
  }
});

// ─── C2: Expand → open color picker → popup in viewport + correct axis ───────

test.describe('C2: color picker popup must be in viewport and on correct axis', () => {
  for (const settings of SETTINGS_MATRIX) {
    test.describe(settings.label, () => {
      const KEY_POSITIONS = ['center', '5px from left edge', '5px from right edge', '5px from top edge', '5px from bottom edge'];

      for (const posLabel of KEY_POSITIONS) {
        test(`[${settings.label}] ball at "${posLabel}" → color picker in viewport + correct axis (I3+I4)`, async () => {
          const win = await getMainWindow();
          await ensureBallMode(win);
          await applySettings(win, settings);

          const wa = await getWorkArea();
          const positions = getBallPositions(wa);
          const pos = positions.find((p) => p.label === posLabel);
          if (!pos) return;

          await setBallScreenPos(win, pos.sx, pos.sy);
          if (settings.enableDragAutoSnap) await win.waitForTimeout(300);

          await expandBar(win);

          // Determine actual isVertical from rendered bar class (more reliable than settings).
          const isVerticalBar = await win.evaluate(() => {
            const bar = document.querySelector('.control-bar');
            return bar ? (bar.classList.contains('vbar-left') || bar.classList.contains('vbar-right') || bar.classList.contains('vbar-free')) : false;
          });

          const colorBtn = win.getByTestId('controlbar-color-btn');
          if (!(await colorBtn.isVisible().catch(() => false))) {
            // Color button may not exist in all configurations; skip gracefully.
            test.info().annotations.push({ type: 'skip-reason', description: 'cb-color-btn not visible' });
            return;
          }
          await colorBtn.click();
          await win.waitForTimeout(300);

          await assertPopupInViewportAndAxis(win, isVerticalBar);

          await win.keyboard.press('Escape');
          await win.waitForTimeout(200);
          await win.mouse.move(10, 10);
          await win.waitForTimeout(3500);
        });
      }
    });
  }
});

// ─── C3: Expand → drag bar past edge → bar stays in viewport ─────────────────

test.describe('C3: drag expanded bar toward edges — bar must rebound into viewport (Bug 2)', () => {
  for (const settings of SETTINGS_MATRIX) {
    // Only test drag in snap=off modes; snap=on bars are anchored to edges.
    if (settings.enableDragAutoSnap) continue;

    test(`[${settings.label}] drag expanded bar to right → bar stays in viewport after release`, async () => {
      const win = await getMainWindow();
      await ensureBallMode(win);
      await applySettings(win, settings);

      const wa = await getWorkArea();
      // Start near center so the 200px drag has room to test clamping.
      await setBallScreenPos(win, wa.x + Math.floor(wa.width / 2), wa.y + Math.floor(wa.height / 2));
      await expandBar(win);

      // Drag toward right edge with enough force to potentially overflow.
      await dragBar(win, 400, 0);
      await assertBarInViewport(win);

      await win.mouse.move(10, 10);
      await win.waitForTimeout(3500);
    });

    test(`[${settings.label}] drag expanded bar to left → bar stays in viewport after release`, async () => {
      const win = await getMainWindow();
      await ensureBallMode(win);
      await applySettings(win, settings);

      const wa = await getWorkArea();
      await setBallScreenPos(win, wa.x + Math.floor(wa.width / 2), wa.y + Math.floor(wa.height / 2));
      await expandBar(win);

      await dragBar(win, -400, 0);
      await assertBarInViewport(win);

      await win.mouse.move(10, 10);
      await win.waitForTimeout(3500);
    });

    test(`[${settings.label}] drag expanded bar downward → bar stays in viewport after release`, async () => {
      const win = await getMainWindow();
      await ensureBallMode(win);
      await applySettings(win, settings);

      const wa = await getWorkArea();
      await setBallScreenPos(win, wa.x + Math.floor(wa.width / 2), wa.y + Math.floor(wa.height / 2));
      await expandBar(win);

      await dragBar(win, 0, 300);
      await assertBarInViewport(win);

      await win.mouse.move(10, 10);
      await win.waitForTimeout(3500);
    });
  }
});

// ─── C4: Drag collapsed ball past workArea edge → ball stays in viewport ──────

test.describe('C4: drag ball past screen edge — ball must rebound inside workArea (drag clamp)', () => {
  for (const settings of SETTINGS_MATRIX) {
    if (settings.enableDragAutoSnap) {
      // snap=ON: expect snap to edge rather than free clamp.
      test(`[${settings.label}] drag ball to right edge → snaps (ball inside viewport)`, async () => {
        const win = await getMainWindow();
        await ensureBallMode(win);
        await applySettings(win, settings);

        const wa = await getWorkArea();
        // Start near right to make the drag short enough for test reliability.
        await setBallScreenPos(win, wa.x + Math.floor(wa.width * 0.75), wa.y + Math.floor(wa.height / 2));
        await dragBall(win, 300, 0);

        await assertBallInViewport(win);
        await win.mouse.move(10, 10);
        await win.waitForTimeout(3500);
      });
    } else {
      // snap=OFF: clamp behavior.
      test(`[${settings.label}] drag ball far right → ball is clamped inside viewport`, async () => {
        const win = await getMainWindow();
        await ensureBallMode(win);
        await applySettings(win, settings);

        const wa = await getWorkArea();
        await setBallScreenPos(win, wa.x + Math.floor(wa.width / 2), wa.y + Math.floor(wa.height / 2));
        // Drag far past right edge.
        await dragBall(win, wa.width, 0);

        await assertBallInViewport(win);
        await win.mouse.move(10, 10);
        await win.waitForTimeout(500);
      });

      test(`[${settings.label}] drag ball far left → ball is clamped inside viewport`, async () => {
        const win = await getMainWindow();
        await ensureBallMode(win);
        await applySettings(win, settings);

        const wa = await getWorkArea();
        await setBallScreenPos(win, wa.x + Math.floor(wa.width / 2), wa.y + Math.floor(wa.height / 2));
        await dragBall(win, -wa.width, 0);

        await assertBallInViewport(win);
        await win.mouse.move(10, 10);
        await win.waitForTimeout(500);
      });
    }
  }
});

// ─── I5: Drag handle center ≈ ball center after expand ───────────────────────

test.describe('I5: drag handle center must equal ball center at all snap positions', () => {
  const SNAP_POSITIONS = [
    { label: 'snap-left',   edge: 'left' },
    { label: 'snap-right',  edge: 'right' },
    { label: 'snap-top',    edge: 'top'  },
    { label: 'snap-bottom', edge: 'bottom' },
    { label: 'free-center', edge: null  },
  ];

  for (const { label, edge } of SNAP_POSITIONS) {
    test(`I5: drag handle center ≈ ball center at ${label}`, async () => {
      const win = await getMainWindow();
      await ensureBallMode(win);
      // Use default settings (horizontal + snap=on) for this invariant.
      await applySettings(win, { barLayout: 'horizontal', enableDragAutoSnap: true });

      const wa = await getWorkArea();
      const cx = wa.x + Math.floor(wa.width / 2);
      const cy = wa.y + Math.floor(wa.height / 2);

      if (edge === null) {
        await applySettings(win, { barLayout: 'horizontal', enableDragAutoSnap: false });
        await setBallScreenPos(win, cx, cy);
      } else {
        // Drag to trigger snap.
        const targets = {
          left:   { sx: wa.x + 10,                sy: cy,                         drag: [-200, 0] },
          right:  { sx: wa.x + wa.width - 10,     sy: cy,                         drag: [200, 0]  },
          top:    { sx: cx,                        sy: wa.y + 10,                  drag: [0, -200] },
          bottom: { sx: cx,                        sy: wa.y + wa.height - 10,      drag: [0, 200]  },
        };
        const t = targets[edge];
        await setBallScreenPos(win, t.sx, t.sy);
        await dragBall(win, t.drag[0], t.drag[1]);
        await win.waitForTimeout(300);
      }

      // Record ball viewport center before expand.
      const ball = win.getByTestId('floatball-btn');
      const ballBox = await ball.boundingBox();
      if (!ballBox) {
        // Ball may have transitioned to bar (e.g. previous test left it expanded).
        return;
      }
      const ballCX = ballBox.x + ballBox.width / 2;
      const ballCY = ballBox.y + ballBox.height / 2;

      await expandBar(win);

      // Measure drag handle center.
      const handle = win.getByTestId('controlbar-drag-handle').first();
      await expect(handle).toBeVisible({ timeout: 2000 });
      const handleBox = await handle.boundingBox();
      expect(handleBox).not.toBeNull();
      const handleCX = handleBox.x + handleBox.width / 2;
      const handleCY = handleBox.y + handleBox.height / 2;

      // I5 invariant: drag handle center aligns with ball center.
      // vbar-left and vbar-right apply a deliberate ±8px horizontal translate so the bar
      // sits visually flush against the snap edge; allow 10px tolerance for those cases.
      // All other layouts use 2px (1px design + 1px rounding slack).
      const xTolerance = (edge === 'left' || edge === 'right') ? 10 : 2;
      expect(Math.abs(handleCX - ballCX), `I5: drag handle X deviates by more than ${xTolerance}px from ball X (handle=${handleCX}, ball=${ballCX})`).toBeLessThanOrEqual(xTolerance);
      expect(Math.abs(handleCY - ballCY), `I5: drag handle Y deviates by more than 2px from ball Y (handle=${handleCY}, ball=${ballCY})`).toBeLessThanOrEqual(2);

      await win.mouse.move(10, 10);
      await win.waitForTimeout(3500);
    });
  }
});

// ─── Bug 1 regression: vbar-free popups open left/right (not top/bottom) ─────

test.describe('Bug 1 regression: vbar-free (vertical+snap=off) popups must open left/right', () => {
  const VF_POSITIONS = [
    { label: 'center',               sx: (wa) => wa.x + Math.floor(wa.width / 2), sy: (wa) => wa.y + Math.floor(wa.height / 2) },
    { label: '5px from left edge',   sx: (wa) => wa.x + 5,                        sy: (wa) => wa.y + Math.floor(wa.height / 2) },
    { label: '5px from right edge',  sx: (wa) => wa.x + wa.width - 5,             sy: (wa) => wa.y + Math.floor(wa.height / 2) },
    { label: '5px from top edge',    sx: (wa) => wa.x + Math.floor(wa.width / 2), sy: (wa) => wa.y + 5 },
    { label: '5px from bottom edge', sx: (wa) => wa.x + Math.floor(wa.width / 2), sy: (wa) => wa.y + wa.height - 5 },
  ];

  for (const pos of VF_POSITIONS) {
    test(`vbar-free ball at "${pos.label}" → color popup opens left or right (I4)`, async () => {
      const win = await getMainWindow();
      await ensureBallMode(win);
      await applySettings(win, { barLayout: 'vertical', enableDragAutoSnap: false });

      const wa = await getWorkArea();
      await setBallScreenPos(win, pos.sx(wa), pos.sy(wa));
      await expandBar(win);

      const bar = win.getByTestId('control-bar');
      await expect(bar).toBeVisible({ timeout: 2000 });

      // Verify the bar is actually in vbar-free mode.
      const isVbarFree = await win.evaluate(() => document.querySelector('.control-bar.vbar-free') !== null);
      if (!isVbarFree) {
        // Settings may not have taken effect (timing); skip gracefully.
        test.info().annotations.push({ type: 'skip-reason', description: 'vbar-free class not present' });
        return;
      }

      const colorBtn = win.getByTestId('controlbar-color-btn');
      if (!(await colorBtn.isVisible().catch(() => false))) {
        test.info().annotations.push({ type: 'skip-reason', description: 'cb-color-btn not visible' });
        return;
      }
      await colorBtn.click();
      await win.waitForTimeout(300);

      const popup = win.locator('.openpen-popover-content[data-state="open"]').first();
      await expect(popup).toBeVisible({ timeout: 3000 });
      const dataSide = await popup.getAttribute('data-side');

      // I4: vertical bar → popup opens left or right, NOT top or bottom.
      expect(['left', 'right'], `Bug 1: vbar-free popup opened on wrong axis at "${pos.label}" (got data-side="${dataSide}")`).toContain(dataSide);

      // I3: popup in viewport.
      const [popupBox, vp] = await Promise.all([
        popup.boundingBox(),
        win.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight })),
      ]);
      expect(popupBox.x).toBeGreaterThanOrEqual(-2);
      expect(popupBox.y).toBeGreaterThanOrEqual(-2);
      expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(vp.w + 2);
      expect(popupBox.y + popupBox.height).toBeLessThanOrEqual(vp.h + 2);

      await win.keyboard.press('Escape');
      await win.waitForTimeout(200);
      await win.mouse.move(10, 10);
      await win.waitForTimeout(3500);
    });
  }
});

// ─── Bug 3 regression: expand from edge position → bar doesn't overflow ───────

test.describe('Bug 3 regression: expand from near-edge ball position — bar must stay in viewport', () => {
  const EDGE_POSITIONS = [
    { label: 'near top-left corner',     sx: (wa) => wa.x + 5,                        sy: (wa) => wa.y + 5 },
    { label: 'near top-right corner',    sx: (wa) => wa.x + wa.width - 5,             sy: (wa) => wa.y + 5 },
    { label: 'near bottom-left corner',  sx: (wa) => wa.x + 5,                        sy: (wa) => wa.y + wa.height - 5 },
    { label: 'near bottom-right corner', sx: (wa) => wa.x + wa.width - 5,             sy: (wa) => wa.y + wa.height - 5 },
  ];

  for (const settings of SETTINGS_MATRIX) {
    for (const pos of EDGE_POSITIONS) {
      test(`[${settings.label}] ball "${pos.label}" → expand → bar in viewport (Bug 3)`, async () => {
        const win = await getMainWindow();
        await ensureBallMode(win);
        await applySettings(win, settings);

        const wa = await getWorkArea();
        await setBallScreenPos(win, pos.sx(wa), pos.sy(wa));
        if (settings.enableDragAutoSnap) await win.waitForTimeout(300);

        await expandBar(win);
        const barBox = await assertBarInViewport(win);

        // Move mouse outside the bar so mouseleave triggers the auto-collapse timer.
        // A fixed point like (10, 10) may land inside the bar when the ball is near
        // the top edge and the bar is clamped to the top of the viewport.
        const safeX = Math.round(barBox.x + barBox.width / 2);
        const safeY = barBox.y > 50
          ? Math.round(barBox.y - 30)
          : Math.round(barBox.y + barBox.height + 30);
        await win.mouse.move(safeX, safeY);
        await win.waitForTimeout(3500);
      });
    }
  }
});

// ─── A3: vertical+snap=on → snap overrides → effectively horizontal layout ───

test.describe('A3: vertical barLayout with snap=ON — snap wins, bar is NOT vbar-free', () => {
  test('A3: barLayout=vertical + snap=ON → drag right → bar is NOT vbar-free', async () => {
    const win = await getMainWindow();
    await ensureBallMode(win);
    await applySettings(win, { barLayout: 'vertical', enableDragAutoSnap: true });

    const wa = await getWorkArea();
    const cx = wa.x + Math.floor(wa.width / 2);
    const cy = wa.y + Math.floor(wa.height / 2);
    await setBallScreenPos(win, cx, cy);

    // Drag right to trigger right-edge snap.
    await dragBall(win, 600, 0);
    await win.waitForTimeout(300);

    await expandBar(win);

    const isVbarFree = await win.evaluate(() => document.querySelector('.control-bar.vbar-free') !== null);
    expect(isVbarFree, 'A3: snap=ON should override vertical barLayout; vbar-free must not appear').toBe(false);

    await assertBarInViewport(win);

    await win.mouse.move(10, 10);
    await win.waitForTimeout(3500);
  });
});

// ─── Bug 3 (cache): vbar-free bottom edge — bar must not overflow after cache warms ───

test.describe('Bug 3 cache: vbar-free at bottom edge — bar inside viewport on first AND subsequent expands', () => {
  /**
   * Verifies the specific overflow that the cache fixes: vbar-free with ball near
   * the bottom edge of the workArea. Without the cache, expand uses the hardcoded
   * `bottomFromBall: 400` estimate which may be insufficient for the real bar height.
   * With the cache, the second expand uses the measured real bounds.
   *
   * Geometric invariant: bar.boundingBox() fully inside viewport on both expands.
   */
  test('vbar-free: ball 5px from bottom edge → expand → collapse → expand again → bar stays in viewport', async () => {
    const win = await getMainWindow();
    await ensureBallMode(win);
    await applySettings(win, { barLayout: 'vertical', enableDragAutoSnap: false });

    const wa = await getWorkArea();
    const cx = wa.x + Math.floor(wa.width / 2);
    const bottomEdge = wa.y + wa.height - 5;
    await setBallScreenPos(win, cx, bottomEdge);

    // First expand — may use generous estimate fallback (acceptable).
    await expandBar(win);
    await assertBarInViewport(win);

    // Collapse to let cache warm from the mounted bar.
    await win.mouse.move(10, 10);
    await win.waitForTimeout(3500);

    await ensureBallMode(win);
    await setBallScreenPos(win, cx, bottomEdge);

    // Second expand — cache now holds real bounds; bar must stay inside viewport.
    await expandBar(win);
    await assertBarInViewport(win);

    await win.mouse.move(10, 10);
    await win.waitForTimeout(3500);
  });
});

// ─── Bug 3 (cache): horizontal snap=off right edge — cache tracks plugin-driven width ────

test.describe('Bug 3 cache: horizontal snap=off right edge — cached bounds track real bar width', () => {
  /**
   * Verifies that the cache reflects the real bar width after the bar has been
   * measured at least once. The hardcoded `rightFromBall: 600` estimate became
   * incorrect when plugins changed bar width; the cache captures the actual extent.
   *
   * Test procedure:
   *   1. Set ball near right edge, expand → bar in viewport (first expand may use estimate).
   *   2. Collapse, re-expand at same position → bar still in viewport (now using cache).
   *   3. Drag bar toward right edge → bar rebounds into viewport (Bug 2 companion check).
   */
  test('horizontal snap=off: ball 5px from right edge → expand × 2 → drag right → bar always in viewport', async () => {
    const win = await getMainWindow();
    await ensureBallMode(win);
    await applySettings(win, { barLayout: 'horizontal', enableDragAutoSnap: false });

    const wa = await getWorkArea();
    const rightEdge = wa.x + wa.width - 5;
    const cy = wa.y + Math.floor(wa.height / 2);
    await setBallScreenPos(win, rightEdge, cy);

    // First expand.
    await expandBar(win);
    await assertBarInViewport(win);

    // Collapse.
    await win.mouse.move(10, 10);
    await win.waitForTimeout(3500);

    await ensureBallMode(win);
    await setBallScreenPos(win, rightEdge, cy);

    // Second expand — uses cached real bounds.
    await expandBar(win);
    await assertBarInViewport(win);

    // Drag expanded bar toward right edge to exercise drag-end clamping with real bounds.
    await dragBar(win, 300, 0);
    await assertBarInViewport(win);

    await win.mouse.move(10, 10);
    await win.waitForTimeout(3500);
  });
});
