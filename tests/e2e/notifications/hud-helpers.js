/**
 * Shared helpers for the drawing-mode HUD specs.
 *
 * The toast is recorded only by the control-bar (main) window, so the specs
 * locate that window by its UI instead of trusting `firstWindow()`, whose
 * order depends on when each window's page attaches. When a test fails, the
 * diagnostics below print what each window saw so a CI-only failure leaves
 * evidence in the log.
 */
import fs from 'node:fs';
import path from 'node:path';

const MAIN_UI = '[data-testid="floatball-btn"], [data-testid="control-bar"]';
const LOG_LINES = 80;

/** Control-bar window: not the overlay or settings, and it renders the bar UI. */
export async function getControlBarWindow(app, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const win of app.windows()) {
      try {
        const url = win.url();
        if (url.includes('window=overlay') || url.includes('window=settings')) continue;
        await win.waitForLoadState('domcontentloaded', { timeout: 2000 });
        if (await win.evaluate((sel) => !!document.querySelector(sel), MAIN_UI)) return win;
      } catch {
        // Window closed or still loading; keep polling.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`control-bar window not found within ${timeoutMs}ms`);
}

/**
 * Tail of the newest main.log under the sandbox HOME the e2e helper gives every
 * app (electron-log resolves its file from the home directory). Reading the
 * file keeps the lines written during launch, before a test could listen.
 */
function mainLogTail(lines = LOG_LINES) {
  const home = process.env.OPENPEN_E2E_HOME;
  if (!home) return '(OPENPEN_E2E_HOME not set)';
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (e.name === 'main.log') found.push(full);
    }
  };
  walk(home, 0);
  if (found.length === 0) return `(no main.log under ${home})`;
  const newest = found.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
  const tail = fs.readFileSync(newest, 'utf-8').split('\n').filter(Boolean).slice(-lines).join('\n');
  return `${newest}\n${tail}`;
}

const WINDOW_PROBE = `({
  history: window.__OPENPEN_DEBUG__?.notifications?.recent?.() ?? null,
  hasNotificationHandle: typeof window.__OPENPEN_DEBUG__?.notifications?.recent === 'function',
  hasMainUi: !!document.querySelector(${JSON.stringify(MAIN_UI)}),
  overlayDrawingClass: document.querySelector('[data-testid="canvas-overlay"]')?.classList.contains('drawing-mode') ?? null,
})`;

/**
 * Print every window's URL, toast history and drawing-mode state, the window
 * the test used, and the main.log tail. Call only on failure; never throws.
 */
export async function printHudDiagnostics(testInfo, app, { usedWindow } = {}) {
  let windows = '(app not launched)';
  if (app) {
    try {
      // Bounded so a wedged app cannot stall the hook past its timeout (the
      // caller closes the app in a finally that must still get to run).
      windows = await Promise.race([app.evaluate(async ({ BrowserWindow }, probe) => {
        return Promise.all(BrowserWindow.getAllWindows().map(async (w) => {
          const entry = { url: w.isDestroyed() ? '(destroyed)' : w.webContents.getURL(), visible: !w.isDestroyed() && w.isVisible() };
          if (w.isDestroyed()) return entry;
          try {
            Object.assign(entry, await Promise.race([
              w.webContents.executeJavaScript(probe),
              new Promise((resolve) => setTimeout(() => resolve({ probe: 'timeout' }), 1500)),
            ]));
          } catch (err) {
            entry.probeError = String(err);
          }
          return entry;
        }));
      }, WINDOW_PROBE), new Promise((resolve) => setTimeout(() => resolve('timeout after 5000ms'), 5000))]);
    } catch (err) {
      windows = `unavailable: ${err}`;
    }
  }
  let logTail;
  try {
    logTail = mainLogTail();
  } catch (err) {
    logTail = `unavailable: ${err}`;
  }
  let usedUrl = '(none)';
  try {
    if (usedWindow) usedUrl = usedWindow.url();
  } catch (err) {
    usedUrl = `unavailable: ${err}`;
  }
  const report = [
    `[hud-diagnostics] ${testInfo.title}`,
    `used window: ${usedUrl}`,
    `windows: ${typeof windows === 'string' ? windows : JSON.stringify(windows, null, 2)}`,
    'main.log tail:',
    logTail,
  ].join('\n');
  console.log(report);
  try {
    await testInfo.attach('hud-diagnostics', { body: report, contentType: 'text/plain' });
  } catch {
    // The console copy above is the one CI keeps; a failed attach changes nothing.
  }
}

/** True when the test ended in a way it was not expected to (failed or timed out). */
export function failed(testInfo) {
  return testInfo.status !== testInfo.expectedStatus;
}
