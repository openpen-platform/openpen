/**
 * E2E: OpenPen's local MCP entry on real Electron (TASK-233).
 *
 * The describes run serially, each owning at most one app at a time. The apps
 * listen on a free port picked for this file (see mcp-port.js).
 */
import { test, expect } from '@playwright/test';
import http from 'node:http';
import net from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';
import { skipIfScreenLocked } from '../screen-lock.js';
import { mcpPortEnv, reserveMcpPort } from './mcp-port.js';

let PORT;
const mcpUrl = () => `http://127.0.0.1:${PORT}/mcp`;
const KEY = 'opk_e2etestkey0123456789abcdefghijk';
const MCP_ON = { mcp: { enabled: true, apiKey: KEY, readOnly: false, exposeAll: true, enabledPlugins: [] } };

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => { PORT = await reserveMcpPort(); });

// ── helpers ──────────────────────────────────────────────────────────────────

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

const getOverlayWindow = () => findWindow(async (win) => win.url().includes('window=overlay'));

async function expandBar(win) {
  const bar = win.getByTestId('control-bar');
  if (!(await bar.isVisible().catch(() => false))) {
    await win.getByTestId('floatball-btn').click();
    await win.waitForTimeout(400);
  }
  await expect(bar).toBeVisible({ timeout: 5000 });
}

async function openSettingsMcpTab(mainWin) {
  const winPromise = electronApp.waitForEvent('window', { timeout: 10000 });
  await mainWin.evaluate(() => window.openPenApi?.openSettingsWindow());
  const settingsWin = await winPromise;
  await settingsWin.waitForLoadState('domcontentloaded');
  await settingsWin.getByTestId('settings-window').waitFor({ timeout: 10000 });
  await settingsWin.getByTestId('tab-mcp').click();
  await settingsWin.getByTestId('mcp-tab').waitFor({ timeout: 5000 });
  return settingsWin;
}

async function connect(key = KEY) {
  const client = new Client({ name: 'openpen-e2e', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(mcpUrl()), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
  });
  await client.connect(transport);
  return client;
}

function textOf(result) {
  return result.content.find((c) => c.type === 'text')?.text ?? '';
}

async function call(client, name, args = {}) {
  const result = await client.callTool({ name: `openpen__${name}`, arguments: args });
  return result;
}

async function callJson(client, name, args = {}) {
  const result = await call(client, name, args);
  expect(result.isError, textOf(result)).toBeFalsy();
  return JSON.parse(textOf(result));
}

/** Raw HTTP POST so Host / Origin / Authorization can be set freely. */
function rawPost({ headers = {}, host } = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
    const req = http.request(
      { host: '127.0.0.1', port: PORT, path: '/mcp', method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          'Content-Length': Buffer.byteLength(body),
          ...(host ? { Host: host } : {}),
          ...headers,
        } },
      (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); },
    );
    req.on('error', reject);
    req.end(body);
  });
}

function portOpen() {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port: PORT });
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });
}

/** Decode a base64 PNG in the page and report whether any pixel near (x,y) is strongly red. */
async function hasRedNear(page, base64, x, y, radius = 6) {
  return page.evaluate(async ({ base64, x, y, radius }) => {
    const bin = atob(base64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const x0 = Math.max(0, x - radius), y0 = Math.max(0, y - radius);
    const w = Math.min(bmp.width - x0, radius * 2 + 1), h = Math.min(bmp.height - y0, radius * 2 + 1);
    const d = ctx.getImageData(x0, y0, w, h).data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] > 200 && d[i + 1] < 80 && d[i + 2] < 80) return true;
    }
    return false;
  }, { base64, x, y, radius });
}

async function shot(client, args = {}) {
  const r = await call(client, 'screenshot', args);
  expect(r.isError, textOf(r)).toBeFalsy();
  const img = r.content.find((c) => c.type === 'image');
  const meta = JSON.parse(textOf(r));
  return { data: img.data, ...meta };
}

async function annotationCount(client, args = {}) {
  return (await callJson(client, 'list_annotations', args)).annotations.length;
}

// ── fresh settings: AC-2 (off), AC-20 ───────────────────────────────────────

test.describe('MCP off by default', () => {
  attachElectronErrorDetection(() => electronApp);

  test.beforeAll(async () => { electronApp = await launchElectronApp(mcpPortEnv(PORT)); });
  test.afterAll(async () => { await electronApp?.close(); electronApp = undefined; });

  test('AC-2: with the switch off nothing listens on the MCP port', async () => {
    await getMainWindow();
    expect(await portOpen()).toBe(false);
    await expect(connect()).rejects.toThrow();
  });

  test('AC-20: on a fresh install the MCP switch in settings is off', async () => {
    const mainWin = await getMainWindow();
    const settingsWin = await openSettingsMcpTab(mainWin);
    await expect(settingsWin.getByTestId('mcp-enable-toggle')).not.toBeChecked();
  });
});

// ── MCP on: security, tools, settings ───────────────────────────────────────

test.describe('MCP on', () => {
  attachElectronErrorDetection(() => electronApp);

  test.beforeAll(async () => { electronApp = await launchElectronApp({ seedConfig: MCP_ON, ...mcpPortEnv(PORT) }); });
  test.afterAll(async () => { await electronApp?.close(); electronApp = undefined; });

  test.beforeEach(async () => {
    // Start every test from an empty canvas, drawing mode off.
    const main = await getMainWindow();
    await main.evaluate(() => {
      window.openPenApi?.clearCanvas();
      window.openPenApi?.setDrawingMode(false);
    });
  });

  test('AC-2: with the switch on a client with the key can list tools', async () => {
    await getMainWindow();
    await expect.poll(portOpen, { timeout: 15000 }).toBe(true);
    const client = await connect();
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain('openpen__get_state');
    await client.close();
  });

  test('AC-3: a request without a key or with a wrong key is refused', async () => {
    await getMainWindow();
    expect(await rawPost()).toBe(401);
    expect(await rawPost({ headers: { Authorization: 'Bearer opk_wrong' } })).toBe(401);
  });

  test('AC-4: a browser Origin or a non-local Host is refused even with the right key', async () => {
    await getMainWindow();
    const auth = { Authorization: `Bearer ${KEY}` };
    expect(await rawPost({ headers: { ...auth, Origin: 'https://evil.example' } })).toBe(403);
    expect(await rawPost({ headers: auth, host: 'evil.example' })).toBe(403);
  });

  test('AC-6: rect drawn at screenshot pixels shows up there in listing and screenshot', async () => {
    skipIfScreenLocked(test);
    const main = await getMainWindow();
    const client = await connect();
    const { displays } = await callJson(client, 'get_state');
    const d = displays.find((x) => x.isCursorDisplay) ?? displays[0];
    const rect = { x: 300, y: 200, width: 400, height: 240 };
    const before = await shot(client, { displayId: d.id });
    await callJson(client, 'draw_rect', { ...rect, color: '#ff0000', lineWidth: 6, displayId: d.id });
    const { annotations } = await callJson(client, 'list_annotations', { displayId: d.id });
    expect(annotations).toHaveLength(1);
    expect(annotations[0].kind).toBe('rect');
    const b = annotations[0].bounds;
    expect(Math.abs(b.x - rect.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(b.y - rect.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(b.width - rect.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(b.height - rect.height)).toBeLessThanOrEqual(2);
    // The screenshot has red on the rect's top edge now, and did not before.
    const after = await shot(client, { displayId: d.id });
    const px = rect.x + rect.width / 2, py = rect.y;
    expect(await hasRedNear(main, before.data, px, py)).toBe(false);
    expect(await hasRedNear(main, after.data, px, py)).toBe(true);
    await client.close();
  });

  test('AC-6: all five shapes can be drawn and are listed with their kind', async () => {
    await getMainWindow();
    const client = await connect();
    await callJson(client, 'draw_freehand', { points: [{ x: 50, y: 50 }, { x: 120, y: 90 }, { x: 200, y: 60 }] });
    await callJson(client, 'draw_line', { x1: 50, y1: 300, x2: 400, y2: 320 });
    await callJson(client, 'draw_rect', { x: 500, y: 300, width: 100, height: 80 });
    await callJson(client, 'draw_ellipse', { x: 700, y: 300, width: 120, height: 80 });
    await callJson(client, 'draw_highlighter', { points: [{ x: 50, y: 500 }, { x: 300, y: 500 }] });
    const { annotations } = await callJson(client, 'list_annotations');
    expect(annotations.map((a) => a.kind).sort()).toEqual(['ellipse', 'freehand', 'highlighter', 'line', 'rect']);
    await client.close();
  });

  test('AC-7: a drawing aimed at one display appears on that display only', async () => {
    const client = await connect();
    const { displays } = await callJson(client, 'get_state');
    test.skip(displays.length < 2, 'Needs two displays; this machine reports a single display.');
    const [first, second] = displays;
    await callJson(client, 'draw_rect', { x: 100, y: 100, width: 200, height: 100, displayId: second.id });
    expect(await annotationCount(client, { displayId: second.id })).toBe(1);
    expect(await annotationCount(client, { displayId: first.id })).toBe(0);
    await client.close();
  });

  test('AC-8: outside drawing mode a drawn stroke is visible on the screen', async () => {
    skipIfScreenLocked(test);
    const main = await getMainWindow();
    const client = await connect();
    const state = await callJson(client, 'get_state');
    expect(state.drawingMode).toBe(false);
    const d = state.displays.find((x) => x.isCursorDisplay) ?? state.displays[0];
    const before = await shot(client, { displayId: d.id });
    await callJson(client, 'draw_line', { x1: 400, y1: 600, x2: 800, y2: 600, color: '#ff0000', lineWidth: 8, displayId: d.id });
    const after = await shot(client, { displayId: d.id });
    expect(await hasRedNear(main, before.data, 600, 600)).toBe(false);
    expect(await hasRedNear(main, after.data, 600, 600)).toBe(true);
    await client.close();
  });

  test('AC-9: listing returns id, kind, bounds and source plugin per annotation', async () => {
    await getMainWindow();
    const client = await connect();
    await callJson(client, 'draw_rect', { x: 100, y: 100, width: 50, height: 50 });
    const { annotations } = await callJson(client, 'list_annotations');
    expect(annotations).toHaveLength(1);
    const a = annotations[0];
    expect(typeof a.id).toBe('string');
    expect(a.kind).toBe('rect');
    expect(a.bounds).toEqual(expect.objectContaining({ x: expect.any(Number), y: expect.any(Number), width: expect.any(Number), height: expect.any(Number) }));
    expect(a.sourcePlugin).toBe('@openpen/shape');
    await client.close();
  });

  test('AC-10: deleting one annotation by id leaves the others', async () => {
    await getMainWindow();
    const client = await connect();
    await callJson(client, 'draw_rect', { x: 100, y: 100, width: 50, height: 50 });
    await callJson(client, 'draw_rect', { x: 300, y: 100, width: 50, height: 50 });
    const { annotations } = await callJson(client, 'list_annotations');
    const [keep, drop] = annotations;
    await callJson(client, 'delete_annotation', { id: drop.id });
    const after = (await callJson(client, 'list_annotations')).annotations;
    expect(after.map((a) => a.id)).toEqual([keep.id]);
    await client.close();
  });

  test('AC-11: clear, undo and redo through MCP match the manual operations', async () => {
    const main = await getMainWindow();
    const client = await connect();
    const counts = async () => annotationCount(client);
    const run = async (steps) => {
      await callJson(client, 'draw_rect', { x: 100, y: 100, width: 50, height: 50 });
      await callJson(client, 'draw_rect', { x: 300, y: 100, width: 50, height: 50 });
      const seen = [await counts()];
      for (const step of steps) { await step(); await main.waitForTimeout(250); seen.push(await counts()); }
      return seen;
    };
    const viaMcp = await run([
      () => call(client, 'clear_canvas'), () => call(client, 'undo'), () => call(client, 'redo'),
    ]);
    await main.evaluate(() => window.openPenApi?.clearCanvas());
    await main.waitForTimeout(250);
    const viaManual = await run([
      () => main.evaluate(() => window.openPenApi?.clearCanvas()),
      () => main.evaluate(() => window.openPenApi?.triggerUndo()),
      () => main.evaluate(() => window.openPenApi?.triggerRedo()),
    ]);
    expect(viaMcp).toEqual([2, 0, 2, 0]);
    expect(viaManual).toEqual(viaMcp);
    await client.close();
  });

  test('AC-12: set_drawing_mode and set_tool change the state and the control bar follows', async () => {
    const main = await getMainWindow();
    await expandBar(main);
    const client = await connect();
    const initial = await callJson(client, 'get_state');
    expect(Array.isArray(initial.displays)).toBe(true);
    expect(initial.displays.length).toBeGreaterThan(0);

    await callJson(client, 'set_drawing_mode', { enabled: true });
    await callJson(client, 'set_tool', { tool: 'line' });
    const state = await callJson(client, 'get_state');
    expect(state.drawingMode).toBe(true);
    expect(state.tool).toBe('line');
    await expect(main.getByTestId('controlbar-draw-mode-badge')).toBeVisible({ timeout: 5000 });
    await expect(main.getByTestId('controlbar-line-btn')).toHaveClass(/active/, { timeout: 5000 });
    await callJson(client, 'set_drawing_mode', { enabled: false });
    await client.close();
  });

  test('AC-13: the screenshot is a PNG of the display that includes drawn annotations', async () => {
    skipIfScreenLocked(test);
    const main = await getMainWindow();
    const client = await connect();
    const state = await callJson(client, 'get_state');
    const d = state.displays.find((x) => x.isCursorDisplay) ?? state.displays[0];
    await callJson(client, 'draw_rect', { x: 200, y: 200, width: 300, height: 200, color: '#ff0000', lineWidth: 8, displayId: d.id });
    const s = await shot(client, { displayId: d.id });
    expect(s.displayId).toBe(d.id);
    expect(s.width).toBe(d.pixelWidth);
    expect(s.height).toBe(d.pixelHeight);
    expect(await hasRedNear(main, s.data, 350, 200)).toBe(true);
    await client.close();
  });

  test('AC-5: regenerating the key in settings makes the old key fail at once', async () => {
    const main = await getMainWindow();
    const old = await connect();
    await old.close();
    const settingsWin = await openSettingsMcpTab(main);
    await settingsWin.getByTestId('mcp-regenerate-btn').click();
    await settingsWin.getByTestId('mcp-regen-confirm').click();
    await expect.poll(() => rawPost({ headers: { Authorization: `Bearer ${KEY}` } }), { timeout: 10000 }).toBe(401);
    await expect(connect(KEY)).rejects.toThrow();
  });
});
