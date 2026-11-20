/**
 * E2E: colour notations (rgb / hsl / rgba) drawn through the MCP endpoint (TASK-233, AC-21).
 * Port 17639 is fixed, so this file owns its own app and runs serially.
 */
import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';

const PORT = 17639;
const URL_MCP = `http://127.0.0.1:${PORT}/mcp`;
const KEY = 'opk_e2ecolorkey0123456789abcdefghi';
const MCP_ON = { mcp: { enabled: true, apiKey: KEY, readOnly: false, exposeAll: true, enabledPlugins: [] } };

test.describe.configure({ mode: 'serial' });

let electronApp;

async function findWindow(predicate, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const win of electronApp.windows()) {
      try {
        await win.waitForLoadState('domcontentloaded', { timeout: 3000 });
        if (await predicate(win)) return win;
      } catch {
        // Window still starting or closed.
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('window not found');
}

const getMainWindow = () =>
  findWindow(async (win) => {
    const url = win.url();
    if (url.includes('window=overlay') || url.includes('window=settings')) return false;
    return win.evaluate(() => !!document.querySelector('[data-testid="floatball-btn"], [data-testid="control-bar"]'));
  });

async function connect() {
  const client = new Client({ name: 'openpen-e2e-colors', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(URL_MCP), {
    requestInit: { headers: { Authorization: `Bearer ${KEY}` } },
  });
  await client.connect(transport);
  return client;
}

const textOf = (r) => r.content.find((c) => c.type === 'text')?.text ?? '';

async function call(client, name, args = {}) {
  return client.callTool({ name: `openpen__${name}`, arguments: args });
}

async function callJson(client, name, args = {}) {
  const r = await call(client, name, args);
  expect(r.isError, textOf(r)).toBeFalsy();
  return JSON.parse(textOf(r));
}

async function shot(client, args = {}) {
  const r = await call(client, 'screenshot', args);
  expect(r.isError, textOf(r)).toBeFalsy();
  const img = r.content.find((c) => c.type === 'image');
  return { data: img.data, ...JSON.parse(textOf(r)) };
}

/** Average RGB of the (2r+1)^2 block around (x,y) of a base64 PNG, plus the closest pixel's distance to `target`. */
async function samplePixels(page, base64, x, y, target, radius = 3) {
  return page.evaluate(async ({ base64, x, y, target, radius }) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const x0 = Math.max(0, x - radius), y0 = Math.max(0, y - radius);
    const w = Math.min(bmp.width - x0, radius * 2 + 1), h = Math.min(bmp.height - y0, radius * 2 + 1);
    const d = ctx.getImageData(x0, y0, w, h).data;
    let r = 0, g = 0, b = 0, n = 0, best = Infinity;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
      if (target) best = Math.min(best, Math.max(Math.abs(d[i] - target[0]), Math.abs(d[i + 1] - target[1]), Math.abs(d[i + 2] - target[2])));
    }
    return { avg: [r / n, g / n, b / n], best };
  }, { base64, x, y, target, radius });
}

const maxDiff = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

test.describe('AC-21 colour notations drawn through MCP', () => {
  attachElectronErrorDetection(() => electronApp);

  test.beforeAll(async () => { electronApp = await launchElectronApp({ seedConfig: MCP_ON }); });
  test.afterAll(async () => { await electronApp?.close(); electronApp = undefined; });

  test.beforeEach(async () => {
    const main = await getMainWindow();
    await main.evaluate(() => {
      window.openPenApi?.clearCanvas();
      window.openPenApi?.setDrawingMode(false);
    });
  });

  test('AC-21: rgb() and hsl() colours are drawn as the blue / green they name', async () => {
    const main = await getMainWindow();
    const client = await connect();
    const state = await callJson(client, 'get_state');
    const d = state.displays.find((x) => x.isCursorDisplay) ?? state.displays[0];
    const W = d.pixelWidth, H = d.pixelHeight;
    const rectAt = (fx) => ({ x: Math.round(W * fx), y: Math.round(H * 0.2), width: Math.round(W * 0.2), height: Math.round(H * 0.2) });
    const cases = [
      { color: 'rgb(0,0,255)', target: [0, 0, 255], rect: rectAt(0.1) },
      { color: 'hsl(120,100%,50%)', target: [0, 255, 0], rect: rectAt(0.5) },
    ];
    try {
      for (const c of cases) {
        const res = await call(client, 'draw_rect', { ...c.rect, color: c.color, lineWidth: 10, displayId: d.id });
        expect(res.isError, `${c.color}: ${textOf(res)}`).toBeFalsy();
      }
      const s = await shot(client, { displayId: d.id });
      for (const c of cases) {
        // 3x3 block (radius 1) sits fully inside the 10px line centred on the top edge.
        const px = c.rect.x + Math.round(c.rect.width / 2), py = c.rect.y;
        const { avg } = await samplePixels(main, s.data, px, py, null, 1);
        expect(maxDiff(avg, c.target), `${c.color} on rect top edge, avg ${avg}`).toBeLessThanOrEqual(40);
      }
    } finally {
      await client.close();
    }
  });

  test('AC-21: rgba() with alpha is drawn translucent, not as pure red and not as the background', async () => {
    const main = await getMainWindow();
    const client = await connect();
    const state = await callJson(client, 'get_state');
    const d = state.displays.find((x) => x.isCursorDisplay) ?? state.displays[0];
    const W = d.pixelWidth, H = d.pixelHeight;
    const y = Math.round(H * 0.6);
    const x1 = Math.round(W * 0.15), x2 = Math.round(W * 0.45), mid = Math.round(W * 0.3);
    try {
      // Drawing mode on before the baseline so mode switching alone cannot change the pixels.
      const mode = await call(client, 'set_drawing_mode', { enabled: true });
      expect(mode.isError, textOf(mode)).toBeFalsy();
      const before = await shot(client, { displayId: d.id });
      const res = await call(client, 'draw_line', { x1, y1: y, x2, y2: y, color: 'rgba(255,0,0,0.4)', lineWidth: 40, displayId: d.id });
      expect(res.isError, textOf(res)).toBeFalsy();
      const after = await shot(client, { displayId: d.id });
      const bg = await samplePixels(main, before.data, mid, y, null, 2);
      const drawn = await samplePixels(main, after.data, mid, y, null, 2);
      const expected = [0, 1, 2].map((i) => 0.4 * [255, 0, 0][i] + 0.6 * bg.avg[i]);
      expect(maxDiff(drawn.avg, expected), `blend of 40% red over bg ${bg.avg}, drawn ${drawn.avg}`).toBeLessThanOrEqual(30);
      expect(maxDiff(drawn.avg, [255, 0, 0]), 'differs from pure red').toBeGreaterThan(30);
    } finally {
      await client.close();
    }
  });
});
