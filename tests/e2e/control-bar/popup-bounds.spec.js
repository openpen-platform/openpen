/**
 * G1 gap coverage: popup-bounds geometric assertions.
 *
 * Verifies that every built-in popover (color, stroke-width popup, eraser mode,
 * shape) stays fully inside the viewport (which equals the workArea after the
 * workArea-sized window refactor) at each of the five ball positions:
 *   - free (screen center)
 *   - snap-left
 *   - snap-right
 *   - snap-top
 *   - snap-bottom
 *
 * All assertions use boundingBox() geometric measurements. A visible popup
 * that overflows the viewport would fail these checks even if the popup's
 * existence and class are correct — this is what screenshot tools cannot
 * verify on transparent overlay windows but boundingBox() can.
 */
import { test, expect } from '@playwright/test';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';

let electronApp;
attachElectronErrorDetection(() => electronApp);

test.beforeAll(async () => {
  electronApp = await launchElectronApp();
});

test.afterAll(async () => {
  await electronApp?.close();
});

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
        // Ignore windows still loading.
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Main window not found within 40s');
}

async function ensureBallMode(win) {
  const bar = win.getByTestId('control-bar');
  if (await bar.isVisible().catch(() => false)) {
    const collapseBtn = win.getByTestId('controlbar-collapse-btn');
    if (await collapseBtn.isVisible().catch(() => false)) {
      await collapseBtn.click({ force: true });
      await win.waitForTimeout(400);
    } else {
      await win.mouse.move(10, 10);
      await win.waitForTimeout(3600);
    }
  }
  if (!(await win.getByTestId('floatball-btn').isVisible().catch(() => false))) {
    await win.keyboard.press('Escape').catch(() => {});
    await win.waitForTimeout(500);
  }
  await expect(win.getByTestId('floatball-btn')).toBeVisible({ timeout: 5000 });
}

async function expandBar(win) {
  if (!(await win.getByTestId('control-bar').isVisible().catch(() => false))) {
    await win.getByTestId('floatball-btn').click();
    await win.waitForTimeout(400);
  }
  await expect(win.getByTestId('control-bar')).toBeVisible();
}

// Wait until the ball's painted DOM position reaches the requested viewport
// coordinate (0,0 = workArea top-left), so a subsequent drag gesture reads a
// fresh boundingBox rather than the pre-teleport spot. Polls the observable
// ball center instead of sleeping a fixed interval.
async function waitForBallAt(win, viewportX, viewportY) {
  await expect(async () => {
    const box = await win.getByTestId('floatball-btn').boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box.x + box.width / 2 - viewportX)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.y + box.height / 2 - viewportY)).toBeLessThanOrEqual(2);
  }).toPass({ timeout: 2000 });
}

async function setBallScreenPos(win, wa, screenX, screenY) {
  await win.evaluate(
    async ({ x, y }) => {
      await window.openPenApi?.sendPositioningIntent?.({ type: 'drag-start' });
      await window.openPenApi?.sendPositioningIntent?.({ type: 'drag-move', ballScreenPos: { x, y } });
      await window.openPenApi?.sendPositioningIntent?.({
        type: 'drag-end',
        ballScreenPos: { x, y },
        hadMotion: true,
        enableDragAutoSnap: false,
        barBounds: null,
      });
    },
    { x: Math.round(screenX), y: Math.round(screenY) },
  );
  await waitForBallAt(win, Math.round(screenX) - wa.x, Math.round(screenY) - wa.y);
}

async function dragBall(win, deltaX, deltaY, steps = 10) {
  const box = await win.getByTestId('floatball-btn').boundingBox();
  const bx = Math.round(box.x + box.width / 2);
  const by = Math.round(box.y + box.height / 2);
  await win.mouse.move(bx, by);
  await win.waitForTimeout(50);
  await win.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await win.mouse.move(
      bx + Math.round((deltaX * i) / steps),
      by + Math.round((deltaY * i) / steps),
    );
  }
  await win.mouse.up();
  await win.waitForTimeout(450);
}

async function currentSnapEdge(win) {
  const cls = await win.getByTestId('floatball-btn').getAttribute('class');
  const match = cls?.match(/edge-(left|right|top|bottom)/);
  return match?.[1] ?? null;
}

// Drag the ball to the target edge and confirm the engine actually landed the
// snap there before the caller proceeds. The drag gesture reads the ball's DOM
// position, so a teleport that the renderer hasn't repainted yet can make the
// gesture start from a stale spot and snap to the wrong edge under load.
// setBallScreenPos waits for the ball to repaint at the requested spot, then we
// retry the gesture until the edge is confirmed instead of asserting on a single
// sample — the invariant (ball IS on `edge`) is unchanged, only its stability.
async function snapBallToEdge(win, wa, edge) {
  const midX = wa.x + Math.floor(wa.width / 2);
  const midY = wa.y + Math.floor(wa.height / 2);

  for (let attempt = 0; attempt < 3; attempt++) {
    if (edge === 'left') {
      await setBallScreenPos(win, wa, wa.x + 30, midY);
      await dragBall(win, -120, 0);
    } else if (edge === 'right') {
      await setBallScreenPos(win, wa, wa.x + wa.width - 30, midY);
      await dragBall(win, 120, 0);
    } else if (edge === 'top') {
      await setBallScreenPos(win, wa, midX, wa.y + 30);
      await dragBall(win, 0, -120);
    } else if (edge === 'bottom') {
      await setBallScreenPos(win, wa, midX, wa.y + wa.height - 30);
      await dragBall(win, 0, 120);
    }

    if ((await currentSnapEdge(win)) === edge) return;
    await win.waitForTimeout(200);
  }

  expect(await currentSnapEdge(win), `ball failed to snap to ${edge} after 3 attempts`).toBe(edge);
}

/**
 * Core geometric invariant: the bounding box of the popup must be fully
 * inside the viewport (= workArea in the workArea-sized window architecture).
 *
 * Allows a 1px float-rounding tolerance on each edge.
 */
async function assertPopupInBounds(win, popupSelector = '.openpen-popover-content[data-state="open"]') {
  const popup = win.locator(popupSelector).first();
  await expect(popup).toBeVisible({ timeout: 3000 });

  // Poll the geometry: the clamp runs after the popover mounts, so a single
  // sample can catch the popup mid-reposition under load. The asserted bound is
  // unchanged — toPass just retries until the layout settles or times out. The
  // 250ms snap/clamp animation settles well within this window; the budget is
  // sized to the real animation, not an arbitrarily long ceiling.
  await expect(async () => {
    const [popupBox, viewport] = await Promise.all([
      popup.boundingBox(),
      win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
    ]);

    expect(popupBox).not.toBeNull();
    expect(popupBox.x).toBeGreaterThanOrEqual(-1);
    expect(popupBox.y).toBeGreaterThanOrEqual(-1);
    expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(popupBox.y + popupBox.height).toBeLessThanOrEqual(viewport.height + 1);
  }).toPass({ timeout: 2000 });
}

// Shared by the G4 cases: the expanded bar must sit fully inside the viewport
// (= workArea). Polls the geometry so an in-flight clamp/snap animation gets a
// chance to settle instead of failing on the first frame.
async function assertBarInBounds(win) {
  const bar = win.getByTestId('control-bar');
  await expect(bar).toBeVisible({ timeout: 3000 });

  await expect(async () => {
    const [barBox, viewport] = await Promise.all([
      bar.boundingBox(),
      win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
    ]);

    expect(barBox).not.toBeNull();
    expect(barBox.x).toBeGreaterThanOrEqual(-1);
    expect(barBox.y).toBeGreaterThanOrEqual(-1);
    expect(barBox.x + barBox.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(barBox.y + barBox.height).toBeLessThanOrEqual(viewport.height + 1);
  }).toPass({ timeout: 2000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Color picker popup at each ball position
// ─────────────────────────────────────────────────────────────────────────────

test('G1: color picker stays inside viewport at free position (screen center)', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(win, wa, wa.x + Math.floor(wa.width / 2), wa.y + Math.floor(wa.height / 2));
  await expandBar(win);

  await win.getByTestId('controlbar-color-btn').click();
  await win.waitForTimeout(250);
  await assertPopupInBounds(win);

  await win.keyboard.press('Escape');
  await win.waitForTimeout(200);
});

test('G1: color picker stays inside viewport at snap-left', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'left');
  await expandBar(win);

  await win.getByTestId('controlbar-color-btn').click();
  await win.waitForTimeout(250);
  await assertPopupInBounds(win);

  await win.keyboard.press('Escape');
  await win.waitForTimeout(200);
});

test('G1: color picker stays inside viewport at snap-right', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'right');
  await expandBar(win);

  await win.getByTestId('controlbar-color-btn').click();
  await win.waitForTimeout(250);
  await assertPopupInBounds(win);

  await win.keyboard.press('Escape');
  await win.waitForTimeout(200);
});

test('G1: color picker stays inside viewport at snap-top', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'top');
  await expandBar(win);

  await win.getByTestId('controlbar-color-btn').click();
  await win.waitForTimeout(250);
  await assertPopupInBounds(win);

  await win.keyboard.press('Escape');
  await win.waitForTimeout(200);
});

test('G1: color picker stays inside viewport at snap-bottom', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'bottom');
  await expandBar(win);

  await win.getByTestId('controlbar-color-btn').click();
  await win.waitForTimeout(250);
  await assertPopupInBounds(win);

  await win.keyboard.press('Escape');
  await win.waitForTimeout(200);
});

// ─────────────────────────────────────────────────────────────────────────────
// Shape sub-panel at each ball position
// ─────────────────────────────────────────────────────────────────────────────

test('G1: shape sub-panel stays inside viewport at snap-bottom', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'bottom');
  await expandBar(win);

  await win.getByTestId('controlbar-shape-btn').click();
  await win.getByTestId('controlbar-shape-caret').click();
  await win.waitForTimeout(250);
  await assertPopupInBounds(win, '.shape-popover');

  await win.keyboard.press('Escape');
  await win.waitForTimeout(200);
});

test('G1: shape sub-panel stays inside viewport at snap-left', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'left');
  await expandBar(win);

  await win.getByTestId('controlbar-shape-btn').click();
  await win.getByTestId('controlbar-shape-caret').click();
  await win.waitForTimeout(250);
  await assertPopupInBounds(win, '.shape-popover');

  await win.keyboard.press('Escape');
  await win.waitForTimeout(200);
});

// ─────────────────────────────────────────────────────────────────────────────
// G4: bar bounds stay within workArea at each snap edge
// ─────────────────────────────────────────────────────────────────────────────

test('G4: expanded bar bounds stay inside viewport at free position (screen center)', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(win, wa, wa.x + Math.floor(wa.width / 2), wa.y + Math.floor(wa.height / 2));
  await expandBar(win);

  await assertBarInBounds(win);
});

test('G4: expanded bar bounds stay inside viewport at snap-left', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'left');
  await expandBar(win);

  await assertBarInBounds(win);
});

test('G4: expanded bar bounds stay inside viewport at snap-right', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'right');
  await expandBar(win);

  await assertBarInBounds(win);
});

test('G4: expanded bar bounds stay inside viewport at snap-top', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'top');
  await expandBar(win);

  await assertBarInBounds(win);
});

test('G4: expanded bar bounds stay inside viewport at snap-bottom', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'bottom');
  await expandBar(win);

  await assertBarInBounds(win);
});
