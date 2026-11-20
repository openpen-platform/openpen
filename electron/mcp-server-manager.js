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
import { getSetting, updateSettings, setMcpSettingsApplier, onSettingsChanged } from './settings-store.js';
import { mcpPluginToolsSchema, mcpToolProgressSchema } from './ipc-payload-schemas.js';
import { getInstalledPluginSummary, getInstalledPluginIds } from './module-manifest-loader.js';
import {
  applyToolConfigFromMain,
  getActiveToolConfig,
  getDrawingMode,
  getOverlayWindowForDisplay,
  setDrawingMode,
} from './window-manager.js';
import { MCP_PORT } from '../shared/mcp-constants.js';
import { createMcpHttpServer } from './mcp/http-server.js';
import { createBuiltinTools, filterTools } from './mcp/tools.js';
import { buildPluginTools, sanitizePluginReport, pluginToolPrefix } from './mcp/plugin-tools.js';
import { generateApiKey } from './mcp/api-key.js';

/** How long a command may wait for the overlay (including its creation on Wayland). */
const OVERLAY_READY_TIMEOUT_MS = 8000;
const COMMAND_TIMEOUT_MS = 10_000;
/** A plugin tool may run for a while (it can draw, wait for the user, ...); the AI app can cancel earlier. */
const PLUGIN_TOOL_TIMEOUT_MS = 120_000;
/** Delivering a cancellation to the overlay. */
const CANCEL_TIMEOUT_MS = 2000;
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
  async function waitForOverlayReady(targetId, deadline, signal) {
    for (;;) {
      signal?.throwIfAborted();
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
          // Not subscribed yet (or the call was cancelled meanwhile); try again until the deadline.
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

  // ── Plugin tools ───────────────────────────────────────────────────────────
  // Plugin code only runs in overlay renderers. The primary display's overlay
  // reports what its modules declare; main names, validates and filters them.
  const builtinTools = createBuiltinTools({
    ...host,
    // Exposed plugins for get_guide: id, manifest summary, own guide, full tool names.
    getPluginGuides: () => exposedPlugins(),
  });
  const builtinNames = builtinTools.map((t) => t.name);

  /** @type {{ tools: any[], issues: Record<string, any[]>, guides: Record<string, string> }} */
  let pluginState = { tools: [], issues: {}, guides: {} };
  /** Calls in flight: where they run (for cancellation) and how to forward their progress. */
  /** @type {Map<string, { sender: Electron.WebContents, onProgress: (p: number, total?: number, message?: string) => void }>} */
  const pluginCalls = new Map();

  const disabledModules = () => getSetting('disabledModules') ?? [];
  const view = () => ({ ...current, disabledModules: disabledModules() });
  const allTools = () => [...builtinTools, ...pluginState.tools];

  function exposedPlugins() {
    const byPlugin = new Map();
    for (const tool of filterTools(pluginState.tools, view())) {
      const list = byPlugin.get(tool.pluginId) ?? [];
      list.push(tool.name);
      byPlugin.set(tool.pluginId, list);
    }
    return [...byPlugin].map(([pluginId, toolNames]) => ({
      pluginId,
      summary: getInstalledPluginSummary(pluginId),
      guide: pluginState.guides[pluginId] || undefined,
      tools: toolNames,
    }));
  }

  /** Names a client sees now; compared to the last published list to decide on `list_changed`. */
  let lastListSignature = null;
  function refreshExposure() {
    const signature = JSON.stringify(filterTools(allTools(), view()).map((t) => t.name).sort());
    if (lastListSignature !== null && signature !== lastListSignature) server.notifyToolListChanged();
    lastListSignature = signature;
  }

  function failResult(kind, message, nextStep) {
    return { isError: true, errorKind: kind, content: [{ type: 'text', text: `${message} Next step: ${nextStep}` }] };
  }

  function cancelledResult(tool) {
    return failResult('unavailable', `The call to ${tool.name} was cancelled before it started.`, 'call it again if it is still needed.');
  }

  /**
   * The plugin whose tool prefix `name` carries, when that plugin is installed
   * and disabled. Works without a registration record: a plugin disabled before
   * the app started never loaded, so it never reported its tools.
   */
  function disabledPluginForTool(name) {
    const disabled = disabledModules();
    return getInstalledPluginIds().find((pluginId) => disabled.includes(pluginId) && name.startsWith(`${pluginToolPrefix(pluginId)}__`));
  }

  /** Run one plugin tool call on the overlay of the target display. */
  async function runPluginTool(tool, rawArgs, ctx) {
    const { displayId: requested, ...pluginArgs } = rawArgs ?? {};
    if (requested !== undefined && !Number.isInteger(requested)) {
      return failResult('invalid_params', 'displayId must be an integer.', 'resend the call with a displayId from openpen__get_state, or omit it.');
    }
    if (requested !== undefined && !screen.getAllDisplays().some((d) => d.id === requested)) {
      return failResult('invalid_params', `Unknown displayId ${requested}.`, 'call openpen__get_state to see the display ids, then retry.');
    }
    const targetId = requested ?? cursorDisplayId();
    let wc;
    try {
      wc = (await waitForOverlayReady(targetId, Date.now() + OVERLAY_READY_TIMEOUT_MS, ctx.signal)).webContents;
    } catch (err) {
      if (ctx.signal?.aborted) return cancelledResult(tool);
      return failResult('unavailable', `The overlay of display ${targetId} is not ready (${err?.message ?? err}).`, 'retry in a moment.');
    }
    // Cancelled while waiting for the overlay: never dispatch, so a cancel can
    // not reach the overlay before the call it belongs to.
    if (ctx.signal?.aborted) return cancelledResult(tool);
    const callId = crypto.randomUUID();
    pluginCalls.set(callId, { sender: wc, onProgress: (p, total, message) => ctx.reportProgress?.(p, total, message) });
    const cancel = () => {
      // Best effort: the overlay aborts the handler's signal; the handler decides how to stop.
      sendOverlayCommand(wc, { type: 'plugin-tool-cancel', callId }, CANCEL_TIMEOUT_MS).catch(() => {});
    };
    ctx.signal?.addEventListener('abort', cancel, { once: true });
    try {
      const result = await sendOverlayCommand(
        wc,
        { type: 'plugin-tool-call', callId, pluginId: tool.pluginId, name: tool.localName, args: pluginArgs },
        PLUGIN_TOOL_TIMEOUT_MS,
      );
      if (!result || typeof result !== 'object' || !Array.isArray(result.content)) {
        log.error(`[mcp] plugin ${tool.pluginId} returned a malformed result for ${tool.localName}`);
        return failResult('internal', 'The tool failed unexpectedly.', 'retry once; if it keeps failing, tell the user.');
      }
      return result;
    } catch (err) {
      return failResult('unavailable', `${tool.name} could not run (${err?.message ?? err}).`, 'retry in a moment.');
    } finally {
      pluginCalls.delete(callId);
      ctx.signal?.removeEventListener('abort', cancel);
    }
  }

  /** Replace the registered plugin tools with what the primary overlay reported. */
  function registerPluginTools(reports, guides) {
    const { tools, issues } = buildPluginTools(reports, { builtinNames, logger: log });
    for (const tool of tools) {
      tool.handler = (args, ctx) => runPluginTool(tool, args, ctx);
    }
    for (const [pluginId, list] of Object.entries(issues)) {
      for (const issue of list) {
        log.warn(`[mcp] plugin tool not exposed: ${pluginId} ${issue.tool} (${issue.reason})`);
      }
    }
    pluginState = { tools, issues, guides };
    refreshExposure();
    broadcastStatus();
  }

  const server = createMcpHttpServer({
    port,
    getConfig: () => current,
    getTools: allTools,
    getDisabledModules: disabledModules,
    findDisabledPluginForTool: disabledPluginForTool,
    logger: log,
    serverVersion: app.getVersion(),
  });
  // Seed the list signature so the first plugin registration counts as a change.
  refreshExposure();

  /** Settings the user tried to save with the switch on while starting failed; Retry reuses them. */
  let pendingEnable = null;

  const fullStatus = () => ({ ...server.status(), pendingEnable: pendingEnable !== null, pluginToolIssues: pluginState.issues });

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
      refreshExposure();
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

  // Disabling a plugin (or re-enabling it) changes the tool list.
  onSettingsChanged(() => refreshExposure());

  // The primary display's overlay is the one source of plugin tools; reports from
  // other overlays are ignored, and only the window that owns the display may report.
  onValidated(ipcMain, MCP.PLUGIN_TOOLS, mcpPluginToolsSchema, (event, payload) => {
    if (payload.displayId !== screen.getPrimaryDisplay().id) return;
    const overlay = getOverlayWindowForDisplay(payload.displayId);
    if (!overlay || overlay.isDestroyed() || overlay.webContents !== event.sender) return;
    const { tools, guides } = sanitizePluginReport(payload, { logger: log });
    registerPluginTools(tools, guides);
  });

  onValidated(ipcMain, MCP.TOOL_PROGRESS, mcpToolProgressSchema, (event, payload) => {
    const call = pluginCalls.get(payload.callId);
    if (!call || call.sender !== event.sender) return;
    call.onProgress(payload.progress, payload.total, payload.message);
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
