/**
 * E2E: the MCP port is a setting. Saving a new port moves the
 * server there; a port another program holds is reported with that port and
 * the server is not moved anywhere else.
 *
 * `OPENPEN_MCP_PORT` is cleared so the saved setting decides the port. Each
 * test picks free ports from the OS, so nothing depends on the default port.
 */
import { test, expect } from '@playwright/test';
import net from 'node:net';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { attachElectronErrorDetection } from '../electron-errors.js';
import { launchElectronApp } from '../launch.js';
import { portInUse, reserveMcpPort } from './mcp-port.js';

test.describe.configure({ mode: 'serial' });

const KEY = 'opk_e2eportkey0123456789abcdefghijk';
const mcpOn = (port) => ({ mcp: { enabled: true, apiKey: KEY, readOnly: false, exposeAll: true, enabledPlugins: [], port } });

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

async function openSettingsMcpTab() {
  const mainWin = await getMainWindow();
  const winPromise = electronApp.waitForEvent('window', { timeout: 10000 });
  await mainWin.evaluate(() => window.openPenApi?.openSettingsWindow());
  const win = await winPromise;
  await win.waitForLoadState('domcontentloaded');
  await win.getByTestId('settings-window').waitFor({ timeout: 10000 });
  await win.getByTestId('tab-mcp').click();
  await win.getByTestId('mcp-tab').waitFor({ timeout: 5000 });
  return win;
}

async function setPortAndSave(win, port) {
  const input = win.getByTestId('mcp-port-input');
  await input.fill(String(port));
  await expect(win.getByTestId('mcp-endpoint')).toHaveText(`http://127.0.0.1:${port}/mcp`);
  const closed = win.waitForEvent('close', { timeout: 15000 });
  await win.getByTestId('save-btn').click();
  await closed;
}

async function listToolsAt(port) {
  const client = new Client({ name: 'openpen-e2e', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${KEY}` } },
  });
  await client.connect(transport);
  const { tools } = await client.listTools();
  await client.close();
  return tools.map((t) => t.name);
}

test.describe('MCP port setting', () => {
  attachElectronErrorDetection(() => electronApp);
  test.afterEach(async () => { await electronApp?.close(); electronApp = undefined; });

  test('saving a new port moves the server there and the shown address follows', async () => {
    const oldPort = await reserveMcpPort();
    const newPort = await reserveMcpPort();
    electronApp = await launchElectronApp({ seedConfig: mcpOn(oldPort), env: { OPENPEN_MCP_PORT: '' } });
    await getMainWindow();
    await expect.poll(() => portInUse(oldPort), { timeout: 15000 }).toBe(true);

    await setPortAndSave(await openSettingsMcpTab(), newPort);

    await expect(async () => {
      expect(await listToolsAt(newPort)).toContain('openpen__get_state');
    }).toPass({ timeout: 15000 });
    expect(await portInUse(oldPort)).toBe(false);

    const again = await openSettingsMcpTab();
    await expect(again.getByTestId('mcp-port-input')).toHaveValue(String(newPort));
    await expect(again.getByTestId('mcp-endpoint')).toHaveText(`http://127.0.0.1:${newPort}/mcp`);
    await expect(again.getByTestId('mcp-hero-sub')).toContainText(`127.0.0.1:${newPort}/mcp`);
  });

  test('a port another program holds is reported with that port and the server does not move', async () => {
    const oldPort = await reserveMcpPort();
    const blocker = net.createServer();
    await new Promise((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const busyPort = /** @type {net.AddressInfo} */ (blocker.address()).port;
    try {
      electronApp = await launchElectronApp({ seedConfig: mcpOn(oldPort), env: { OPENPEN_MCP_PORT: '' } });
      await getMainWindow();
      await expect.poll(() => portInUse(oldPort), { timeout: 15000 }).toBe(true);

      await setPortAndSave(await openSettingsMcpTab(), busyPort);

      const win = await openSettingsMcpTab();
      const banner = win.getByTestId('mcp-error-banner');
      await expect(banner).toContainText(String(busyPort), { timeout: 10000 });
      await expect(banner).not.toContainText('17639');
      await expect(win.getByTestId('mcp-port-input')).toHaveValue(String(busyPort));
      await expect(win.getByTestId('mcp-port-input')).toHaveAttribute('aria-invalid', 'true');
      const status = await win.evaluate(() => window.openPenApi.getMcpStatus());
      expect(status).toMatchObject({ running: false, error: 'port_in_use', port: busyPort });
      // No automatic switch: neither the old port nor any other one is served.
      expect(await portInUse(oldPort)).toBe(false);
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });
});
