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
          () => !!document.querySelector('[data-testid="floatball-btn"], [data-testid="control-bar"]')
        );
        if (hasMainUi) return win;
      } catch {
        // Ignore windows that are closed or still loading; keep polling.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Unable to locate main window with .float-ball/.control-bar within 40s');
}

async function ensureBallMode(win) {
  const ball = win.getByTestId('floatball-btn');
  const bar = win.getByTestId('control-bar');
  if (await bar.isVisible().catch(() => false)) {
    await win.mouse.move(200, 35);
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

// data-tip="Pin" matches the rendered i18n value under the default 'en' locale.

test('initial state: ball visible, control bar hidden', async () => {
  const mainWindow = await getMainWindow();
  await ensureBallMode(mainWindow);

  await expect(mainWindow.getByTestId('floatball-btn')).toBeVisible();
  await expect(mainWindow.getByTestId('control-bar')).not.toBeVisible();
});

test('clicking the ball expands the control bar', async () => {
  const mainWindow = await getMainWindow();
  await ensureBallMode(mainWindow);

  const ball = mainWindow.getByTestId('floatball-btn');
  await expect(ball).toBeVisible();

  await ball.click();

  await expect(mainWindow.getByTestId('control-bar')).toBeVisible();
  await expect(mainWindow.getByTestId('floatball-btn')).not.toBeVisible();
});

test('control bar shows the pin button', async () => {
  const mainWindow = await getMainWindow();
  // The previous test may leave the bar expanded; re-expand otherwise.
  const bar = mainWindow.getByTestId('control-bar');
  if (!(await bar.isVisible())) {
    await mainWindow.getByTestId('floatball-btn').click();
    await expect(bar).toBeVisible();
  }

  const pinBtn = mainWindow.getByTestId('controlbar-pin-btn');
  await expect(pinBtn).toBeVisible();
});

test('while pinned, the bar stays expanded beyond the 3s auto-collapse', async () => {
  const mainWindow = await getMainWindow();

  const bar = mainWindow.getByTestId('control-bar');
  if (!(await bar.isVisible())) {
    await mainWindow.getByTestId('floatball-btn').click();
    await expect(bar).toBeVisible();
  }

  const pinBtn = mainWindow.getByTestId('controlbar-pin-btn');
  await pinBtn.click();
  await expect(pinBtn).toHaveClass(/pinned/);

  // Move pointer outside the control bar.
  await mainWindow.mouse.move(0, 0);

  // Wait past the 3s auto-collapse window.
  await mainWindow.waitForTimeout(3500);

  await expect(bar).toBeVisible();

  // Geometric invariant: the bar must remain fully inside the viewport while
  // pinned. If the collapse timer fires incorrectly and the bar re-positions
  // before hiding, this catches it; if the timer holds but the bar geometry
  // drifts, this catches that too.
  const barBox = await bar.boundingBox();
  const viewport = await mainWindow.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  expect(barBox).not.toBeNull();
  expect(barBox.x).toBeGreaterThanOrEqual(-1);
  expect(barBox.y).toBeGreaterThanOrEqual(-1);
  expect(barBox.x + barBox.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(viewport.height + 1);
});

test('after unpinning, the bar auto-collapses 3s after the pointer leaves', async () => {
  const mainWindow = await getMainWindow();

  // Always start from ball mode so the previous test's pinned state doesn't leak.
  await ensureBallMode(mainWindow);

  const bar = mainWindow.getByTestId('control-bar');
  await mainWindow.getByTestId('floatball-btn').click();
  await expect(bar).toBeVisible();

  const pinBtn = mainWindow.getByTestId('controlbar-pin-btn');
  const isPinned = await pinBtn.evaluate(el => el.classList.contains('pinned'));

  // End up unpinned regardless of the initial state.
  if (!isPinned) {
    await pinBtn.click(); // pin
    await pinBtn.click(); // unpin
  } else {
    await pinBtn.click(); // unpin
  }

  await expect(pinBtn).not.toHaveClass(/pinned/);

  // Enter then leave the control bar to fire mouseleave.
  await mainWindow.mouse.move(200, 35);
  await mainWindow.mouse.move(0, 0);

  await mainWindow.waitForTimeout(3500);

  await expect(mainWindow.getByTestId('floatball-btn')).toBeVisible();
  await expect(bar).not.toBeVisible();
});

test('ball fades after 4s of idle (opacity drops)', async () => {
  const win = await getMainWindow();

  await ensureBallMode(win);

  const initOpacity = await win.evaluate(() => {
    const ball = document.querySelector('[data-testid="floatball-btn"]');
    return ball ? getComputedStyle(ball).opacity : null;
  });
  expect(parseFloat(initOpacity)).toBeCloseTo(1, 1);

  // Wait past the 4s idle threshold.
  await win.waitForTimeout(4200);

  const idleOpacity = await win.evaluate(() => {
    const ball = document.querySelector('[data-testid="floatball-btn"]');
    return ball ? getComputedStyle(ball).opacity : null;
  });
  expect(parseFloat(idleOpacity)).toBeLessThan(0.9);
  expect(parseFloat(idleOpacity)).toBeGreaterThanOrEqual(0.5);
});

test('moving the pointer over the ball restores opacity to 1', async () => {
  const win = await getMainWindow();
  await ensureBallMode(win);

  await win.waitForTimeout(4200);

  // Move onto the ball; wait 300ms so the 200ms opacity transition completes.
  const box = await win.getByTestId('floatball-btn').boundingBox();
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await win.waitForTimeout(300);

  const opacity = await win.evaluate(() => {
    const ball = document.querySelector('[data-testid="floatball-btn"]');
    return ball ? getComputedStyle(ball).opacity : null;
  });
  expect(parseFloat(opacity)).toBeCloseTo(1, 1);
});
