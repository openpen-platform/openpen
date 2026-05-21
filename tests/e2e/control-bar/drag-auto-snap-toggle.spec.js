/**
 * E2E tests for the enableDragAutoSnap and barLayout settings.
 *
 * Covers:
 *  1. Default behavior preserved — snap=ON: drag right → snaps to vbar-right.
 *  2. snap=ON overrides barLayout: dragging to left edge → vbar-left regardless of barLayout.
 *  3. vbar-free: bar overall shape is taller than wide (vertical column layout visible to user).
 *  4. barLayout AppSegmented is disabled (pointer-events=none) when snap=ON.
 *  5. Popup direction: horizontal bar near screen bottom — shape popup stays within viewport.
 */
import { test, expect } from '@playwright/test';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';

// The main window is workArea-sized and fixed. Ball position is set via sendPositioningIntent.

let electronApp;
attachElectronErrorDetection(() => electronApp);

test.beforeAll(async () => {
  electronApp = await launchElectronApp();
});

test.afterAll(async () => {
  await electronApp?.close();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Wait for the main window (the one without ?window=overlay or ?window=settings).
 */
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
        // Window may be loading or closing — skip.
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Main window with .float-ball/.control-bar not found within 40s');
}

/** Ensure ball mode; if bar is expanded, wait for auto-collapse. */
async function ensureBallMode(win) {
  const bar = win.getByTestId('control-bar');
  if (await bar.isVisible().catch(() => false)) {
    await bar.hover();
    await win.mouse.move(200, 750); // well clear of every bar layout
    await win.waitForTimeout(3500);
  }
  await expect(win.getByTestId('floatball-btn')).toBeVisible({ timeout: 5000 });
}

/** Expand the control bar (idempotent). */
async function expandBar(win) {
  const bar = win.getByTestId('control-bar');
  if (!(await bar.isVisible().catch(() => false))) {
    await win.getByTestId('floatball-btn').click();
    await win.waitForTimeout(400);
  }
  await expect(bar).toBeVisible({ timeout: 3000 });
}

/**
 * Drag the ball horizontally using its real position via boundingBox().
 * Mirrors the helper in layout.spec.js.
 */
async function dragBall(win, deltaX, steps = 10) {
  const box = await win.getByTestId('floatball-btn').boundingBox();
  const bx = Math.round(box.x + box.width / 2);
  const by = Math.round(box.y + box.height / 2);
  await win.mouse.move(bx, by);
  await win.waitForTimeout(50);
  await win.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await win.mouse.move(bx + Math.round(deltaX * i / steps), by);
  }
  await win.mouse.up();
  await win.waitForTimeout(450);
}

/**
 * Teleport the ball to a screen coordinate without triggering snap.
 * Sends drag-start + drag-move + drag-end (enableDragAutoSnap=false) intents.
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
 * Open the settings window via IPC (simpler than clicking the gear button;
 * the gear-button flow is covered by settings.spec.js).
 */
async function openSettings(mainWin) {
  const winPromise = electronApp.waitForEvent('window', { timeout: 10000 });
  await mainWin.evaluate(() => window.openPenApi?.openSettingsWindow());
  const settingsWin = await winPromise;
  await settingsWin.waitForLoadState('domcontentloaded');
  await settingsWin.waitForSelector('[data-testid="settings-window"]', { timeout: 10000 });
  return settingsWin;
}

/** Navigate to the Behavior tab in the settings window. */
async function goToBehaviorTab(settingsWin) {
  await settingsWin.getByTestId('tab-behavior').click();
  await settingsWin.waitForTimeout(200);
}

/** Save and close the settings window. */
async function saveSettings(settingsWin) {
  await settingsWin.locator('[data-testid="save-btn"]').click();
  await settingsWin.waitForEvent('close', { timeout: 5000 }).catch(() => {});
  // Give main window time to receive the settings-updated broadcast.
  await new Promise((r) => setTimeout(r, 500));
}

/** Close any open settings window without saving. */
async function closeSettings(settingsWin) {
  await settingsWin.getByTestId('cancel-btn').click();
  await settingsWin.waitForEvent('close', { timeout: 5000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 300));
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('snap=ON default: drag to right edge snaps bar to vbar-right', async () => {
  // Tests that the default behavior (enableDragAutoSnap=true) is unchanged —
  // dragging toward the right edge produces a vbar-right class on the expanded
  // control bar.  This may overlap with layout.spec.js but serves as an
  // explicit regression check for this feature.
  const win = await getMainWindow();
  await ensureBallMode(win);

  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  // Place ball near the right edge so a small drag triggers a snap.
  await setBallScreenPos(win, wa.x + wa.width - 20, wa.y + Math.floor(wa.height / 2));
  await win.waitForTimeout(200);

  await dragBall(win, 100);

  const ballCls = await win.getByTestId('floatball-btn').getAttribute('class');
  expect(ballCls).toMatch(/edge-right/);

  await expandBar(win);
  const barCls = await win.getByTestId('control-bar').getAttribute('class');
  expect(barCls).toMatch(/vbar-right/);
});


test('snap=ON overrides barLayout: dragging to left edge produces vbar-left regardless of barLayout', async () => {
  // When snap=ON, barLayout is completely ignored — the snap edge
  // determines orientation. barLayout='horizontal' + snap=ON + left drag → vbar-left.
  // (Old behavior: barLayout='horizontal' would have overridden snap; new behavior: snap wins.)
  const win = await getMainWindow();
  await ensureBallMode(win);

  // snap is ON by default; barLayout defaults to 'horizontal'.
  // No settings changes needed — just place ball near the left edge and drag.
  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(win, wa.x + 20, wa.y + Math.floor(wa.height / 2));
  await win.waitForTimeout(200);

  await dragBall(win, -100);

  // snap=ON + left edge drag → vbar-left (barLayout='horizontal' is ignored).
  await expandBar(win);
  const barCls = await win.getByTestId('control-bar').getAttribute('class');
  expect(barCls).toMatch(/vbar-left/);

  // Restore to centered position so subsequent tests start from a clean state.
  await ensureBallMode(win);
  await setBallScreenPos(win, wa.x + Math.floor(wa.width / 2), wa.y + Math.floor(wa.height / 2));
  await win.waitForTimeout(200);
});

// ── vbar-free layout: user-visible bar shape ──────────────────────────────────
//
// When barLayout=vertical and snap=OFF, the bar renders as a vertical column.
// A single root-element boundingBox assertion captures the user-visible outcome
// more honestly than asserting the dimensions of internal child elements (SVG,
// separator, buttons). The bar's overall shape — taller than wide — is what
// the user actually perceives.

test('vbar-free: bar aspect ratio reflects vertical layout', async () => {
  // Replaces three previous internal-element aspect tests with a single
  // root-element shape assertion. The previous tests asserted that the SVG /
  // separator / button each had specific dimensions inside vbar-free; the user
  // only ever perceives the bar's overall shape, so a single boundingBox aspect
  // assertion is both more robust and more honest about the user-visible contract.
  const win = await getMainWindow();
  await ensureBallMode(win);

  // Set barLayout=vertical + snap=OFF.
  const settingsWin = await openSettings(win);
  await goToBehaviorTab(settingsWin);

  const snapToggle = settingsWin.locator('[aria-label="Snap to Screen Edges When Dragging"]');
  if ((await snapToggle.getAttribute('data-state')) !== 'unchecked') {
    await snapToggle.click();
    await settingsWin.waitForTimeout(200);
  }
  const verticalBtn = settingsWin.getByTestId('bar-layout-vertical');
  await verticalBtn.click();
  await settingsWin.waitForTimeout(200);

  await saveSettings(settingsWin);
  await win.waitForTimeout(300);

  // Position at screen center so snap edge stays null (vbar-free, not vbar-left/right).
  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(
    win,
    wa.x + Math.floor(wa.width / 2),
    wa.y + Math.floor(wa.height / 2),
  );
  await win.waitForTimeout(200);

  await expandBar(win);
  await win.waitForTimeout(200);

  // The bar in vertical layout is a column: height clearly exceeds width.
  const barBox = await win.getByTestId('control-bar').boundingBox();
  expect(barBox).not.toBeNull();
  // Guard against degenerate case (bar collapsed or zero-size).
  expect(barBox.height).toBeGreaterThan(200);
  expect(barBox.height).toBeGreaterThan(barBox.width);

  // Restore defaults: barLayout=horizontal, snap=ON.
  await ensureBallMode(win);
  const restore = await openSettings(win);
  await goToBehaviorTab(restore);

  const rt = restore.locator('[aria-label="Snap to Screen Edges When Dragging"]');
  // Ensure snap is OFF first so the segmented control is enabled for interaction.
  if ((await rt.getAttribute('data-state')) !== 'unchecked') {
    await rt.click();
    await restore.waitForTimeout(200);
  }

  // Restore barLayout to Horizontal (segmented is now enabled because snap=OFF).
  const horizontalRestoreBtn = restore.getByTestId('bar-layout-horizontal');
  await horizontalRestoreBtn.click();
  await restore.waitForTimeout(200);

  // Re-enable snap.
  if ((await rt.getAttribute('data-state')) === 'unchecked') {
    await rt.click();
    await restore.waitForTimeout(200);
  }
  await saveSettings(restore);
  await win.waitForTimeout(300);
});

// ── snap-orientation interaction tests ────────────────────────────────────────
//
// The test below covers the model contract: barLayout is disabled when snap=ON.

test('barLayout AppSegmented is disabled when snap=ON', async () => {
  // Regression: AppSegmented must be disabled when snap=ON because the snap edge
  // determines orientation and barLayout has no effect — so the control MUST be visually disabled.
  //
  // Failure on old code: AppSegmented had no :disabled prop at all → the segmented
  // would remain interactive (pointer-events: auto, opacity: 1) even when snap=ON.
  // The test asserts the .app-seg--disabled class is present AND pointer-events=none.
  const win = await getMainWindow();

  const settingsWin = await openSettings(win);
  await goToBehaviorTab(settingsWin);

  // Ensure snap is ON (default; but confirm to be safe).
  const snapToggle = settingsWin.locator('[aria-label="Snap to Screen Edges When Dragging"]');
  const snapState = await snapToggle.getAttribute('data-state');
  if (snapState === 'unchecked') {
    await snapToggle.click();
    await settingsWin.waitForTimeout(200);
  }

  // The Bar Orientation AppSegmented must carry the .app-seg--disabled class.
  const segDisabled = await settingsWin.evaluate(() => {
    const seg = document.querySelector('[data-testid="bar-layout-seg"]');
    return seg ? seg.classList.contains('app-seg--disabled') : false;
  });
  expect(segDisabled).toBe(true);

  // Also verify via computed style: pointer-events should be 'none'.
  const pointerEvents = await settingsWin.evaluate(() => {
    const seg = document.querySelector('[data-testid="bar-layout-seg"]');
    return seg ? getComputedStyle(seg).pointerEvents : '';
  });
  expect(pointerEvents).toBe('none');

  await closeSettings(settingsWin);
});

test('horizontal near screen bottom: shape popup stays within viewport bounds', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  // Disable snap, ensure horizontal layout.
  const setupWin = await openSettings(win);
  await goToBehaviorTab(setupWin);
  const snapToggle = setupWin.locator('[aria-label="Snap to Screen Edges When Dragging"]');
  if ((await snapToggle.getAttribute('data-state')) !== 'unchecked') {
    await snapToggle.click();
    await setupWin.waitForTimeout(200);
  }
  const hBtn = setupWin.getByTestId('bar-layout-horizontal');
  await hBtn.click();
  await setupWin.waitForTimeout(200);
  await saveSettings(setupWin);
  await win.waitForTimeout(300);

  // Place ball near screen bottom — popup must not overflow below the viewport.
  const wa = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  await setBallScreenPos(win, wa.x + Math.floor(wa.width / 2), wa.y + wa.height - 200);
  await win.waitForTimeout(200);

  await expandBar(win);
  await win.waitForTimeout(400);

  const caretBtn = win.locator('[aria-label="Shape options"]');
  await caretBtn.click();
  await win.waitForTimeout(400);

  const popupContent = win.locator('[class~="openpen-popover-content"]');
  await expect(popupContent).toBeVisible({ timeout: 3000 });

  // Geometric invariant: popup must remain fully within the viewport regardless
  // of which side floating-ui chooses. The workArea-sized window means viewport
  // boundaries are exact — no clipping due to window/workArea mismatch.
  const popupBox = await popupContent.boundingBox();
  const viewport = await win.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  expect(popupBox).not.toBeNull();
  expect(popupBox.x).toBeGreaterThanOrEqual(0);
  expect(popupBox.y).toBeGreaterThanOrEqual(0);
  expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(viewport.w + 1);
  expect(popupBox.y + popupBox.height).toBeLessThanOrEqual(viewport.h + 1);

  // Close and restore defaults.
  await win.keyboard.press('Escape');
  await win.waitForTimeout(300);

  await ensureBallMode(win);
  const restoreWin = await openSettings(win);
  await goToBehaviorTab(restoreWin);
  const rt = restoreWin.locator('[aria-label="Snap to Screen Edges When Dragging"]');
  if ((await rt.getAttribute('data-state')) === 'unchecked') {
    await rt.click();
    await restoreWin.waitForTimeout(200);
  }
  await saveSettings(restoreWin);
  await win.waitForTimeout(300);
});
