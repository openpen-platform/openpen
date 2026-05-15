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

/** Return the main window once its DOM has loaded. */
async function getMainWindow() {
  const deadline = Date.now() + 40000;

  while (Date.now() < deadline) {
    const wins = electronApp.windows();
    for (const win of wins) {
      try {
        await win.waitForLoadState('domcontentloaded', { timeout: 3000 });
        const hasMainUi = await win.evaluate(
          () => !!document.querySelector('[data-testid="floatball-btn"], [data-testid="control-bar"]')
        );
        if (hasMainUi) return win;
      } catch {
        // Ignore closed or still-loading windows; keep polling.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Unable to locate main window with .float-ball/.control-bar within 40s');
}

/**
 * Teleport the ball to a screen coordinate without triggering snap.
 *
 * Sends drag-start + drag-move + drag-end (enableDragAutoSnap=false) intents
 * so the ball is positioned at (screenX, screenY) and the engine broadcasts
 * the new ballViewportPos to the renderer.
 */
async function setBallScreenPos(win, screenX, screenY) {
  await win.evaluate(
    async ({ x, y }) => {
      await window.openPenApi?.sendPositioningIntent?.({ type: 'drag-start' });
      await window.openPenApi?.sendPositioningIntent?.({
        type: 'drag-move',
        ballScreenPos: { x, y },
      });
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
  // Give the renderer time to apply the new CSS variables.
  await win.waitForTimeout(100);
}

/** Ensure the app is in ball mode, collapsing first if needed. */
async function ensureBallMode(win) {
  const ball = win.getByTestId('floatball-btn');
  const bar  = win.getByTestId('control-bar');
  if (await bar.isVisible().catch(() => false)) {
    await win.mouse.move(0, 0);
    await win.waitForTimeout(3500);
  }

  if (!(await ball.isVisible().catch(() => false))) {
    await win.keyboard.press('Escape').catch(() => {});
    await win.waitForTimeout(400);
  }

  if (!(await ball.isVisible().catch(() => false))) {
    await win.reload();
    await win.waitForLoadState('domcontentloaded');
    await win.waitForFunction(() => !!document.querySelector('[data-testid="floatball-btn"], [data-testid="control-bar"]'), null, { timeout: 10000 });
  }

  await expect(ball).toBeVisible({ timeout: 5000 });
}

// ─────────────────────────────────────────────────────────────────────────────

test('initial state: ball has no edge-* class (not snapped)', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const ball = win.getByTestId('floatball-btn');
  const cls = await ball.getAttribute('class');
  expect(cls).not.toMatch(/edge-/);
});

test('after a drag, the ball gains an edge-* class (snapped)', async () => {
  const win  = await getMainWindow();
  await ensureBallMode(win);

  const ball = win.getByTestId('floatball-btn');
  const box  = await ball.boundingBox();
  const cx   = box.x + box.width  / 2;
  const cy   = box.y + box.height / 2;

  // Drag far to the right (well past DRAG_THRESHOLD) to trigger drag + snap.
  await win.mouse.move(cx, cy);
  await win.mouse.down();
  for (let i = 1; i <= 15; i++) {
    await win.mouse.move(cx + i * 15, cy);
  }
  await win.mouse.up();

  // 250ms snap animation plus a little slack.
  await win.waitForTimeout(400);

  const cls = await ball.getAttribute('class');
  expect(cls).toMatch(/edge-(left|right|top|bottom)/);
});

test('motion under the drag threshold counts as a click and expands the bar', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const ball = win.getByTestId('floatball-btn');
  const box  = await ball.boundingBox();
  const cx   = box.x + box.width  / 2;
  const cy   = box.y + box.height / 2;

  // 2px move is under DRAG_THRESHOLD=4px and should not trigger drag.
  await win.mouse.move(cx, cy);
  await win.mouse.down();
  await win.mouse.move(cx + 2, cy + 1);
  await win.mouse.up();

  await expect(win.getByTestId('control-bar')).toBeVisible({ timeout: 1000 });
});

test('a large drag does not expand the bar (movement suppresses the click)', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const ball = win.getByTestId('floatball-btn');
  const bar  = win.getByTestId('control-bar');

  // Use boundingBox to find the real ball position in the workArea viewport.
  const box = await ball.boundingBox();
  const cx = Math.round(box.x + box.width / 2);
  const cy = Math.round(box.y + box.height / 2);

  // Drag 150px left — far beyond the 4px threshold.
  await win.mouse.move(cx, cy);
  await win.mouse.down();
  for (let i = 1; i <= 15; i++) {
    await win.mouse.move(cx - i * 10, cy);
  }
  await win.mouse.up();
  await win.waitForTimeout(400);

  await expect(ball).toBeVisible();
  await expect(bar).not.toBeVisible();
});

test('dragging right (ball near right edge) snaps to edge-right', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  // Teleport ball near the right edge of the workArea without triggering snap.
  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  // ballScreenX = wa.right - 20 (close to the edge but not yet snapped).
  const ballX = wa.x + wa.width - 20;
  const ballY = wa.y + Math.floor(wa.height / 2);
  await setBallScreenPos(win, ballX, ballY);

  // Ball is now visible in the viewport; drag slightly right to trigger snap.
  const box = await win.getByTestId('floatball-btn').boundingBox();
  const cx = Math.round(box.x + box.width / 2);
  const cy = Math.round(box.y + box.height / 2);

  await win.mouse.move(cx, cy);
  await win.waitForTimeout(50);
  await win.mouse.down();
  for (let i = 1; i <= 10; i++) await win.mouse.move(cx + i * 10, cy);
  await win.mouse.up();

  // ~300ms total: 50ms drag-end delay + 250ms snap animation, plus slack.
  await win.waitForTimeout(400);

  const cls = await win.getByTestId('floatball-btn').getAttribute('class');
  expect(cls).toMatch(/edge-right/);
});

test('dragging left (ball near left edge) snaps to edge-left', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  // Teleport ball near the left edge.
  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const ballX = wa.x + 20;
  const ballY = wa.y + Math.floor(wa.height / 2);
  await setBallScreenPos(win, ballX, ballY);

  const box = await win.getByTestId('floatball-btn').boundingBox();
  const cx = Math.round(box.x + box.width / 2);
  const cy = Math.round(box.y + box.height / 2);
  await win.mouse.move(cx, cy);
  await win.waitForTimeout(50);
  await win.mouse.down();
  for (let i = 1; i <= 10; i++) await win.mouse.move(cx - i * 10, cy);
  await win.mouse.up();
  await win.waitForTimeout(400);

  const cls = await win.getByTestId('floatball-btn').getAttribute('class');
  expect(cls).toMatch(/edge-left/);
});

test('after snapping, clicking the ball still expands the bar', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const ball = win.getByTestId('floatball-btn');
  const bar  = win.getByTestId('control-bar');

  // First trigger a snap via a large drag.
  const box = await ball.boundingBox();
  const cx = Math.round(box.x + box.width / 2);
  const cy = Math.round(box.y + box.height / 2);
  await win.mouse.move(cx, cy);
  await win.mouse.down();
  for (let i = 1; i <= 15; i++) {
    await win.mouse.move(cx + i * 15, cy);
  }
  await win.mouse.up();

  await win.waitForTimeout(600);
  await expect(ball).toBeVisible();

  // After snap, use boundingBox() to find the real ball position.
  const snappedBox = await ball.boundingBox();
  const bx = snappedBox.x + snappedBox.width / 2;
  const by = snappedBox.y + snappedBox.height / 2;
  await win.mouse.move(bx, by);
  await win.mouse.down();
  await win.mouse.move(bx + 1, by); // 1px move, under DRAG_THRESHOLD
  await win.mouse.up();

  await expect(bar).toBeVisible({ timeout: 1000 });
});

test('edge half-circle temporarily reverts to full circle after 1px of motion (mousedown alone keeps edge-*)', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const ball = win.getByTestId('floatball-btn');

  // Snap to the left edge first by teleporting ball near it and dragging.
  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(win, wa.x + 20, wa.y + Math.floor(wa.height / 2));
  await win.waitForTimeout(200);

  const box = await ball.boundingBox();
  const bx = Math.round(box.x + box.width / 2);
  const by = Math.round(box.y + box.height / 2);
  await win.mouse.move(bx, by);
  await win.waitForTimeout(50);
  await win.mouse.down();
  for (let i = 1; i <= 10; i++) await win.mouse.move(bx - i * 10, by);
  await win.mouse.up();
  await win.waitForTimeout(450);

  const snappedClass = await ball.getAttribute('class');
  expect(snappedClass).toMatch(/edge-left/);

  // Pressing the mouse down (without moving) should keep the edge-* class.
  const snappedBox = await ball.boundingBox();
  const sx = Math.round(snappedBox.x + snappedBox.width / 2);
  const sy = Math.round(snappedBox.y + snappedBox.height / 2);
  await win.mouse.move(sx, sy);
  await win.waitForTimeout(50);
  await win.mouse.down();
  await win.waitForTimeout(60);
  const downClass = await ball.getAttribute('class');
  expect(downClass).toMatch(/edge-left/);

  // 1px of motion drops edge-* and reverts to a full circle.
  await win.mouse.move(sx - 1, sy);
  await win.waitForTimeout(120);
  const draggingClass = await ball.getAttribute('class');
  expect(draggingClass).not.toMatch(/edge-(left|right)/);

  await win.mouse.up();
  await win.waitForTimeout(300);
});

test('during a side snap, the ball stays circular until the animation reaches the edge', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const ball = win.getByTestId('floatball-btn');

  // Place ball near the left edge so the snap target is clearly the left edge.
  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(win, wa.x + 40, wa.y + Math.floor(wa.height / 2));
  await win.waitForTimeout(200);

  const box = await ball.boundingBox();
  const bx = Math.round(box.x + box.width / 2);
  const by = Math.round(box.y + box.height / 2);

  await win.mouse.move(bx, by);
  await win.waitForTimeout(50);
  await win.mouse.down();
  for (let i = 1; i <= 8; i++) await win.mouse.move(bx - i * 8, by);

  // During the drag the ball must be a full circle (no edge-*).
  await win.waitForTimeout(80);
  const draggingClass = await ball.getAttribute('class');
  expect(draggingClass).not.toMatch(/edge-(left|right)/);

  await win.mouse.up();

  // Shortly after mouseup (animation still running): still a full circle.
  await win.waitForTimeout(120);
  const animatingClass = await ball.getAttribute('class');
  expect(animatingClass).not.toMatch(/edge-(left|right)/);

  // Once the animation settles at the edge, the half-circle edge-left is applied.
  await win.waitForTimeout(260);
  const settledClass = await ball.getAttribute('class');
  expect(settledClass).toMatch(/edge-left/);
});

test('the control bar keeps its snap layout while dragging (no jump at drag start)', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const ball = win.getByTestId('floatball-btn');
  const bar = win.getByTestId('control-bar');

  // Snap to the left edge.
  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(win, wa.x + 20, wa.y + Math.floor(wa.height / 2));
  await win.waitForTimeout(200);

  const ballBox = await ball.boundingBox();
  const bx = Math.round(ballBox.x + ballBox.width / 2);
  const by = Math.round(ballBox.y + ballBox.height / 2);
  await win.mouse.move(bx, by);
  await win.waitForTimeout(50);
  await win.mouse.down();
  for (let i = 1; i <= 10; i++) await win.mouse.move(bx - i * 10, by);
  await win.mouse.up();
  await win.waitForTimeout(450);

  const cls = await ball.getAttribute('class');
  expect(cls).toMatch(/edge-left/);

  // Expand the bar and drag via the drag handle.
  await ball.click();
  await expect(bar).toBeVisible({ timeout: 1000 });
  await expect(win.getByTestId('control-bar')).toHaveClass(/vbar-left/);

  const dragHandle = win.getByTestId('controlbar-drag-handle');
  const startBox = await dragHandle.boundingBox();
  const startX = Math.round(startBox.x + startBox.width / 2);
  const startY = Math.round(startBox.y + startBox.height / 2);

  await win.mouse.move(startX, startY);
  await win.mouse.down();
  await win.mouse.move(startX + 40, startY + 12);
  await win.waitForTimeout(120);

  // The snap-left/vbar-left layout must survive the drag so the bar doesn't
  // visually snap back to the default layout mid-gesture.
  const wrapperClass = await win.getByTestId('controlbar-panel').getAttribute('class');
  const barClass = await bar.getAttribute('class');
  expect(wrapperClass).toContain('snap-left');
  expect(barClass).toContain('vbar-left');

  await win.mouse.up();
});

test('setWindowHeight IPC has been removed (API is undefined and does not throw)', async () => {
  const win = await getMainWindow();
  const hasApi = await win.evaluate(() => typeof window.openPenApi?.setWindowHeight);
  expect(hasApi).toBe('undefined');
});

test('main window covers the full primary workArea', async () => {
  const win = await getMainWindow();

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const size = await win.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  // The window covers the full workArea so the viewport matches workArea dimensions.
  expect(size.width).toBe(wa.width);
  expect(size.height).toBe(wa.height);
});

test('after snapping to the left edge, ball center is at the workArea left edge (BALL_HALF=26 from edge)', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  // Teleport ball near left edge, then drag left to trigger snap.
  await setBallScreenPos(win, wa.x + 30, wa.y + Math.floor(wa.height / 2));
  await win.waitForTimeout(200);

  const box = await win.getByTestId('floatball-btn').boundingBox();
  const bx = Math.round(box.x + box.width / 2);
  const by = Math.round(box.y + box.height / 2);
  await win.mouse.move(bx, by);
  await win.waitForTimeout(50);
  await win.mouse.down();
  for (let i = 1; i <= 10; i++) await win.mouse.move(bx - i * 10, by);
  await win.mouse.up();
  await win.waitForTimeout(450);

  // After snap: ball viewport X = BALL_HALF (26px) from the workArea left edge.
  // Viewport X = ballScreenX - wa.x. CSS var positions the ball center at --ball-x.
  const ballBox = await win.getByTestId('floatball-btn').boundingBox();
  expect(ballBox).not.toBeNull();
  // Ball center in viewport coords = ballBox.x + ballBox.width/2 ≈ 26px from left.
  const ballViewportCenterX = ballBox.x + ballBox.width / 2;
  expect(ballViewportCenterX).toBeGreaterThanOrEqual(16);
  expect(ballViewportCenterX).toBeLessThanOrEqual(36);
});
