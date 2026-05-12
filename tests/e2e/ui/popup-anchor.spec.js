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
    const windows = electronApp.windows();
    for (const win of windows) {
      try {
        const url = win.url();
        if (url.includes('window=overlay') || url.includes('window=settings')) continue;
        await win.waitForLoadState('domcontentloaded', { timeout: 3000 });
        const ready = await win.evaluate(() => !!document.querySelector('.float-ball, .control-bar'));
        if (ready) return win;
      } catch {
        // Ignore windows that aren't ready yet.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Main window not found within 40s');
}

/**
 * Convert Reka UI `data-side` attribute on the popover content element to an
 * arrow direction (the direction the arrow *points*, i.e. back toward the trigger).
 *
 * - popup side "bottom" → popup below trigger → arrow points up
 * - popup side "top"    → popup above trigger → arrow points down
 * - popup side "right"  → popup right of trigger → arrow points left
 * - popup side "left"   → popup left of trigger → arrow points right
 */
function arrowDirFromDataSide(dataSide = '') {
  if (dataSide === 'bottom') return 'up';
  if (dataSide === 'top') return 'down';
  if (dataSide === 'right') return 'left';
  if (dataSide === 'left') return 'right';
  return null;
}

async function assertInBounds(win, box) {
  const viewport = await win.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.w);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.h);
}

async function getDesktopAvailableSpace(win, triggerBox) {
  const info = await win.evaluate(async (trigger) => {
    const pos = await window.openPenApi.getWindowPosition();
    const displays = await window.openPenApi.getDisplayInfo();

    const triggerScreen = {
      left: pos.x + trigger.x,
      right: pos.x + trigger.x + trigger.width,
      top: pos.y + trigger.y,
      bottom: pos.y + trigger.y + trigger.height,
    };

    const cx = (triggerScreen.left + triggerScreen.right) / 2;
    const cy = (triggerScreen.top + triggerScreen.bottom) / 2;

    let wa = displays?.[0]?.workArea || displays?.[0]?.bounds;
    for (const d of displays || []) {
      const cand = d.workArea || d.bounds;
      if (cx >= cand.x && cx <= cand.x + cand.width && cy >= cand.y && cy <= cand.y + cand.height) {
        wa = cand;
        break;
      }
    }

    return {
      below: wa.y + wa.height - triggerScreen.bottom,
      above: triggerScreen.top - wa.y,
      right: wa.x + wa.width - triggerScreen.right,
      left: triggerScreen.left - wa.x,
    };
  }, triggerBox);

  return info;
}

/**
 * Get the data-side from the openpen-popover-content element.
 * AppPopover (Reka UI) sets data-side on the PopoverContent element.
 */
async function getPopoverDataSide(win) {
  return win.locator('.openpen-popover-content[data-state="open"]').getAttribute('data-side');
}

async function assertHorizontalRule(win, triggerBox, popupBox) {
  const dataSide = await getPopoverDataSide(win);
  const arrowDir = arrowDirFromDataSide(dataSide);
  const available = await getDesktopAvailableSpace(win, triggerBox);
  const required = popupBox.height + 8; // gap=8 per AppPopover default

  if (available.below >= required) {
    expect(arrowDir).toBe('up');
    // Popup should be below trigger center.
    const triggerCy = triggerBox.y + triggerBox.height / 2;
    const popupCy = popupBox.y + popupBox.height / 2;
    expect(popupCy).toBeGreaterThanOrEqual(triggerCy - 1);
  } else {
    expect(arrowDir).toBe('down');
  }
}

async function assertVerticalRule(win, triggerBox, popupBox) {
  const dataSide = await getPopoverDataSide(win);
  const arrowDir = arrowDirFromDataSide(dataSide);
  const available = await getDesktopAvailableSpace(win, triggerBox);
  const required = popupBox.width + 8;

  if (available.right >= required) {
    expect(arrowDir).toBe('left');
    const triggerCx = triggerBox.x + triggerBox.width / 2;
    const popupCx = popupBox.x + popupBox.width / 2;
    expect(popupCx).toBeGreaterThanOrEqual(triggerCx - 1);
  } else {
    expect(arrowDir).toBe('right');
    const triggerCx = triggerBox.x + triggerBox.width / 2;
    const popupCx = popupBox.x + popupBox.width / 2;
    expect(popupCx).toBeLessThanOrEqual(triggerCx + 1);
  }
}

async function assertPopupCardStyle(win, selector) {
  // AppPopover wraps all popups with openpen-popover-content which provides
  // background, border, box-shadow. Check the open wrapper element.
  const style = await win.locator('.openpen-popover-content[data-state="open"]').evaluate((el) => {
    const cs = window.getComputedStyle(el);
    return {
      background: cs.backgroundColor,
      borderTopWidth: cs.borderTopWidth,
      borderTopStyle: cs.borderTopStyle,
      boxShadow: cs.boxShadow,
    };
  });

  expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
  expect(style.borderTopStyle).toBe('solid');
  expect(parseFloat(style.borderTopWidth)).toBeGreaterThanOrEqual(1);
  expect(style.boxShadow).not.toBe('none');
}

/**
 * Teleport the ball to a screen coordinate without triggering snap.
 *
 * Sends drag-start + drag-move + drag-end (enableDragAutoSnap=false) intents
 * so the ball lands at (screenX, screenY) and the engine broadcasts the new
 * ballViewportPos back to the renderer via CSS variables.
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

async function ensureBallMode(win) {
  await win.mouse.click(6, 794).catch(() => {});
  await win.keyboard.press('Escape').catch(() => {});

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

  if (!(await win.locator('.float-ball').isVisible().catch(() => false))) {
    await win.reload();
    await win.waitForLoadState('domcontentloaded');
    await win.waitForFunction(() => !!document.querySelector('.float-ball, .control-bar'), null, { timeout: 10000 });
  }

  await expect(win.locator('.float-ball')).toBeVisible({ timeout: 5000 });
}

async function expandBar(win) {
  if (!(await win.locator('.control-bar').isVisible().catch(() => false))) {
    await win.locator('.float-ball').click();
    await win.waitForTimeout(400);
  }
  await expect(win.locator('.control-bar')).toBeVisible();
}

async function dragBall(win, deltaX, deltaY, steps = 10) {
  const box = await win.locator('.float-ball').boundingBox();
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
  const cls = await win.locator('.float-ball').getAttribute('class');
  const match = cls?.match(/edge-(left|right|top|bottom)/);
  return match?.[1] ?? null;
}

/**
 * Snap the ball to the given edge using positioning intents + a short drag.
 * Uses the same pattern as drag-snap.spec.js: teleport near edge, then drag
 * past the snap threshold.
 */
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

// aria-label="Shape" matches the rendered i18n output under the default 'en'
// locale. Keep in sync with src/i18n/en.ts `toolShape` if the label changes.
async function openShapePanel(win) {
  const shapeBtn = win.locator('.cb-btn[aria-label="Shape"]');
  const shapeCaret = win.locator('.cb-shape-caret');
  await shapeBtn.click();
  await shapeCaret.click();
  await win.waitForTimeout(250);
  await expect(win.locator('.shape-popover')).toBeVisible();
  return shapeCaret;
}

test('snap=bottom uses the fallback placement and keeps the color popup in bounds', async () => {
  const win = await getMainWindow();
  await resetStrokePopupMode(win, 'slider');
  await ensureBallMode(win);
  await snapTo(win, 'bottom');
  await expandBar(win);

  await win.locator('.cb-color-btn').click();
  await win.waitForTimeout(250);

  const [triggerBox, colorBox] = await Promise.all([
    win.locator('.cb-color-btn').boundingBox(),
    win.locator('.openpen-popover-content[data-state="open"]').boundingBox(),
  ]);
  await assertInBounds(win, colorBox);
  await assertHorizontalRule(win, triggerBox, colorBox);

  // The shape sub-panel has extra visibility gates (activeTool + mutual-exclusion state);
  // this test intentionally only exercises the color popup under snap=bottom.
});


test('shape sub-panel shares the same placement rules in horizontal and vertical modes', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  await snapTo(win, 'bottom');
  await expandBar(win);
  const bottomShapeBtn = await openShapePanel(win);

  let [triggerBox, popupBox] = await Promise.all([
    bottomShapeBtn.boundingBox(),
    win.locator('.shape-popover').boundingBox(),
  ]);
  await assertInBounds(win, popupBox);
  await assertHorizontalRule(win, triggerBox, popupBox);

  await ensureBallMode(win);
  await snapTo(win, 'left');
  await expandBar(win);
  const leftShapeBtn = await openShapePanel(win);

  [triggerBox, popupBox] = await Promise.all([
    leftShapeBtn.boundingBox(),
    win.locator('.shape-popover').boundingBox(),
  ]);
  await assertInBounds(win, popupBox);
  await assertVerticalRule(win, triggerBox, popupBox);
});

test('left/right snap: popups stay inside bounds with arrows pointing back at the control bar', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  await snapTo(win, 'left');
  await expandBar(win);
  await win.locator('.cb-color-btn').click();
  await win.waitForTimeout(250);

  let [triggerBox, popupBox] = await Promise.all([
    win.locator('.cb-color-btn').boundingBox(),
    win.locator('.openpen-popover-content[data-state="open"]').boundingBox(),
  ]);
  await assertInBounds(win, popupBox);
  await assertVerticalRule(win, triggerBox, popupBox);

  await ensureBallMode(win);
  await snapTo(win, 'right');
  await expandBar(win);
  await win.locator('.cb-color-btn').click();
  await win.waitForTimeout(250);

  [triggerBox, popupBox] = await Promise.all([
    win.locator('.cb-color-btn').boundingBox(),
    win.locator('.openpen-popover-content[data-state="open"]').boundingBox(),
  ]);
  await assertInBounds(win, popupBox);
  await assertVerticalRule(win, triggerBox, popupBox);
});

test('snap changes trigger a recomputed placement and arrow direction', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  await snapTo(win, 'bottom');
  await expandBar(win);
  await win.locator('.cb-color-btn').click();
  await win.waitForTimeout(250);

  const [firstTriggerBox, firstPopupBox] = await Promise.all([
    win.locator('.cb-color-btn').boundingBox(),
    win.locator('.openpen-popover-content[data-state="open"]').boundingBox(),
  ]);
  await assertInBounds(win, firstPopupBox);
  await assertHorizontalRule(win, firstTriggerBox, firstPopupBox);

  await ensureBallMode(win);
  await snapTo(win, 'left');
  await expandBar(win);
  await win.locator('.cb-color-btn').click();
  await win.waitForTimeout(250);

  const [triggerBox, popupBox] = await Promise.all([
    win.locator('.cb-color-btn').boundingBox(),
    win.locator('.openpen-popover-content[data-state="open"]').boundingBox(),
  ]);

  await assertInBounds(win, popupBox);
  await assertVerticalRule(win, triggerBox, popupBox);
});

test('activePanel mutual exclusion — opening the color picker closes the shape sub-panel', async () => {
  const win = await getMainWindow();

  // Center the ball in the workArea (horizontal layout).
  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(
    win,
    wa.x + Math.floor(wa.width / 2),
    wa.y + Math.floor(wa.height / 2),
  );
  await win.waitForTimeout(200);

  await ensureBallMode(win);
  await expandBar(win);

  // Click the shape tool + caret → shape sub-panel appears.
  await win.locator('.cb-btn[aria-label="Shape"]').click();
  await win.locator('.cb-shape-caret').click();
  await win.waitForTimeout(200);
  await expect(win.locator('.shape-popover')).toBeVisible();

  // Click the color button → color picker appears, shape sub-panel hides (mutual exclusion).
  await win.locator('.cb-color-btn').click();
  await win.waitForTimeout(300);
  await expect(win.locator('.openpen-popover-content[data-state="open"]')).toBeVisible();
  await expect(win.locator('.shape-popover')).not.toBeVisible();
});

test('closing the color picker does not re-open the shape sub-panel (must be reopened manually)', async () => {
  const win = await getMainWindow();
  await expandBar(win);

  // Make sure the shape tool is active and the sub-panel is manually expanded.
  await win.locator('.cb-btn[aria-label="Shape"]').click();
  await win.locator('.cb-shape-caret').click();
  await win.waitForTimeout(200);
  await expect(win.locator('.shape-popover')).toBeVisible();

  // Open the color picker.
  await win.locator('.cb-color-btn').click();
  await win.waitForTimeout(200);
  await expect(win.locator('.openpen-popover-content[data-state="open"]')).toBeVisible();

  // Close the color picker with a second click.
  await win.locator('.cb-color-btn').click();
  await win.waitForTimeout(300);
  await expect(win.locator('.openpen-popover-content[data-state="open"]')).not.toBeVisible();

  // Shape sub-panel does not reappear automatically.
  await expect(win.locator('.shape-popover')).not.toBeVisible();
});

test('clicking outside closes the color picker', async () => {
  const win = await getMainWindow();
  await expandBar(win);

  await win.locator('.cb-color-btn').click();
  await win.waitForTimeout(300);
  await expect(win.locator('.openpen-popover-content[data-state="open"]')).toBeVisible();

  // Click an empty area of the viewport that is outside the picker.
  await win.mouse.click(100, 500);
  await win.waitForTimeout(300);
  await expect(win.locator('.openpen-popover-content[data-state="open"]')).not.toBeVisible();
});


// Regression guard: the 3-second ControlBar auto-collapse timer must stay
// suspended while any popover is open. Reka UI teleports popover content to
// <body>, so moving the cursor from bar → popover fires mouseleave on the
// wrapper; without the activePanelId watcher the bar would collapse and drop
// the popover after 3s of cursor stillness inside the picker.
test('cursor stationary inside an open popover does not collapse the bar', async () => {
  const win = await getMainWindow();
  await expandBar(win);

  // Open the color picker and park the cursor on its hex input.
  await win.locator('.cb-color-btn').click();
  await win.waitForTimeout(300);
  const popup = win.locator('.openpen-popover-content[data-state="open"]');
  await expect(popup).toBeVisible();

  const box = await popup.boundingBox();
  expect(box).not.toBeNull();
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  // autoCollapseDelay is 3000ms — wait past that with margin.
  await win.waitForTimeout(4000);

  await expect(popup).toBeVisible();
  await expect(win.locator('.control-bar')).toBeVisible();
});
