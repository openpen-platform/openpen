/**
 * Control-bar layout E2E tests — vertical layout, window size, panel exclusion,
 * and the vertical-mode stroke-width slider.
 *
 * All tests launch the real Electron app via the Playwright `_electron` API
 * and verify BrowserWindow state through `electronApp.evaluate()` rather than
 * relying solely on CSS/DOM assertions.
 *
 * The main window is workArea-sized and fixed. Ball position is set via
 * sendPositioningIntent intents rather than by moving the window.
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
        const hasMainUi = await win.evaluate(
          () => !!document.querySelector('.float-ball, .control-bar')
        );
        if (hasMainUi) return win;
      } catch {
        // Ignore closed or still-loading windows.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Unable to locate main window with .float-ball/.control-bar within 40s');
}

/** Ensure ball mode; if the bar is expanded, wait for auto-collapse. */
async function ensureBallMode(win) {
  const bar = win.locator('.control-bar');
  if (await bar.isVisible().catch(() => false)) {
    await bar.hover();
    await win.mouse.move(200, 750); // well clear of every bar layout
    await win.waitForTimeout(3500);  // 3s collapse timer + 250ms transition
  }
  await expect(win.locator('.float-ball')).toBeVisible({ timeout: 5000 });
}

/** Expand the control bar. */
async function expandBar(win) {
  const bar = win.locator('.control-bar');
  if (!(await bar.isVisible().catch(() => false))) {
    await win.locator('.float-ball').click();
    await win.waitForTimeout(400);
  }
  await expect(bar).toBeVisible({ timeout: 3000 });
}

/**
 * Teleport the ball to a screen coordinate without triggering snap.
 * Uses drag-start + drag-move + drag-end (enableDragAutoSnap=false) intents.
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
  await win.waitForTimeout(100);
}

/**
 * Drag the ball horizontally using its real position via boundingBox().
 */
async function dragBall(win, deltaX, steps = 10) {
  const box = await win.locator('.float-ball').boundingBox();
  const bx = Math.round(box.x + box.width / 2);
  const by = Math.round(box.y + box.height / 2);
  await win.mouse.move(bx, by);
  await win.waitForTimeout(50); // let setIgnoreMouseEvents(false) reach main
  await win.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await win.mouse.move(bx + Math.round(deltaX * i / steps), by);
  }
  await win.mouse.up();
  await win.waitForTimeout(450);
}

// ─────────────────────────────────────────────────────────────────────────────

test('main window covers the full primary workArea', async () => {
  const win = await getMainWindow();
  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const size = await win.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));
  expect(size.width).toBe(wa.width);
  expect(size.height).toBe(wa.height);
});

test('snap to left -> control bar has vbar-left class (vertical layout)', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  // Place ball near the left edge.
  await setBallScreenPos(win, wa.x + 20, wa.y + Math.floor(wa.height / 2));
  await win.waitForTimeout(200);

  await dragBall(win, -100);

  const ballCls = await win.locator('.float-ball').getAttribute('class');
  expect(ballCls).toMatch(/edge-left/);

  await win.locator('.float-ball').click();
  await win.waitForTimeout(400);

  const barCls = await win.locator('.control-bar').getAttribute('class');
  expect(barCls).toMatch(/vbar-left/);
});

test('snap to right -> control bar has vbar-right class (vertical layout)', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(win, wa.x + wa.width - 20, wa.y + Math.floor(wa.height / 2));
  await win.waitForTimeout(200);

  await dragBall(win, 100);

  const ballCls = await win.locator('.float-ball').getAttribute('class');
  expect(ballCls).toMatch(/edge-right/);

  await win.locator('.float-ball').click();
  await win.waitForTimeout(400);

  const barCls = await win.locator('.control-bar').getAttribute('class');
  expect(barCls).toMatch(/vbar-right/);
});

test('snap to top -> horizontal layout (no vbar-left/vbar-right class)', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(win, wa.x + Math.floor(wa.width / 2), wa.y + 20);
  await win.waitForTimeout(200);

  {
    const box = await win.locator('.float-ball').boundingBox();
    const bx = Math.round(box.x + box.width / 2);
    const by = Math.round(box.y + box.height / 2);
    await win.mouse.move(bx, by);
    await win.waitForTimeout(50);
    await win.mouse.down();
    for (let i = 1; i <= 8; i++) await win.mouse.move(bx, by - i * 10);
    await win.mouse.up();
    await win.waitForTimeout(450);
  }

  const ballCls = await win.locator('.float-ball').getAttribute('class');
  expect(ballCls).toMatch(/edge-top/);

  await win.locator('.float-ball').click();
  await win.waitForTimeout(400);

  const barCls = await win.locator('.control-bar').getAttribute('class');
  expect(barCls).not.toMatch(/vbar-left|vbar-right/);
});

test('eraser button and caret are visible in vertical mode (design: 1 main + 1 caret)', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(win, wa.x + 20, wa.y + Math.floor(wa.height / 2));
  await win.waitForTimeout(200);

  await dragBall(win, -100);
  await win.locator('.float-ball').click();
  await win.waitForTimeout(400);
  await expect(win.locator('.control-bar.vbar-left')).toBeVisible();

  await expect(win.locator('.cb-btn[aria-label="Eraser tool"]')).toBeVisible();
  await expect(win.locator('.cb-eraser-caret[aria-label="Eraser mode"]')).toBeVisible();
  await expect(win.locator('.cb-btn[aria-label="Stroke Eraser"]')).not.toBeAttached();
});

test('tools group renders [freehand, line, shape] inside .cb-group--inset; bar height stays 50px', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  // Move ball to center so bar lays out horizontally.
  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(
    win,
    wa.x + Math.floor(wa.width / 2),
    wa.y + Math.floor(wa.height / 2),
  );
  await win.waitForTimeout(200);
  await expandBar(win);

  const insetCount = await win.evaluate(() => document.querySelectorAll('.cb-group--inset').length);
  expect(insetCount).toBe(1);

  const labels = await win.evaluate(() => {
    const g = document.querySelector('.cb-group--inset');
    if (!g) return [];
    return Array.from(g.children).map((c) =>
      c.getAttribute('aria-label') || c.querySelector('[aria-label]')?.getAttribute('aria-label') || c.tagName
    );
  });
  expect(labels).toEqual(['Freehand', 'Line', 'Shape']);

  const eraserInInset = await win.evaluate(() =>
    !!document.querySelector('.cb-group--inset .cb-eraser-wrap, .cb-group--inset [aria-label="Eraser tool"]')
  );
  expect(eraserInInset).toBe(false);

  const isHorizontal = await win.evaluate(() => {
    const bar = document.querySelector('.control-bar');
    return !bar.classList.contains('vbar-left') && !bar.classList.contains('vbar-right');
  });
  if (isHorizontal) {
    const heights = await win.evaluate(() => ({
      bar: document.querySelector('.control-bar').getBoundingClientRect().height,
      inset: document.querySelector('.cb-group--inset').getBoundingClientRect().height,
    }));
    expect(heights.bar).toBe(50);
    expect(heights.inset).toBe(36);
  }
});

test('horizontal mode renders the stroke-width slider inline', async () => {
  const win = await getMainWindow();
  await win.evaluate(() => window.openPenApi?.updateSettings({ strokeWidthStyle: 'slider' }));
  await win.waitForTimeout(200);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(
    win,
    wa.x + Math.floor(wa.width / 2),
    wa.y + Math.floor(wa.height / 2),
  );
  await win.waitForTimeout(200);

  await ensureBallMode(win);
  await expandBar(win);

  await expect(win.locator('.stroke-width-slider-wrap')).toBeVisible();
  await expect(win.locator('.stroke-width-slider-wrap .app-slider-root')).toBeVisible();
  await expect(win.locator('.sw-vbtn-wrap')).not.toBeAttached();
});

test('vertical-bar drag handle is oriented horizontally (width > height)', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(win, wa.x + 20, wa.y + Math.floor(wa.height / 2));
  await win.waitForTimeout(200);
  await dragBall(win, -100);

  await win.locator('.float-ball').click();
  await win.waitForTimeout(400);
  await expect(win.locator('.control-bar.vbar-left')).toBeVisible();

  const dragSvgDims = await win.evaluate(() => {
    const svg = document.querySelector('.control-bar.vbar-left .cb-drag svg');
    if (!svg) return null;
    return {
      width: parseFloat(svg.getAttribute('width')),
      height: parseFloat(svg.getAttribute('height')),
    };
  });
  expect(dragSvgDims).not.toBeNull();
  expect(dragSvgDims.width).toBeGreaterThan(dragSvgDims.height);
  expect(dragSvgDims.width).toBe(16);
  expect(dragSvgDims.height).toBe(10);
});

test('in snap-left mode, ball center viewport Y sits near the workArea vertical midpoint', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const ballMidY = wa.y + Math.floor(wa.height / 2);
  await setBallScreenPos(win, wa.x + 20, ballMidY);
  await win.waitForTimeout(200);
  await dragBall(win, -100);

  // In ball mode (snapped left) the ball's client Y center should be near the workArea midpoint.
  const ballBox = await win.locator('.float-ball').boundingBox();
  expect(ballBox).not.toBeNull();
  const ballCenterY = ballBox.y + ballBox.height / 2;
  // workArea mid in viewport coords = ballMidY - wa.y; allow ±50px tolerance for settle.
  const expectedY = Math.floor(wa.height / 2);
  expect(ballCenterY).toBeGreaterThanOrEqual(expectedY - 50);
  expect(ballCenterY).toBeLessThanOrEqual(expectedY + 50);
});

test('vertical bar sits 8px from the screen edge', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(win, wa.x + 20, wa.y + Math.floor(wa.height / 2));
  await win.waitForTimeout(200);
  await dragBall(win, -100);

  await win.locator('.float-ball').click();
  await win.waitForTimeout(400);

  // The window is now at workArea origin, so barBox.x is already a viewport-coord offset.
  // Screen X of the bar's left edge = wa.x + barBox.x.
  const [barBox, windowScreenX] = await Promise.all([
    win.locator('.control-bar.vbar-left').boundingBox(),
    electronApp.evaluate(({ BrowserWindow }) => {
      const wins = BrowserWindow.getAllWindows();
      const main = wins.find(w => {
        const url = w.webContents.getURL();
        return !url.includes('window=settings') && !url.includes('window=overlay');
      });
      return main ? main.getPosition()[0] : null;
    }),
  ]);
  expect(barBox).not.toBeNull();
  expect(windowScreenX).not.toBeNull();

  const vbarScreenX = windowScreenX + barBox.x;
  const leftGap = vbarScreenX - wa.x;
  expect(leftGap).toBeGreaterThanOrEqual(6);
  expect(leftGap).toBeLessThanOrEqual(10);
});

test('vertical bar width matches horizontal bar height (50px)', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(win, wa.x + 20, wa.y + Math.floor(wa.height / 2));
  await win.waitForTimeout(200);
  await dragBall(win, -100);

  await win.locator('.float-ball').click();
  await win.waitForTimeout(400);
  await expect(win.locator('.control-bar.vbar-left')).toBeVisible();

  const vbarWidth = await win.locator('.control-bar.vbar-left').evaluate((el) => {
    return Math.round(el.getBoundingClientRect().width);
  });
  expect(vbarWidth).toBe(50);
});

test('button order: stroke-width slider appears before the color button', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(
    win,
    wa.x + Math.floor(wa.width / 2),
    wa.y + Math.floor(wa.height / 2),
  );
  await win.waitForTimeout(200);
  await ensureBallMode(win);
  await expandBar(win);

  const order = await win.evaluate(() => {
    const bar = document.querySelector('.control-bar');
    if (!bar) return null;
    const elements = Array.from(bar.querySelectorAll('*'));
    const strokeIdx = elements.findIndex(el => el.classList.contains('stroke-width-slider-wrap'));
    const colorIdx = elements.findIndex(el => el.classList.contains('cb-color-btn'));
    return { strokeIdx, colorIdx };
  });
  expect(order).not.toBeNull();
  expect(order.strokeIdx).toBeGreaterThanOrEqual(0);
  expect(order.colorIdx).toBeGreaterThanOrEqual(0);
  expect(order.strokeIdx).toBeLessThan(order.colorIdx);
});

test('vertical-bar auto-collapses back to the ball on mouseleave', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(win, wa.x + 20, wa.y + Math.floor(wa.height / 2));
  await win.waitForTimeout(200);
  await dragBall(win, -100);

  await win.locator('.float-ball').click();
  await win.waitForTimeout(400);
  await expect(win.locator('.control-bar.vbar-left')).toBeVisible();

  await win.locator('.control-bar.vbar-left').hover();
  await win.mouse.move(200, 750);
  await win.waitForTimeout(3500);

  await expect(win.locator('.float-ball')).toBeVisible();
  await expect(win.locator('.control-bar')).not.toBeVisible();
});
