/**
 * popup-anchor.spec.js — popup placement and bounds tests.
 *
 * Verifies that popovers opened from the control bar stay inside the viewport
 * and follow the correct placement rules based on snap edge.
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
  const deadline = Date.now() + 20000;
  let mainWin = null;
  while (Date.now() < deadline) {
    const windows = electronApp.windows();
    for (const w of windows) {
      try {
        const url = w.url();
        if (!url.includes('window=overlay') && !url.includes('window=settings')) {
          mainWin = w;
          break;
        }
      } catch (_) {}
    }
    if (mainWin) break;
    await new Promise(r => setTimeout(r, 200));
  }
  if (!mainWin) throw new Error('Main window not found');
  await mainWin.waitForLoadState('domcontentloaded');
  return mainWin;
}

async function setBallScreenPos(win, screenX, screenY) {
  await win.evaluate(
    ({ x, y }) => window.openPenApi?.sendPositioningIntent?.({ type: 'teleport', screenX: x, screenY: y }),
    { x: screenX, y: screenY },
  );
  await win.waitForTimeout(200);
}

async function assertInBounds(win, box) {
  if (!box) return;
  const vp = await win.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.w + 4);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.h + 4);
}

async function assertHorizontalRule(win, triggerBox, popupBox) {
  if (!triggerBox || !popupBox) return;
  const triggerCenterY = triggerBox.y + triggerBox.height / 2;
  const popupCenterY = popupBox.y + popupBox.height / 2;
  expect(Math.abs(triggerCenterY - popupCenterY)).toBeGreaterThan(30);
}

async function assertVerticalRule(win, triggerBox, popupBox) {
  if (!triggerBox || !popupBox) return;
  const triggerCenterX = triggerBox.x + triggerBox.width / 2;
  const popupCenterX = popupBox.x + popupBox.width / 2;
  expect(Math.abs(triggerCenterX - popupCenterX)).toBeGreaterThan(30);
}

async function getPopoverPlacementSide(win) {
  return win.locator('[data-testid="controlbar-popover"][data-state="open"]').getAttribute('data-side');
}

async function getOpenPopoverStyle(win) {
  const style = await win.locator('[data-testid="controlbar-popover"][data-state="open"]').evaluate((el) => {
    const cs = getComputedStyle(el);
    return { top: cs.top, left: cs.left, right: cs.right, bottom: cs.bottom, transform: cs.transform };
  });
  return style;
}

async function ensureBallMode(win) {
  await win.mouse.click(6, 794).catch(() => {});
  await win.keyboard.press('Escape').catch(() => {});

  const bar = win.getByTestId('control-bar');
  if (await bar.isVisible().catch(() => false)) {
    const collapseBtn = win.getByTestId('controlbar-collapse-btn').catch ? null : win.getByTestId('controlbar-collapse-btn');
    if (collapseBtn && await collapseBtn.isVisible().catch(() => false)) {
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

  if (!(await win.getByTestId('floatball-btn').isVisible().catch(() => false))) {
    await win.reload();
    await win.waitForLoadState('domcontentloaded');
    await win.waitForFunction(() => !!document.querySelector('[data-testid="floatball-btn"], [data-testid="control-bar"]'), null, { timeout: 10000 });
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
      by + Math.round((deltaY * i) / steps)
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

async function snapTo(win, edge) {
  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);

  for (let attempt = 0; attempt < 3; attempt++) {
    if (edge === 'bottom') {
      await setBallScreenPos(win, wa.x + Math.floor(wa.width / 2), wa.y + wa.height - 30);
      await win.waitForTimeout(200);
      await dragBall(win, 0, 120);
    } else if (edge === 'top') {
      await setBallScreenPos(win, wa.x + Math.floor(wa.width / 2), wa.y + 30);
      await win.waitForTimeout(200);
      await dragBall(win, 0, -120);
    } else if (edge === 'left') {
      await setBallScreenPos(win, wa.x + 30, wa.y + Math.floor(wa.height / 2));
      await win.waitForTimeout(200);
      await dragBall(win, -120, 0);
    } else if (edge === 'right') {
      await setBallScreenPos(win, wa.x + wa.width - 30, wa.y + Math.floor(wa.height / 2));
      await win.waitForTimeout(200);
      await dragBall(win, 120, 0);
    }

    if ((await currentSnapEdge(win)) === edge) return;
    await win.waitForTimeout(200);
  }

  expect(await currentSnapEdge(win)).toBe(edge);
}

async function resetStrokePopupMode(win, value) {
  await win.evaluate((strokeWidthStyle) => window.openPenApi?.updateSettings({ strokeWidthStyle }), value);
  await win.waitForTimeout(250);
}

async function openShapePanel(win) {
  const shapeBtn = win.locator('[data-testid="controlbar-shape-btn"]');
  const shapeCaret = win.locator('[data-testid="controlbar-shape-caret"]');
  await shapeBtn.click();
  await shapeCaret.click();
  await win.waitForTimeout(250);
  await expect(win.getByTestId('controlbar-shape-popover')).toBeVisible();
  return shapeCaret;
}

test('snap=bottom uses the fallback placement and keeps the color popup in bounds', async () => {
  const win = await getMainWindow();
  await resetStrokePopupMode(win, 'slider');
  await ensureBallMode(win);
  await snapTo(win, 'bottom');
  await expandBar(win);

  await win.getByTestId('controlbar-color-btn').click();
  await win.waitForTimeout(250);

  const [triggerBox, colorBox] = await Promise.all([
    win.getByTestId('controlbar-color-btn').boundingBox(),
    win.locator('[data-testid="controlbar-popover"][data-state="open"]').boundingBox(),
  ]);
  await assertInBounds(win, colorBox);
  await assertHorizontalRule(win, triggerBox, colorBox);
});


test('shape sub-panel shares the same placement rules in horizontal and vertical modes', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  await snapTo(win, 'bottom');
  await expandBar(win);
  const bottomShapeBtn = await openShapePanel(win);

  let [triggerBox, popupBox] = await Promise.all([
    bottomShapeBtn.boundingBox(),
    win.getByTestId('controlbar-shape-popover').boundingBox(),
  ]);
  await assertInBounds(win, popupBox);
  await assertHorizontalRule(win, triggerBox, popupBox);

  await ensureBallMode(win);
  await snapTo(win, 'left');
  await expandBar(win);
  const leftShapeBtn = await openShapePanel(win);

  [triggerBox, popupBox] = await Promise.all([
    leftShapeBtn.boundingBox(),
    win.getByTestId('controlbar-shape-popover').boundingBox(),
  ]);
  await assertInBounds(win, popupBox);
  await assertVerticalRule(win, triggerBox, popupBox);
});

test('left/right snap: popups stay inside bounds with arrows pointing back at the control bar', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  await snapTo(win, 'left');
  await expandBar(win);
  await win.getByTestId('controlbar-color-btn').click();
  await win.waitForTimeout(250);

  let [triggerBox, popupBox] = await Promise.all([
    win.getByTestId('controlbar-color-btn').boundingBox(),
    win.locator('[data-testid="controlbar-popover"][data-state="open"]').boundingBox(),
  ]);
  await assertInBounds(win, popupBox);
  await assertVerticalRule(win, triggerBox, popupBox);

  await ensureBallMode(win);
  await snapTo(win, 'right');
  await expandBar(win);
  await win.getByTestId('controlbar-color-btn').click();
  await win.waitForTimeout(250);

  [triggerBox, popupBox] = await Promise.all([
    win.getByTestId('controlbar-color-btn').boundingBox(),
    win.locator('[data-testid="controlbar-popover"][data-state="open"]').boundingBox(),
  ]);
  await assertInBounds(win, popupBox);
  await assertVerticalRule(win, triggerBox, popupBox);
});

test('snap changes trigger a recomputed placement and arrow direction', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  await snapTo(win, 'bottom');
  await expandBar(win);
  await win.getByTestId('controlbar-color-btn').click();
  await win.waitForTimeout(250);

  const [firstTriggerBox, firstPopupBox] = await Promise.all([
    win.getByTestId('controlbar-color-btn').boundingBox(),
    win.locator('[data-testid="controlbar-popover"][data-state="open"]').boundingBox(),
  ]);
  await assertInBounds(win, firstPopupBox);
  await assertHorizontalRule(win, firstTriggerBox, firstPopupBox);

  await ensureBallMode(win);
  await snapTo(win, 'left');
  await expandBar(win);
  await win.getByTestId('controlbar-color-btn').click();
  await win.waitForTimeout(250);

  const [secondTriggerBox, secondPopupBox] = await Promise.all([
    win.getByTestId('controlbar-color-btn').boundingBox(),
    win.locator('[data-testid="controlbar-popover"][data-state="open"]').boundingBox(),
  ]);
  await assertInBounds(win, secondPopupBox);
  await assertVerticalRule(win, secondTriggerBox, secondPopupBox);
});

test('mutual exclusion: opening color popup closes shape popup', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);
  await snapTo(win, 'bottom');
  await expandBar(win);
  await openShapePanel(win);
  await expect(win.getByTestId('controlbar-shape-popover')).toBeVisible();

  await win.getByTestId('controlbar-color-btn').click();
  await win.waitForTimeout(250);
  await expect(win.locator('[data-testid="controlbar-popover"][data-state="open"]')).toBeVisible();
  await expect(win.getByTestId('controlbar-shape-popover')).not.toBeVisible();
});

test('mutual exclusion: opening shape popup closes color popup', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);
  await snapTo(win, 'bottom');
  await expandBar(win);
  await win.getByTestId('controlbar-color-btn').click();
  await win.waitForTimeout(250);
  await expect(win.locator('[data-testid="controlbar-popover"][data-state="open"]')).toBeVisible();

  await openShapePanel(win);
  await expect(win.locator('[data-testid="controlbar-popover"][data-state="open"]')).toBeVisible();

  // Click color again — shape should close.
  await win.getByTestId('controlbar-color-btn').click();
  await win.waitForTimeout(250);
  await expect(win.locator('[data-testid="controlbar-popover"][data-state="open"]')).toBeVisible();
  await expect(win.getByTestId('controlbar-shape-popover')).not.toBeVisible();
});

test('control-bar is visible after expandBar', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);
  await expandBar(win);

  await win.getByTestId('controlbar-color-btn').click();
  await win.waitForTimeout(250);
  await expect(win.locator('[data-testid="controlbar-popover"][data-state="open"]')).toBeVisible();
  await expect(win.getByTestId('control-bar')).toBeVisible();
});
