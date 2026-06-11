/**
 * Prod smoke — guards the dev/prod parity contract.
 *
 * Every other spec runs against the Vite dev server, so anything that ONLY
 * the production pipeline produces (importmap resolution, the rollup-driven
 * SFC compile in scripts/build-runtime.mjs, asar packaging quirks) was
 * historically untested. The original symptoms that prompted this gate:
 *
 *   - AppSlider thumb invisible (0×0) — `<style scoped>` dropped on the floor
 *   - AppPopover never opened — wrapper styles missing → trigger un-clickable
 *   - Settings buttons fell back to UA defaults — AppSegmented/AppTabs naked
 *
 * All three traced to build-runtime.mjs ignoring `descriptor.styles`. This
 * spec asserts the high-signal computed-style facts that would have caught
 * that regression: the slider thumb has positive size + non-default fill,
 * and the popover trigger reaches `data-state="open"` after a click.
 *
 * MUST run after `npm run build` (launchElectronAppProd asserts dist/).
 */
import { test, expect } from '@playwright/test';
import { attachElectronErrorDetection } from './electron-errors.js';
import { launchElectronAppProd } from './launch.js';

let electronApp;
attachElectronErrorDetection(() => electronApp);

// Standard-model gate (clicks the float-ball, expects the persistent fullscreen
// overlay). launchElectronAppProd forces the standard path on Linux, so this
// runs for REAL on a Wayland host too (via XWayland) — no false-green skip, and
// no Windows-cmd-incompatible env prefix on the npm script.

test.beforeAll(async () => {
  electronApp = await launchElectronAppProd();
});

test.afterAll(async () => {
  await electronApp?.close();
});

async function getMainWindow() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const win of electronApp.windows()) {
      try {
        await win.waitForLoadState('domcontentloaded', { timeout: 2000 });
        const url = win.url();
        if (url.includes('window=overlay') || url.includes('window=settings')) continue;
        // Either the collapsed ball OR the expanded bar identifies the main
        // window — Vue's Transition unmounts whichever isn't active.
        const hasMainUi = await win.evaluate(
          () => !!document.querySelector('[data-testid="floatball-btn"], [data-testid="control-bar"]')
        );
        if (hasMainUi) return win;
      } catch { /* keep polling */ }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Main window not ready within 30s');
}

test('AppSlider scoped styles are inlined (prod)', async () => {
  const win = await getMainWindow();

  // Expand the bar so the inline stroke-width slider mounts.
  await win.getByTestId('floatball-btn').click();
  await win.waitForTimeout(400);

  // AppSlider thumb spec (AppSlider.vue): 14×14, background #fff.
  // If `<style scoped>` was dropped, both dimensions collapse to 0 and the
  // background falls back to the UA default (transparent).
  const thumb = await win.evaluate(() => {
    const el = document.querySelector('[data-testid="app-slider-thumb"]');
    if (!el) return { found: false };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { found: true, w: r.width, h: r.height, bg: cs.backgroundColor };
  });
  expect(thumb.found, 'AppSlider thumb element missing — wrapper failed to mount').toBe(true);
  expect(thumb.w, 'thumb width — scoped <style> not inlined?').toBeGreaterThanOrEqual(8);
  expect(thumb.h, 'thumb height — scoped <style> not inlined?').toBeGreaterThanOrEqual(8);
  expect(thumb.bg, 'thumb background — scoped <style> not inlined?').not.toBe('rgba(0, 0, 0, 0)');
});

test('AppPopover unscoped styles + open lifecycle (prod)', async () => {
  const win = await getMainWindow();
  // Bar should already be expanded from the previous test, but be defensive.
  const expanded = await win.getByTestId('control-bar').isVisible().catch(() => false);
  if (!expanded) {
    await win.getByTestId('floatball-btn').click();
    await win.waitForTimeout(400);
  }

  const colorBtn = win.getByTestId('controlbar-color-btn');
  await expect(colorBtn).toBeVisible();
  await colorBtn.click();

  // AppPopover.vue applies `.openpen-popover-content` (unscoped, see file
  // header comment) and reka-ui flips `data-state` to "open" on mount. The
  // content is portalled into wrapperEl, so query from document scope. If
  // the SFC's <style> block was dropped, the element still mounts but
  // background/padding/shadow all fall back to UA defaults.
  await win.waitForFunction(
    () => !!document.querySelector('[data-testid="controlbar-popover"][data-state="open"]'),
    { timeout: 5000 }
  );

  const probe = await win.evaluate(() => {
    const el = document.querySelector('[data-testid="controlbar-popover"]');
    const cs = getComputedStyle(el);
    return {
      bg: cs.backgroundColor,
      padding: cs.padding,
      borderRadius: cs.borderRadius,
    };
  });
  expect(probe.bg, 'background — unscoped <style> not inlined?').not.toBe('rgba(0, 0, 0, 0)');
  expect(probe.padding, 'padding — unscoped <style> not inlined?').not.toBe('0px');
});

test('main window is visible after launch (prod)', async () => {
  // Guards the show:false + CONTENT_READY guard introduced for Windows DWM
  // paint-timing issues. The window must self-reveal once the renderer reports
  // CONTENT_READY; if it never fires, the 3 s fallback takes over — either way
  // the window must be visible well within the 30 s getMainWindow deadline.
  const win = await getMainWindow();

  // Verify the Electron-side isVisible() state via IPC — Playwright's
  // win.isVisible() reflects DOM visibility, not the OS window show-state.
  const isVisible = await electronApp.evaluate(({ BrowserWindow }) => {
    const wins = BrowserWindow.getAllWindows();
    const mainWin = wins.find((w) => {
      try {
        const url = w.webContents.getURL();
        return !url.includes('window=overlay') && !url.includes('window=settings');
      } catch { return false; }
    });
    return mainWin ? mainWin.isVisible() : false;
  });

  expect(isVisible, 'main window must be visible after CONTENT_READY handshake').toBe(true);
});
