/**
 * E2E: the MCP endpoint URL and key appear as soon as the switch is turned on,
 * without pressing Save or reopening settings (TASK-233, AC-20 and usage flow).
 *
 * The MCP port is fixed (17639), so the tests run serially and own one app at a time.
 */
import { test, expect } from '@playwright/test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';

test.describe.configure({ mode: 'serial' });

let electronApp;
let settingsWin;
let endpoint = '';
let apiKey = '';

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

async function openSettingsMcpTab(mainWin) {
  const winPromise = electronApp.waitForEvent('window', { timeout: 10000 });
  await mainWin.evaluate(() => window.openPenApi?.openSettingsWindow());
  const win = await winPromise;
  await win.waitForLoadState('domcontentloaded');
  await win.getByTestId('settings-window').waitFor({ timeout: 10000 });
  await win.getByTestId('tab-mcp').click();
  await win.getByTestId('mcp-tab').waitFor({ timeout: 5000 });
  return win;
}

test.describe('MCP key shown on enable', () => {
  attachElectronErrorDetection(() => electronApp);

  // Fresh install: no mcp seed.
  test.beforeAll(async () => { electronApp = await launchElectronApp(); });
  test.afterAll(async () => { await electronApp?.close(); electronApp = undefined; });

  test('AC-20: turning the switch on shows the URL and a key on the same page, no Save', async () => {
    const main = await getMainWindow();
    settingsWin = await openSettingsMcpTab(main);
    const toggle = settingsWin.getByTestId('mcp-enable-toggle');
    await expect(toggle).not.toBeChecked();

    await toggle.click();
    await expect(toggle).toBeChecked();

    const endpointEl = settingsWin.getByTestId('mcp-endpoint');
    await expect(endpointEl).toContainText('127.0.0.1', { timeout: 10000 });
    await expect(endpointEl).toContainText('/mcp');
    endpoint = (await endpointEl.innerText()).trim();

    // Masked by default: non-empty, and not the plain key yet.
    const keyEl = settingsWin.getByTestId('mcp-key');
    await expect(keyEl).not.toHaveText('', { timeout: 10000 });
    await expect(keyEl).toContainText('••••');

    await settingsWin.getByTestId('mcp-reveal-btn').click();
    await expect(keyEl).not.toContainText('••••');
    await expect(keyEl).toContainText(/^\s*opk_/);
    apiKey = (await keyEl.innerText()).trim();
    expect(apiKey.startsWith('opk_')).toBe(true);
  });

  test('usage flow: after Save, a client using the shown key connects and lists tools', async () => {
    expect(endpoint).toContain('/mcp');
    expect(apiKey).toMatch(/^opk_/);

    await settingsWin.getByTestId('save-btn').click();

    const client = new Client({ name: 'openpen-e2e', version: '0.0.0' });
    const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
      requestInit: { headers: { Authorization: `Bearer ${apiKey}` } },
    });
    // connect() performs the MCP initialize handshake.
    await expect(async () => {
      await client.connect(transport);
    }).toPass({ timeout: 15000 });
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name)).toContain('openpen__get_state');
    await client.close();
  });
});
