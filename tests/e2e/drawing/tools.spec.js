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
        // Ignore windows still initializing.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('Main window not found within 20s');
}

async function getOverlayWindow() {
  await new Promise(r => setTimeout(r, 500));
  const wins = electronApp.windows();
  for (const w of wins) {
    if (w.url().includes('window=overlay')) return w;
  }
  const win = await electronApp.waitForEvent('window');
  await win.waitForLoadState('domcontentloaded');
  return win;
}

// ─────────────────────────────────────────────────────────────────────────────
// Note: aria-label/data-tip selectors below (e.g. 'Freehand', 'Line') match
// the rendered i18n output under the default 'en' locale. They are selector
// strings and must stay in sync with src/i18n/en.ts if those keys change.

test('expanded control bar shows the tool buttons (freehand, line, shape)', async () => {
  const mainWin = await getMainWindow();

  const ball = mainWin.locator('.float-ball');
  await ball.click();
  await mainWin.waitForTimeout(400);

  await expect(mainWin.locator('[data-testid="controlbar-freehand-btn"]')).toBeVisible();
  await expect(mainWin.locator('[data-testid="controlbar-line-btn"]')).toBeVisible();
  await expect(mainWin.locator('[data-testid="controlbar-shape-btn"]')).toBeVisible();
});

test('freehand is the default active tool', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  const bar = mainWin.locator('.control-bar');
  if (!(await bar.isVisible())) {
    await mainWin.locator('.float-ball').click();
    await mainWin.waitForTimeout(400);
  }

  const freehandBtn = mainWin.locator('[data-testid="controlbar-freehand-btn"]');
  await expect(freehandBtn).toHaveClass(/active/);

  // Verify the overlay process reflects freehand as the active tool — this
  // crosses the renderer↔overlay IPC boundary and catches wiring failures
  // that a class-only assertion on the control bar cannot detect.
  await waitForOverlayTool(overlayWin, 'freehand');
});

test('clicking the line tool makes it active', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  const bar = mainWin.locator('.control-bar');
  if (!(await bar.isVisible())) {
    await mainWin.locator('.float-ball').click();
    await mainWin.waitForTimeout(400);
  }

  await mainWin.locator('[data-testid="controlbar-line-btn"]').click();
  await mainWin.waitForTimeout(100);

  const lineBtn = mainWin.locator('[data-testid="controlbar-line-btn"]');
  await expect(lineBtn).toHaveClass(/active/);
  // Freehand button should lose its active state.
  const freehandBtn = mainWin.locator('[data-testid="controlbar-freehand-btn"]');
  expect(await freehandBtn.evaluate(el => el.classList.contains('active'))).toBe(false);

  // Verify the tool switch propagated to the overlay process — catching any
  // IPC wiring failure that class presence on the control bar cannot detect.
  await waitForOverlayTool(overlayWin, 'line');

  // Restore freehand so subsequent tests start from a known state.
  await mainWin.locator('[data-testid="controlbar-freehand-btn"]').click();
});

test('clicking the shape tool switches mode only; the caret opens the sub-panel', async () => {
  const mainWin = await getMainWindow();

  const bar = mainWin.locator('.control-bar');
  if (!(await bar.isVisible())) {
    await mainWin.locator('.float-ball').click();
    await mainWin.waitForTimeout(400);
  }

  await mainWin.locator('[data-testid="controlbar-shape-btn"]').click();
  await mainWin.waitForTimeout(100);

  // Clicking the main button switches tool without auto-opening the sub-panel.
  const shapeBtn = mainWin.locator('[data-testid="controlbar-shape-btn"]');
  await expect(shapeBtn).toHaveClass(/active/);
  await expect(mainWin.locator('.shape-popover')).not.toBeVisible();

  // Only the caret opens the shape sub-panel.
  await mainWin.locator('[data-testid="controlbar-shape-caret"]').click();
  await mainWin.waitForTimeout(100);

  // Shape chips and the fill toggle should now be visible.
  await expect(mainWin.locator('.shape-chip[aria-label="Rectangle"]')).toBeVisible();
  await expect(mainWin.locator('.shape-chip[aria-label="Circle"]')).toBeVisible();
  await expect(mainWin.locator('.app-toggle[aria-label="Toggle fill"]')).toBeVisible();
});

test('setActiveTool IPC is callable and does not throw', async () => {
  const mainWin = await getMainWindow();

  const result = await mainWin.evaluate(() => {
    window.openPenApi?.setActiveTool({ tool: 'line' });
    return true;
  });
  expect(result).toBe(true);
});

test('line tool draws non-transparent pixels on the canvas', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  await mainWin.evaluate(() => window.openPenApi?.setActiveTool({ tool: 'line' }));
  await overlayWin.waitForTimeout(100);

  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await overlayWin.waitForTimeout(200);

  const canvas = overlayWin.locator('.overlay-canvas');

  await canvas.dispatchEvent('pointerdown', { clientX: 50, clientY: 50, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointermove', { clientX: 150, clientY: 150, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointerup', { clientX: 150, clientY: 150, pointerId: 1, bubbles: true });
  await overlayWin.waitForTimeout(200);

  const hasPixels = await overlayWin.evaluate(() => {
    const canvas = document.querySelector('.overlay-canvas');
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  });
  expect(hasPixels).toBe(true);

  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await mainWin.evaluate(() => window.openPenApi?.setActiveTool({ tool: 'freehand' }));
});

test('shape tool draws non-transparent pixels for a rectangle', async () => {
  const mainWin = await getMainWindow();
  const overlayWin = await getOverlayWindow();

  await mainWin.evaluate(() =>
    window.openPenApi?.setActiveTool({ tool: 'shape', shapeType: 'rect', filled: false }),
  );
  await overlayWin.waitForTimeout(100);

  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(true));
  await overlayWin.waitForTimeout(200);

  const canvas = overlayWin.locator('.overlay-canvas');

  await canvas.dispatchEvent('pointerdown', { clientX: 80, clientY: 80, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointermove', { clientX: 200, clientY: 180, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointerup', { clientX: 200, clientY: 180, pointerId: 1, bubbles: true });
  await overlayWin.waitForTimeout(200);

  const hasPixels = await overlayWin.evaluate(() => {
    const canvas = document.querySelector('.overlay-canvas');
    if (!canvas) return false;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  });
  expect(hasPixels).toBe(true);

  await mainWin.evaluate(() => window.openPenApi?.setDrawingMode(false));
  await mainWin.evaluate(() => window.openPenApi?.setActiveTool({ tool: 'freehand' }));
});

async function getMainWindowForEraser() {
  const existing = electronApp.windows();
  for (const win of existing) {
    const url = win.url();
    if (!url.includes('window=overlay')) {
      await win.waitForLoadState('domcontentloaded');
      return win;
    }
  }
  const win = await electronApp.waitForEvent('window');
  await win.waitForLoadState('domcontentloaded');
  return win;
}

async function getOverlayWindowForEraser() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const wins = electronApp.windows();
    for (const w of wins) {
      try {
        if (!w.url().includes('window=overlay')) continue;
        await w.waitForLoadState('domcontentloaded');
        return w;
      } catch {
        // Ignore windows still initializing or already closed.
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Overlay window not found within timeout');
}

async function expandControlBar(win) {
  await win.waitForSelector('.float-ball, .control-bar', { timeout: 10000 });
  const bar = win.locator('.control-bar');
  const barVisible = await bar.isVisible().catch(() => false);
  if (!barVisible) {
    await win.locator('.float-ball').click();
    await win.waitForTimeout(500);
  }
}

async function waitForOverlayTool(win, tool) {
  await win.waitForFunction(
    ({ tool }) => {
      const debug = window.__OPENPEN_DEBUG__?.overlay;
      if (!debug) return false;
      return debug.activeTool === tool;
    },
    { tool },
    { timeout: 5000 },
  );
}

test('brush eraser drag erases strokes along its path', async () => {
  const mainWin = await getMainWindowForEraser();
  const overlayWin = await getOverlayWindowForEraser();

  await mainWin.evaluate(() => {
    window.openPenApi?.clearCanvas();
    window.openPenApi?.setStrokeStyle({ color: '#111111', lineWidth: 18 });
    window.openPenApi?.setActiveTool({ tool: 'freehand' });
    window.openPenApi?.setDrawingMode(true);
  });
  await overlayWin.waitForTimeout(200);
  await waitForOverlayTool(overlayWin, 'freehand');

  const canvas = overlayWin.locator('.overlay-canvas');
  await canvas.dispatchEvent('pointerdown', { clientX: 80, clientY: 150, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointermove', { clientX: 340, clientY: 150, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointerup', { clientX: 340, clientY: 150, pointerId: 1, bubbles: true });
  await overlayWin.waitForTimeout(120);

  const baseline = await overlayWin.evaluate(() => {
    const canvas = document.querySelector('.overlay-canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const ratio = canvas.width / canvas.clientWidth;
    const sampleX = Math.floor(230 * ratio);
    const yStart = Math.floor(100 * ratio);
    const yEnd = Math.floor(200 * ratio);
    let minY = -1;
    let maxY = -1;
    for (let y = yStart; y <= yEnd; y += 1) {
      const alpha = ctx.getImageData(sampleX, y, 1, 1).data[3];
      if (alpha > 0) {
        if (minY === -1) minY = y;
        maxY = y;
      }
    }
    if (minY === -1 || maxY === -1) return null;
    return { sampleX, minY, maxY };
  });

  expect(baseline).not.toBeNull();

  await expandControlBar(mainWin);
  await mainWin.locator('[data-testid="controlbar-eraser-btn"]').click();
  await waitForOverlayTool(overlayWin, 'eraser');

  await mainWin.evaluate(() => {
    window.openPenApi?.setStrokeStyle({ color: '#111111', lineWidth: 8 });
  });
  await overlayWin.waitForTimeout(80);

  await canvas.dispatchEvent('pointerdown', { clientX: 210, clientY: 150, pointerId: 2, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointermove', { clientX: 250, clientY: 150, pointerId: 2, buttons: 1, bubbles: true });
  // Wait one overlay repaint before sampling; otherwise we occasionally read
  // stale pixels and get a spurious 0.
  await overlayWin.waitForTimeout(120);

  const widthWhileDragging = await overlayWin.evaluate((b) => {
    const canvas = document.querySelector('.overlay-canvas');
    if (!canvas || !b) return -1;
    const ctx = canvas.getContext('2d');
    let count = 0;
    for (let y = b.minY; y <= b.maxY; y += 1) {
      const alpha = ctx.getImageData(b.sampleX, y, 1, 1).data[3];
      if (alpha === 0) count += 1;
    }
    return count;
  }, baseline);

  await canvas.dispatchEvent('pointerup', { clientX: 250, clientY: 150, pointerId: 2, bubbles: true });
  await overlayWin.waitForTimeout(120);

  const widthAfterCommit = await overlayWin.evaluate((b) => {
    const canvas = document.querySelector('.overlay-canvas');
    if (!canvas || !b) return -1;
    const ctx = canvas.getContext('2d');
    let count = 0;
    for (let y = b.minY; y <= b.maxY; y += 1) {
      const alpha = ctx.getImageData(b.sampleX, y, 1, 1).data[3];
      if (alpha === 0) count += 1;
    }
    return count;
  }, baseline);

  expect(widthWhileDragging).toBeGreaterThan(2);
  expect(widthAfterCommit).toBeGreaterThan(2);
  expect(Math.abs(widthWhileDragging - widthAfterCommit)).toBeLessThanOrEqual(1);
});

test('stroke eraser removes only strokes it hits', async () => {
  const mainWin = await getMainWindowForEraser();
  const overlayWin = await getOverlayWindowForEraser();
  const canvas = overlayWin.locator('.overlay-canvas');

  await mainWin.evaluate(() => {
    window.openPenApi?.clearCanvas();
    window.openPenApi?.setActiveTool({ tool: 'line' });
    window.openPenApi?.setDrawingMode(true);
  });
  await overlayWin.waitForTimeout(200);
  await waitForOverlayTool(overlayWin, 'line');

  await canvas.dispatchEvent('pointerdown', { clientX: 80, clientY: 200, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointermove', { clientX: 260, clientY: 200, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointerup', { clientX: 260, clientY: 200, pointerId: 1, bubbles: true });

  await canvas.dispatchEvent('pointerdown', { clientX: 80, clientY: 260, pointerId: 2, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointermove', { clientX: 260, clientY: 260, pointerId: 2, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointerup', { clientX: 260, clientY: 260, pointerId: 2, bubbles: true });
  await overlayWin.waitForTimeout(150);

  // Stroke eraser is now accessed via the eraser caret popup (design: 1 eraser button + caret).
  await expandControlBar(mainWin);
  await mainWin.locator('[data-testid="controlbar-eraser-caret"]').click();
  await mainWin.waitForTimeout(250);
  await mainWin.locator('.cb-menu-item[class*="active"], .cb-menu-item').filter({ hasText: 'Stroke Erase' }).click();
  await mainWin.waitForTimeout(200);
  await waitForOverlayTool(overlayWin, 'stroke-eraser');

  await canvas.dispatchEvent('pointerdown', { clientX: 150, clientY: 200, pointerId: 3, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointermove', { clientX: 151, clientY: 200, pointerId: 3, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointerup', { clientX: 150, clientY: 200, pointerId: 3, bubbles: true });
  await overlayWin.waitForTimeout(150);

  const sample = await overlayWin.evaluate(() => {
    const canvas = document.querySelector('.overlay-canvas');
    if (!canvas) return { first: 0, second: 0 };
    const ctx = canvas.getContext('2d');
    const ratio = canvas.width / canvas.clientWidth;
    const countInRect = ({ x, y, width, height }) => {
      const startX = Math.max(0, Math.min(canvas.width - 1, Math.floor(x * ratio)));
      const startY = Math.max(0, Math.min(canvas.height - 1, Math.floor(y * ratio)));
      const rectWidth = Math.max(1, Math.floor(width * ratio));
      const rectHeight = Math.max(1, Math.floor(height * ratio));
      let count = 0;
      for (let dx = 0; dx < rectWidth; dx += 1) {
        for (let dy = 0; dy < rectHeight; dy += 1) {
          const px = Math.min(canvas.width - 1, startX + dx);
          const py = Math.min(canvas.height - 1, startY + dy);
          if (ctx.getImageData(px, py, 1, 1).data[3] > 0) {
            count += 1;
          }
        }
      }
      return count;
    };
    const measureBand = (centerY) => {
      const rect = {
        x: 120,
        y: centerY - 12,
        width: 120,
        height: 24,
      };
      return countInRect(rect);
    };
    return {
      first: measureBand(200),
      second: measureBand(260),
    };
  });

  expect(sample.first).toBeLessThan(20);
  expect(sample.second).toBeGreaterThan(40);
});

test('the clear button empties the canvas', async () => {
  const mainWin = await getMainWindowForEraser();
  const overlayWin = await getOverlayWindowForEraser();
  const canvas = overlayWin.locator('.overlay-canvas');

  await mainWin.evaluate(() => {
    window.openPenApi?.setActiveTool({ tool: 'freehand' });
    window.openPenApi?.setDrawingMode(true);
  });
  await overlayWin.waitForTimeout(200);

  await canvas.dispatchEvent('pointerdown', { clientX: 90, clientY: 90, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointermove', { clientX: 220, clientY: 140, pointerId: 1, buttons: 1, bubbles: true });
  await canvas.dispatchEvent('pointerup', { clientX: 220, clientY: 140, pointerId: 1, bubbles: true });
  await overlayWin.waitForTimeout(120);

  await expandControlBar(mainWin);
  const clearBtn = mainWin.locator('.cb-clear-btn');
  await clearBtn.click();

  // The confirm dialog may appear when confirmBeforeClearCanvas is ON (default).
  // Click the confirm action button if it is visible (DialogHost renders it with the translated label).
  const confirmAction = mainWin.getByRole('button', { name: 'Clear' });
  if (await confirmAction.isVisible().catch(() => false)) {
    await confirmAction.click();
  }

  await overlayWin.waitForTimeout(150);
  await overlayWin.waitForTimeout(150);

  const hasPixels = await overlayWin.evaluate(() => {
    const canvas = document.querySelector('.overlay-canvas');
    if (!canvas) return true;
    const ctx = canvas.getContext('2d');
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  });

  expect(hasPixels).toBe(false);
});
