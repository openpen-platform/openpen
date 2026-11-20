/**
 * McpServerManager — owns the local MCP endpoint's lifecycle and wires it to
 * the rest of the main process.
 *
 * - The switch is off by default; with it off nothing listens (AC-2).
 * - A Save that touches `mcp` goes through `setMcpSettingsApplier`: the server
 *   starts / stops before the value is persisted, and a failed start leaves
 *   `enabled` unsaved. The first enable generates the API key.
 * - Regenerating the key is immediate: it persists and the HTTP server reads
 *   the new value on its very next request.
 * - Tool calls reach the canvas through the target display's overlay renderer
 *   (strokes live per overlay); main sends a command and waits for the reply.
 */

import crypto from 'node:crypto';
import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { z } from 'zod';
import { MCP, OVERLAY } from './ipc-channels.js';
import { log } from './logger.js';
import { onValidated } from './ipc-validation.js';
import { getSetting, updateSettings, setMcpSettingsApplier } from './settings-store.js';
import {
  applyToolConfigFromMain,
  getActiveToolConfig,
  getDrawingMode,
  getOverlayWindowForDisplay,
  setDrawingMode,
} from './window-manager.js';
import { MCP_PORT } from '../shared/mcp-constants.js';
import { createMcpHttpServer } from './mcp/http-server.js';
import { createBuiltinTools } from './mcp/tools.js';
import { generateApiKey } from './mcp/api-key.js';

/** How long a command may wait for the overlay (including its creation on Wayland). */
const OVERLAY_READY_TIMEOUT_MS = 8000;
const COMMAND_TIMEOUT_MS = 10_000;
const POLL_MS = 50;
/** One readiness ping: a renderer that has not subscribed yet never answers. */
const PING_TIMEOUT_MS = 300;

const commandResultSchema = z.object({
  requestId: z.string().min(1).max(100),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().max(2000).optional(),
});

/** Ids of the built-in drawing tools (`canvas.tools` contributions of the built-in modules). */
const BUILTIN_TOOL_IDS = ['freehand', 'line', 'shape', 'highlighter-pen', 'eraser', 'stroke-eraser'];

function knownToolIds() {
  const active = getActiveToolConfig()?.tool;
  return active && !BUILTIN_TOOL_IDS.includes(active) ? [...BUILTIN_TOOL_IDS, active] : [...BUILTIN_TOOL_IDS];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const CAPTURE_ERRORS = {
  'permission-denied': 'Screen Recording permission is not granted to OpenPen. Ask the user to enable it in System Settings > Privacy & Security > Screen Recording.',
  unsupported: 'Screenshots are not supported in this desktop session (Wayland).',
  busy: 'Another screenshot is in progress. Retry in a moment.',
  failed: 'The screen could not be captured.',
};

/**
 * Where the overlay's top-left sits inside the display's screenshot, in screenshot
 * pixels. The overlay covers `workArea` (below the macOS menu bar, beside the
 * taskbar) while the screenshot is the whole display.
 */
function overlayOffset(displayId) {
  const d = screen.getAllDisplays().find((x) => x.id === displayId);
  if (!d) return { x: 0, y: 0 };
  return {
    x: Math.round((d.workArea.x - d.bounds.x) * d.scaleFactor),
    y: Math.round((d.workArea.y - d.bounds.y) * d.scaleFactor),
  };
}

/** Pixel size of a display as `desktopCapturer` reports it (screenshot size). */
function pixelSize(display) {
  return {
    pixelWidth: Math.round(display.size.width * display.scaleFactor),
    pixelHeight: Math.round(display.size.height * display.scaleFactor),
  };
}

/**
 * @param {{ captureDisplayImage: (opts?: { includeAnnotations?: boolean, displayId?: number }) => Promise<any> }} deps
 */
export function initMcpServerManager({ captureDisplayImage }) {
  // `OPENPEN_MCP_PORT` lets parallel e2e runs avoid the fixed port (0 = any free port).
  const envPort = process.env.OPENPEN_MCP_PORT;
  const port = envPort !== undefined && envPort !== '' && Number.isInteger(Number(envPort)) ? Number(envPort) : MCP_PORT;

  /** The persisted `mcp` settings; the HTTP server reads this on every request. */
  let current = { ...getSetting('mcp'), enabledPlugins: [...getSetting('mcp').enabledPlugins] };

  /** @type {Map<string, { resolve: (v: any) => void, reject: (e: Error) => void, sender: Electron.WebContents, timer: NodeJS.Timeout }>} */
  const pending = new Map();

  /** Send one command to an overlay renderer and wait for its reply. */
  function sendOverlayCommand(wc, command, timeoutMs) {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error('the overlay did not answer in time'));
      }, timeoutMs);
      pending.set(requestId, { resolve, reject, sender: wc, timer });
      wc.send(MCP.COMMAND, { requestId, command });
    });
  }

  /** Overlay webContents that already answered a ping (forgotten when the page reloads). */
  const readyOverlays = new WeakSet();

  /**
   * Resolve with the overlay window once its renderer answers a ping, i.e. the
   * command bridge is subscribed and the canvas and tool renderers are set up.
   * Rejects at `deadline` so the tool reports an error instead of hanging.
   */
  async function waitForOverlayReady(targetId, deadline) {
    for (;;) {
      const win = getOverlayWindowForDisplay(targetId);
      if (win && !win.isDestroyed() && !win.webContents.isLoading()) {
        const wc = win.webContents;
        if (readyOverlays.has(wc)) return win;
        try {
          await sendOverlayCommand(wc, { type: 'ping' }, PING_TIMEOUT_MS);
          readyOverlays.add(wc);
          wc.once('did-start-loading', () => readyOverlays.delete(wc));
          return win;
        } catch {
          // Not subscribed yet; try again until the deadline.
        }
      } else {
        await sleep(POLL_MS);
      }
      if (Date.now() > deadline) throw new Error(`the overlay of display ${targetId} is not ready yet; retry in a moment`);
    }
  }

  const cursorDisplayId = () => screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;

  const host = {
    getState() {
      const cursorId = cursorDisplayId();
      return {
        drawingMode: getDrawingMode(),
        tool: getActiveToolConfig()?.tool ?? 'freehand',
        // Built-in tool ids plus the active one. Plugin tools that are not active
        // are not known to the main process, so they are not listed.
        tools: knownToolIds(),
        displays: screen.getAllDisplays().map((d) => ({
          id: d.id,
          ...pixelSize(d),
          scaleFactor: d.scaleFactor,
          isCursorDisplay: d.id === cursorId,
        })),
      };
    },

    setDrawingMode(enabled) {
      setDrawingMode(enabled);
    },

    setTool(id) {
      applyToolConfigFromMain({ tool: id });
    },

    async runOnOverlay(displayId, command) {
      const targetId = displayId ?? cursorDisplayId();
      // On Wayland the overlay only exists while drawing and is created a moment
      // after drawing mode turns on, so wait for it instead of failing at once.
      const deadline = Date.now() + OVERLAY_READY_TIMEOUT_MS;
      let win = getOverlayWindowForDisplay(targetId);
      while (!win || win.isDestroyed() || win.webContents.isLoading()) {
        if (Date.now() > deadline) throw new Error(`the overlay of display ${targetId} is not available`);
        await sleep(POLL_MS);
        win = getOverlayWindowForDisplay(targetId);
      }
      // A loaded page is not a ready overlay: the renderer subscribes to commands
      // only once its modules are loaded, and a command sent earlier is lost or
      // drawn before the tool renderers exist. Hold the command until the
      // renderer answers a ping.
      win = await waitForOverlayReady(targetId, deadline);
      // Drawing mode is switched on before the overlay is known to be ready (the draw
      // tools do it first). The overlay shows its canvas only while its renderer
      // believes drawing mode is on (opacity 0 otherwise), and a broadcast sent while
      // the page was still loading is lost, so the stroke would exist but stay
      // invisible. Re-send the current state now that the renderer is listening.
      win.webContents.send(OVERLAY.DRAWING_MODE_CHANGED, getDrawingMode());
      return sendOverlayCommand(win.webContents, { ...command, offset: overlayOffset(targetId) }, COMMAND_TIMEOUT_MS);
    },

    async screenshot(displayId) {
      const result = await captureDisplayImage({ displayId });
      if (!result.ok) throw new Error(CAPTURE_ERRORS[result.error] ?? CAPTURE_ERRORS.failed);
      const { width, height } = result.image.getSize();
      return {
        data: result.image.toPNG().toString('base64'),
        mimeType: 'image/png',
        width,
        height,
        displayId: result.display.id,
      };
    },
  };

  const tools = createBuiltinTools(host);

  const server = createMcpHttpServer({
    port,
    getConfig: () => current,
    getTools: () => tools,
    logger: log,
    serverVersion: app.getVersion(),
  });

  /** Settings the user tried to save with the switch on while starting failed; Retry reuses them. */
  let pendingEnable = null;

  const fullStatus = () => ({ ...server.status(), pendingEnable: pendingEnable !== null });

  function broadcastStatus() {
    const status = fullStatus();
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(MCP.STATUS_CHANGED, status);
    }
  }

  // Start / stop requests are applied one at a time, in arrival order.
  let chain = Promise.resolve();
  const serialize = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.then(() => undefined, () => undefined);
    return run;
  };

  /**
   * Apply a Save of the `mcp` settings. Resolves to the value to persist.
   * @param {typeof current} prev
   * @param {typeof current} next
   */
  function applySettings(prev, next) {
    return serialize(async () => {
      const effective = { ...next, enabledPlugins: [...next.enabledPlugins] };
      if (effective.enabled && !effective.apiKey) effective.apiKey = generateApiKey();

      if (effective.enabled) {
        current = effective;
        const status = await server.start();
        if (!status.running) {
          // Starting failed: keep the previous choice instead of saving a switch
          // that is on while nothing listens. The server keeps the error status,
          // which the panel reads to say why.
          pendingEnable = { ...next, apiKey: effective.apiKey, enabledPlugins: [...next.enabledPlugins] };
          effective.enabled = prev.enabled;
          current = effective;
          log.warn('[mcp] could not start:', status.error, status.message ?? '');
          broadcastStatus();
          return effective;
        }
      } else {
        pendingEnable = null;
        current = effective;
        await server.stop();
      }
      if (effective.enabled) pendingEnable = null;
      broadcastStatus();
      return effective;
    });
  }

  setMcpSettingsApplier((prev, next) => applySettings(prev, next));

  ipcMain.handle(MCP.GET_STATUS, () => fullStatus());

  // Retry a start that failed when the user turned the switch on.
  ipcMain.handle(MCP.RETRY_START, () => serialize(async () => {
    if (!pendingEnable && !current.enabled) return fullStatus();
    const wanted = pendingEnable ?? current;
    const previous = current;
    current = { ...wanted, enabled: true };
    const status = await server.start();
    if (status.running) {
      pendingEnable = null;
      updateSettings({ mcp: current });
    } else {
      current = previous;
    }
    broadcastStatus();
    return fullStatus();
  }));

  ipcMain.handle(MCP.REGENERATE_KEY, () => serialize(async () => {
    const apiKey = generateApiKey();
    current = { ...current, apiKey };
    updateSettings({ mcp: current });
    return apiKey;
  }));

  // Replies from overlays. Only the window a command was sent to may answer it.
  onValidated(ipcMain, MCP.COMMAND_RESULT, commandResultSchema, (event, payload) => {
    const entry = pending.get(payload.requestId);
    if (!entry || entry.sender !== event.sender) return;
    pending.delete(payload.requestId);
    clearTimeout(entry.timer);
    if (payload.ok) entry.resolve(payload.result ?? null);
    else entry.reject(new Error(payload.error ?? 'the overlay reported an error'));
  });

  app.on('will-quit', () => { void server.stop(); });

  // Boot: honour a saved "on" (a hand-edited file may lack the key).
  if (current.enabled) {
    if (!current.apiKey) {
      current = { ...current, apiKey: generateApiKey() };
      updateSettings({ mcp: current });
    }
    void serialize(async () => {
      await server.start();
      broadcastStatus();
    });
  }

  return { server, host };
}
