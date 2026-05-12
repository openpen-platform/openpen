/**
 * G2 gap coverage: ball center IS at the screen coordinate the engine reports.
 *
 * Sends positioning intents for several (x, y) values across the workArea and
 * verifies that the ball's rendered viewport center matches the expected
 * viewport coordinate derived from the engine's ballScreenPos.
 *
 * Formula: viewportX = ballScreenX - workArea.x, viewportY = ballScreenY - workArea.y.
 * The ball's DOM center must match this within 1 px (sub-pixel rendering tolerance).
 *
 * This test directly catches the class of bug where usePositioning subscription
 * is never established and the ball pins to a static CSS fallback — any such
 * regression makes all assertions below fail immediately.
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
        const ready = await win.evaluate(() => !!document.querySelector('.float-ball, .control-bar'));
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
  const bar = win.locator('.control-bar');
  if (await bar.isVisible().catch(() => false)) {
    const collapseBtn = win.locator('.cb-collapse-btn');
    if (await collapseBtn.isVisible().catch(() => false)) {
      await collapseBtn.click({ force: true });
      await win.waitForTimeout(400);
    } else {
      await win.mouse.move(10, 10);
      await win.waitForTimeout(3600);
    }
  }
  if (!(await win.locator('.float-ball').isVisible().catch(() => false))) {
    await win.keyboard.press('Escape').catch(() => {});
    await win.waitForTimeout(500);
  }
  await expect(win.locator('.float-ball')).toBeVisible({ timeout: 5000 });
}

/**
 * Teleport the ball to the given screen coordinate via positioning intents and
 * verify that the ball DOM center matches the expected viewport position.
 *
 * @param {import('@playwright/test').Page} win
 * @param {number} screenX - Target ball center X in screen coordinates.
 * @param {number} screenY - Target ball center Y in screen coordinates.
 * @param {{ x: number, y: number, width: number, height: number }} wa - workArea in screen coords.
 */
async function assertBallAtScreenPos(win, screenX, screenY, wa) {
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
  // Allow 150ms for the renderer to apply the new CSS variables.
  await win.waitForTimeout(150);

  const ball = win.locator('.float-ball');
  await expect(ball).toBeVisible({ timeout: 3000 });

  const ballBox = await ball.boundingBox();
  expect(ballBox).not.toBeNull();

  const ballViewportCenterX = ballBox.x + ballBox.width / 2;
  const ballViewportCenterY = ballBox.y + ballBox.height / 2;

  // Expected viewport center = screen center - workArea origin.
  const expectedViewportX = screenX - wa.x;
  const expectedViewportY = screenY - wa.y;

  expect(Math.abs(ballViewportCenterX - expectedViewportX)).toBeLessThanOrEqual(1);
  expect(Math.abs(ballViewportCenterY - expectedViewportY)).toBeLessThanOrEqual(1);
}

// ─────────────────────────────────────────────────────────────────────────────

test('G2: ball center matches engine coordinate at workArea center', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const cx = wa.x + Math.floor(wa.width / 2);
  const cy = wa.y + Math.floor(wa.height / 2);

  await assertBallAtScreenPos(win, cx, cy, wa);
});

test('G2: ball center matches engine coordinate at top-left quadrant', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  // Place ball in the top-left quadrant (well inside workArea).
  const targetX = wa.x + Math.floor(wa.width * 0.25);
  const targetY = wa.y + Math.floor(wa.height * 0.25);

  await assertBallAtScreenPos(win, targetX, targetY, wa);
});

test('G2: ball center matches engine coordinate at bottom-right quadrant', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const targetX = wa.x + Math.floor(wa.width * 0.75);
  const targetY = wa.y + Math.floor(wa.height * 0.75);

  await assertBallAtScreenPos(win, targetX, targetY, wa);
});

test('G2: ball center matches engine coordinate near left workArea edge (BALL_HALF offset)', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  // BALL_HALF = 26; target exactly at the left snap position.
  const targetX = wa.x + 26;
  const targetY = wa.y + Math.floor(wa.height / 2);

  await assertBallAtScreenPos(win, targetX, targetY, wa);
});

test('G2: ball center matches engine coordinate near right workArea edge', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const targetX = wa.x + wa.width - 26;
  const targetY = wa.y + Math.floor(wa.height / 2);

  await assertBallAtScreenPos(win, targetX, targetY, wa);
});

test('G2: summon-to-cursor moves the ball to a different position than it was before', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);

  // Place ball at a known position far from center.
  const startX = wa.x + 100;
  const startY = wa.y + 100;
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
    { x: startX, y: startY },
  );
  await win.waitForTimeout(150);

  const ballBefore = await win.locator('.float-ball').boundingBox();
  expect(ballBefore).not.toBeNull();
  const beforeCX = ballBefore.x + ballBefore.width / 2;
  const beforeCY = ballBefore.y + ballBefore.height / 2;

  // Invoke summon — the engine reads screen.getCursorScreenPoint() which
  // reflects the OS cursor position at the moment of the call. The OS cursor
  // is somewhere on the display (wherever the user or Playwright last moved it).
  await win.evaluate(async () => {
    await window.openPenApi?.sendPositioningIntent?.({ type: 'summon-to-cursor' });
  });
  // 320ms summon animation + slack.
  await win.waitForTimeout(500);

  const ball = win.locator('.float-ball');
  await expect(ball).toBeVisible({ timeout: 3000 });

  const ballAfter = await ball.boundingBox();
  expect(ballAfter).not.toBeNull();

  // After summon the ball MUST remain within the viewport (workArea).
  const viewport = await win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const afterCX = ballAfter.x + ballAfter.width / 2;
  const afterCY = ballAfter.y + ballAfter.height / 2;

  expect(afterCX).toBeGreaterThanOrEqual(0);
  expect(afterCY).toBeGreaterThanOrEqual(0);
  expect(afterCX).toBeLessThanOrEqual(viewport.width);
  expect(afterCY).toBeLessThanOrEqual(viewport.height);

  // The ball must have moved from its pre-summon position.
  // (The OS cursor is very unlikely to be at exactly wa.x+100, wa.y+100.)
  const moved = Math.abs(afterCX - beforeCX) > 5 || Math.abs(afterCY - beforeCY) > 5;
  expect(moved).toBe(true);
});
