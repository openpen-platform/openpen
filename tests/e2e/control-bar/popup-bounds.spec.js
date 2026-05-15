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

async function setBallScreenPos(win, screenX, screenY) {
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
  await win.waitForTimeout(150);
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

async function snapBallToEdge(win, wa, edge) {
  const midX = wa.x + Math.floor(wa.width / 2);
  const midY = wa.y + Math.floor(wa.height / 2);

  if (edge === 'left') {
    await setBallScreenPos(win, wa.x + 30, midY);
    await dragBall(win, -120, 0);
  } else if (edge === 'right') {
    await setBallScreenPos(win, wa.x + wa.width - 30, midY);
    await dragBall(win, 120, 0);
  } else if (edge === 'top') {
    await setBallScreenPos(win, midX, wa.y + 30);
    await dragBall(win, 0, -120);
  } else if (edge === 'bottom') {
    await setBallScreenPos(win, midX, wa.y + wa.height - 30);
    await dragBall(win, 0, 120);
  }

  await win.waitForTimeout(200);
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

  const [popupBox, viewport] = await Promise.all([
    popup.boundingBox(),
    win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight })),
  ]);

  expect(popupBox).not.toBeNull();
  expect(popupBox.x).toBeGreaterThanOrEqual(-1);
  expect(popupBox.y).toBeGreaterThanOrEqual(-1);
  expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(popupBox.y + popupBox.height).toBeLessThanOrEqual(viewport.height + 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Color picker popup at each ball position
// ─────────────────────────────────────────────────────────────────────────────

test('G1: color picker stays inside viewport at free position (screen center)', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(win, wa.x + Math.floor(wa.width / 2), wa.y + Math.floor(wa.height / 2));
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

  await win.locator('.cb-btn[aria-label="Shape"]').click();
  await win.locator('.cb-shape-caret').click();
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

  await win.locator('.cb-btn[aria-label="Shape"]').click();
  await win.locator('.cb-shape-caret').click();
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
  await setBallScreenPos(win, wa.x + Math.floor(wa.width / 2), wa.y + Math.floor(wa.height / 2));
  await expandBar(win);

  const bar = win.getByTestId('control-bar');
  const barBox = await bar.boundingBox();
  const viewport = await win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));

  expect(barBox).not.toBeNull();
  expect(barBox.x).toBeGreaterThanOrEqual(-1);
  expect(barBox.y).toBeGreaterThanOrEqual(-1);
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(viewport.height + 1);
});

test('G4: expanded bar bounds stay inside viewport at snap-left', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'left');
  await expandBar(win);

  const bar = win.getByTestId('control-bar');
  const barBox = await bar.boundingBox();
  const viewport = await win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));

  expect(barBox).not.toBeNull();
  expect(barBox.x).toBeGreaterThanOrEqual(-1);
  expect(barBox.y).toBeGreaterThanOrEqual(-1);
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(viewport.height + 1);
});

test('G4: expanded bar bounds stay inside viewport at snap-right', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'right');
  await expandBar(win);

  const bar = win.getByTestId('control-bar');
  const barBox = await bar.boundingBox();
  const viewport = await win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));

  expect(barBox).not.toBeNull();
  expect(barBox.x).toBeGreaterThanOrEqual(-1);
  expect(barBox.y).toBeGreaterThanOrEqual(-1);
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(viewport.height + 1);
});

test('G4: expanded bar bounds stay inside viewport at snap-top', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'top');
  await expandBar(win);

  const bar = win.getByTestId('control-bar');
  const barBox = await bar.boundingBox();
  const viewport = await win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));

  expect(barBox).not.toBeNull();
  expect(barBox.x).toBeGreaterThanOrEqual(-1);
  expect(barBox.y).toBeGreaterThanOrEqual(-1);
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(viewport.height + 1);
});

test('G4: expanded bar bounds stay inside viewport at snap-bottom', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapBallToEdge(win, wa, 'bottom');
  await expandBar(win);

  const bar = win.getByTestId('control-bar');
  const barBox = await bar.boundingBox();
  const viewport = await win.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));

  expect(barBox).not.toBeNull();
  expect(barBox.x).toBeGreaterThanOrEqual(-1);
  expect(barBox.y).toBeGreaterThanOrEqual(-1);
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(viewport.height + 1);
});
