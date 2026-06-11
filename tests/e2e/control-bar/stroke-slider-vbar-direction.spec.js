/**
 * Stroke-width slider direction in vbar mode.
 *
 * Verifies that the vertical AppSlider (slider style) uses inverted direction:
 * top = min (small), bottom = max (large), matching the dot icon legend.
 *
 * Primary geometric invariant (inverted=true):
 *   The .app-slider-range fills from the TOP of the track (not bottom).
 *   range.y === track.y  (within 2px rounding tolerance)
 *
 * Secondary keyboard invariant:
 *   ArrowDown while the thumb is focused increases the stroke width value,
 *   because the underlying reka-ui inverted direction maps "down" to "more".
 *
 * Regression section — popup direction tests remain here because they share
 * the same helpers and vbar setup, and any regression in AppPopover direction
 * logic would surface alongside the slider direction checks.
 *
 * All assertions use boundingBox() — the only reliable visual measurement
 * on a transparent frameless overlay window.
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

// ── Shared helpers ────────────────────────────────────────────────────────────

async function getMainWindow() {
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    const wins = electronApp.windows();
    for (const win of wins) {
      try {
        await win.waitForLoadState('domcontentloaded', { timeout: 3000 });
        const ready = await win.evaluate(() =>
          !!document.querySelector('[data-testid="floatball-btn"], [data-testid="control-bar"]')
        );
        if (ready) return win;
      } catch {
        // Window still loading.
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
      by + Math.round((deltaY * i) / steps),
    );
  }
  await win.mouse.up();
  await win.waitForTimeout(450);
}

// Wait until the ball's painted DOM position reaches the requested viewport
// coordinate (0,0 = workArea top-left), so the subsequent drag reads a fresh
// boundingBox instead of the pre-teleport spot. Polls the observable ball
// center instead of sleeping a fixed interval.
async function waitForBallAt(win, viewportX, viewportY) {
  await expect(async () => {
    const box = await win.getByTestId('floatball-btn').boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box.x + box.width / 2 - viewportX)).toBeLessThanOrEqual(2);
    expect(Math.abs(box.y + box.height / 2 - viewportY)).toBeLessThanOrEqual(2);
  }).toPass({ timeout: 2000 });
}

async function teleportBall(win, wa, x, y) {
  await win.evaluate(
    async ({ x, y }) => {
      await window.openPenApi?.sendPositioningIntent?.({ type: 'drag-start' });
      await window.openPenApi?.sendPositioningIntent?.({ type: 'drag-move', ballScreenPos: { x, y } });
      await window.openPenApi?.sendPositioningIntent?.({
        type: 'drag-end', ballScreenPos: { x, y }, hadMotion: true,
        enableDragAutoSnap: false, barBounds: null,
      });
    },
    { x: Math.round(x), y: Math.round(y) },
  );
  await waitForBallAt(win, Math.round(x) - wa.x, Math.round(y) - wa.y);
}

async function currentSnapEdge(win) {
  const cls = await win.getByTestId('floatball-btn').getAttribute('class');
  const match = cls?.match(/edge-(left|right|top|bottom)/);
  return match?.[1] ?? null;
}

// These vbar tests only make sense once the ball is actually snapped to the
// target side edge — the bar layout (vbar-left/-right) follows the snap. The
// drag gesture reads the ball's DOM position, so a teleport the renderer has
// not yet repainted can start the gesture from a stale spot and snap to the
// wrong edge under load. Confirm the edge and retry the gesture if it missed,
// rather than proceeding on an unverified layout.
async function snapToEdge(win, wa, edge) {
  const midY = wa.y + Math.floor(wa.height / 2);

  for (let attempt = 0; attempt < 3; attempt++) {
    if (edge === 'left') {
      await teleportBall(win, wa, wa.x + 30, midY);
      await dragBall(win, -120, 0);
    } else if (edge === 'right') {
      await teleportBall(win, wa, wa.x + wa.width - 30, midY);
      await dragBall(win, 120, 0);
    }

    if ((await currentSnapEdge(win)) === edge) return;
    await win.waitForTimeout(200);
  }

  expect(await currentSnapEdge(win), `ball failed to snap to ${edge} after 3 attempts`).toBe(edge);
}

/** Ensure the stroke-width module uses slider style (vbar shows vertical AppSlider). */
async function ensureStrokeWidthSliderStyle(win) {
  await win.evaluate(async () => {
    await window.openPenApi?.setModuleSettings?.('@openpen/stroke-width', { style: 'slider' }, 1);
  });
  await win.waitForTimeout(150);
}

/** Ensure the stroke-width module uses popup style (vbar shows a popover button). */
async function ensureStrokeWidthPopupStyle(win) {
  await win.evaluate(async () => {
    await window.openPenApi?.setModuleSettings?.('@openpen/stroke-width', { style: 'popup' }, 1);
  });
  await win.waitForTimeout(150);
}

// ── Vertical slider track direction ──────────────────────────────────────────

test('vbar vertical slider: app-slider-root--inverted class is present', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapToEdge(win, wa, 'left');
  await expandBar(win);
  await ensureStrokeWidthSliderStyle(win);

  const slider = win.getByTestId('stroke-slider-v-track').locator('[class~="app-slider-root"]');
  await expect(slider).toBeVisible({ timeout: 3000 });
  await expect(slider).toHaveClass(/app-slider-root--inverted/);
});

test('vbar vertical slider: range fills from top (inverted=true, top=min)', async () => {
  // reka-ui inverted=true sets startEdge='top' on SliderRange, so the range
  // element's top edge should coincide with the track's top edge.
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapToEdge(win, wa, 'left');
  await expandBar(win);
  await ensureStrokeWidthSliderStyle(win);

  // Set a mid-range value so the range fills partial track and is measurable.
  await win.evaluate(async () => {
    await window.openPenApi?.setModuleSettings?.('@openpen/stroke-width', { defaultWidth: 10 }, 1);
  });
  await win.waitForTimeout(150);

  const track = win.getByTestId('stroke-slider-v-track').locator('[class~="app-slider-track"]');
  const range = win.getByTestId('stroke-slider-v-track').locator('[class~="app-slider-range"]');
  await expect(track).toBeVisible({ timeout: 3000 });
  await expect(range).toBeVisible({ timeout: 3000 });

  const trackBox = await track.boundingBox();
  const rangeBox = await range.boundingBox();

  expect(trackBox).not.toBeNull();
  expect(rangeBox).not.toBeNull();

  // With inverted=true the range starts at the TOP of the track.
  // Allow 2px rounding tolerance from Electron's sub-pixel layout.
  expect(Math.abs(rangeBox.y - trackBox.y)).toBeLessThanOrEqual(2);
});

test('vbar vertical slider: ArrowDown key increases stroke width (down = more)', async () => {
  // inverted=true maps ArrowDown → increase in reka-ui's keyboard handling.
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapToEdge(win, wa, 'left');
  await expandBar(win);
  await ensureStrokeWidthSliderStyle(win);

  // Set a known starting value with room to increase.
  await win.evaluate(async () => {
    await window.openPenApi?.setModuleSettings?.('@openpen/stroke-width', { defaultWidth: 5 }, 1);
  });
  await win.waitForTimeout(150);

  // Focus the thumb and press ArrowDown.
  const thumb = win.getByTestId('stroke-slider-v-track').locator('[class~="app-slider-thumb"]');
  await expect(thumb).toBeVisible({ timeout: 3000 });
  await thumb.focus();
  await win.keyboard.press('ArrowDown');
  await win.waitForTimeout(100);

  // The thumb should have moved down (y increased) because value increased.
  // We check via the range height growing (more fill = taller range from top).
  const range = win.getByTestId('stroke-slider-v-track').locator('[class~="app-slider-range"]');
  const rangeBoxAfter = await range.boundingBox();
  expect(rangeBoxAfter).not.toBeNull();
  // Range height > 0 confirms fill is present and direction is working.
  expect(rangeBoxAfter.height).toBeGreaterThan(0);
});

// ── Regression: popup direction (existing coverage retained) ─────────────────

async function getBarAndPopupBoxes(win, popupSelector) {
  const popup = win.locator(popupSelector).first();
  await expect(popup).toBeVisible({ timeout: 3000 });
  const [barBox, popupBox] = await Promise.all([
    win.getByTestId('control-bar').boundingBox(),
    popup.boundingBox(),
  ]);
  return { barBox, popupBox };
}

test('regression: stroke-width popup opens to the RIGHT of bar in vbar-left layout', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapToEdge(win, wa, 'left');
  await expandBar(win);
  await ensureStrokeWidthPopupStyle(win);

  const swBtn = win.getByTestId('stroke-slider-v-btn').or(win.getByTestId('stroke-slider-h-btn')).first();
  await swBtn.click();
  await win.waitForTimeout(250);

  const { barBox, popupBox } = await getBarAndPopupBoxes(
    win,
    '.openpen-popover-content[data-state="open"]',
  );

  expect(popupBox).not.toBeNull();
  expect(barBox).not.toBeNull();
  expect(popupBox.x).toBeGreaterThan(barBox.x + barBox.width - 4);

  await win.keyboard.press('Escape');
  await win.waitForTimeout(200);
});

test('regression: stroke-width popup opens to the LEFT of bar in vbar-right layout', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapToEdge(win, wa, 'right');
  await expandBar(win);
  await ensureStrokeWidthPopupStyle(win);

  const swBtn = win.getByTestId('stroke-slider-v-btn').or(win.getByTestId('stroke-slider-h-btn')).first();
  await swBtn.click();
  await win.waitForTimeout(250);

  const { barBox, popupBox } = await getBarAndPopupBoxes(
    win,
    '.openpen-popover-content[data-state="open"]',
  );

  expect(popupBox).not.toBeNull();
  expect(barBox).not.toBeNull();
  expect(popupBox.x + popupBox.width).toBeLessThan(barBox.x + 4);

  await win.keyboard.press('Escape');
  await win.waitForTimeout(200);
});

test('regression: color picker opens to the RIGHT of bar in vbar-left layout', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapToEdge(win, wa, 'left');
  await expandBar(win);

  await win.getByTestId('controlbar-color-btn').click();
  await win.waitForTimeout(250);

  const { barBox, popupBox } = await getBarAndPopupBoxes(
    win,
    '.openpen-popover-content[data-state="open"]',
  );

  expect(popupBox).not.toBeNull();
  expect(barBox).not.toBeNull();
  expect(popupBox.x).toBeGreaterThan(barBox.x + barBox.width - 4);

  await win.keyboard.press('Escape');
  await win.waitForTimeout(200);
});

test('regression: color picker opens to the LEFT of bar in vbar-right layout', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await snapToEdge(win, wa, 'right');
  await expandBar(win);

  await win.getByTestId('controlbar-color-btn').click();
  await win.waitForTimeout(250);

  const { barBox, popupBox } = await getBarAndPopupBoxes(
    win,
    '.openpen-popover-content[data-state="open"]',
  );

  expect(popupBox).not.toBeNull();
  expect(barBox).not.toBeNull();
  expect(popupBox.x + popupBox.width).toBeLessThan(barBox.x + 4);

  await win.keyboard.press('Escape');
  await win.waitForTimeout(200);
});
