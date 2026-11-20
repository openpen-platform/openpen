/**
 * Local MCP endpoint: Streamable HTTP on loopback.
 *
 * Request gate, in order: path -> Origin / Host -> bearer key -> method -> body.
 * - any `Origin` header is refused (a browser page must never reach this);
 * - `Host` must be 127.0.0.1:<port> or localhost:<port> (DNS-rebinding guard);
 * - the key is read from `getConfig()` on every request, so regenerating it
 *   kills the old one immediately. The gate runs on every request, session or not.
 *
 * Sessions: an `initialize` request opens a session (id in the `mcp-session-id`
 * header). Later requests that carry the id reach the same server, which is what
 * lets the endpoint push `notifications/tools/list_changed` over the GET stream
 * and receive cancellations. A request without a session id (a client that
 * ignores the header) is still served by a throwaway server, as before.
 * Sessions are capped and all closed when the endpoint stops.
 * Pure Node (no Electron imports) so it runs under vitest.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { MCP_HOST, MCP_PATH, MCP_MAX_BODY_BYTES } from '../../shared/mcp-constants.js';
import { filterTools, SERVER_INSTRUCTIONS, PLUGIN_INSTRUCTIONS } from './tools.js';

const WARN_INTERVAL_MS = 60_000;
/** Open sessions kept at once; the least recently used one is closed past this. */
const MAX_SESSIONS = 32;

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function toInputJsonSchema(schema) {
  const { $schema: _ignored, ...rest } = z.toJSONSchema(schema);
  return { ...rest, type: 'object' };
}

function describeIssues(error) {
  return error.issues.map((i) => `${i.path.join('.') || 'arguments'}: ${i.message}`).join('; ');
}

/**
 * A plugin tool carries a JSON Schema (its zod schema lives in the overlay, which
 * validates the arguments) and a `handler(args, ctx)` that resolves to a ready
 * MCP result. Built-in tools carry a zod schema and are validated here.
 */
const isPluginTool = (tool) => typeof tool.pluginId === 'string';

/**
 * @param {{
 *   port: number,
 *   getConfig: () => { apiKey: string, readOnly?: boolean, exposeAll?: boolean, enabledPlugins?: string[] },
 *   getTools: () => Array<any>,
 *   getDisabledModules?: () => string[],
 *   findDisabledPluginForTool?: (toolName: string) => string | undefined,
 *   logger?: { warn: Function, info: Function, error: Function },
 *   serverVersion?: string,
 * }} opts
 */
export function createMcpHttpServer({ port, getConfig, getTools, getDisabledModules, findDisabledPluginForTool, logger, serverVersion = '0.0.0' }) {
  /** @type {http.Server | null} */
  let httpServer = null;
  /** @type {{ running: boolean, url: string | null, error: null | 'port_in_use' | 'failed', message?: string }} */
  let currentStatus = { running: false, url: null, error: null };
  let queue = Promise.resolve();
  /** @type {Map<string, number>} */
  const lastWarn = new Map();
  /** @type {Map<string, { server: Server, transport: StreamableHTTPServerTransport, lastUsed: number }>} */
  const sessions = new Map();

  function warnThrottled(reason, detail) {
    const now = Date.now();
    if (now - (lastWarn.get(reason) ?? -Infinity) < WARN_INTERVAL_MS) return;
    lastWarn.set(reason, now);
    logger?.warn?.(`[mcp] rejected request (${reason})${detail ? `: ${detail}` : ''}`);
  }

  function reply(res, status, message) {
    if (res.headersSent) return;
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32000, message }, id: null }));
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      // Past the cap the rest is read and thrown away, so the client receives a
      // clean 413 instead of a reset connection.
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size <= MCP_MAX_BODY_BYTES) chunks.push(chunk);
      });
      req.on('end', () => {
        if (size > MCP_MAX_BODY_BYTES) reject(Object.assign(new Error('too large'), { code: 'TOO_LARGE' }));
        else resolve(Buffer.concat(chunks).toString('utf8'));
      });
      req.on('error', reject);
    });
  }

  /** What a client may see right now: the saved settings plus the plugins the user disabled. */
  const currentView = () => ({ ...getConfig(), disabledModules: getDisabledModules?.() ?? [] });

  /** One line per plugin tool call: plugin, local tool name, duration, outcome. */
  function logPluginCall(tool, startedAt, result) {
    const ms = Math.round(Date.now() - startedAt);
    const outcome = result?.isError ? `error:${result.errorKind ?? 'internal'}` : 'ok';
    const line = `[mcp] plugin-tool ${tool.pluginId} ${tool.localName} ${ms}ms ${outcome}`;
    if (!result?.isError) logger?.info?.(line);
    else if (result.errorKind === 'internal' || result.errorKind === undefined) logger?.error?.(line);
    else logger?.warn?.(line);
  }

  async function callPluginTool(tool, rawArgs, extra) {
    const startedAt = Date.now();
    const progressToken = extra?._meta?.progressToken;
    const ctx = {
      signal: extra?.signal,
      reportProgress(progress, total, message) {
        // A request without a progressToken did not ask for progress: drop it.
        if (progressToken === undefined || !extra?.sendNotification) return;
        void extra.sendNotification({
          method: 'notifications/progress',
          params: { progressToken, progress, ...(total !== undefined ? { total } : {}), ...(message ? { message } : {}) },
        }).catch(() => {});
      },
    };
    let result;
    try {
      result = await tool.handler(rawArgs ?? {}, ctx);
    } catch (err) {
      logger?.error?.('[mcp] plugin tool handler threw:', err);
      result = {
        isError: true,
        errorKind: 'unavailable',
        content: [{ type: 'text', text: `${tool.name} is temporarily unavailable. Next step: retry in a moment.` }],
      };
    }
    logPluginCall(tool, startedAt, result);
    return result;
  }

  function buildServer() {
    const server = new Server(
      { name: 'openpen', version: serverVersion },
      { capabilities: { tools: { listChanged: true } }, instructions: `${SERVER_INSTRUCTIONS} ${PLUGIN_INSTRUCTIONS}` },
    );
    const exposed = () => filterTools(getTools(), currentView());

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: exposed().map((t) => {
        if (!isPluginTool(t)) {
          return { name: t.name, description: t.description, inputSchema: toInputJsonSchema(t.inputSchema) };
        }
        return {
          name: t.name,
          ...(t.title ? { title: t.title } : {}),
          description: t.description,
          inputSchema: t.inputJsonSchema,
          ...(t.outputJsonSchema ? { outputSchema: t.outputJsonSchema } : {}),
          annotations: t.annotations,
        };
      }),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const { name, arguments: rawArgs } = request.params;
      const view = currentView();
      const tool = filterTools(getTools(), view).find((t) => t.name === name);
      if (!tool) {
        const known = getTools().find((t) => t.name === name);
        // A tool registered by a plugin that is now disabled, or a name that only the
        // prefix identifies (the plugin was disabled before the app started).
        const disabledOwner = known?.pluginId && view.disabledModules.includes(known.pluginId)
          ? known.pluginId
          : findDisabledPluginForTool?.(name);
        if (disabledOwner) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Plugin is disabled: ${disabledOwner} is turned off in OpenPen, so ${name} cannot run. Next step: call tools/list for the tools that are available.` }],
          };
        }
        const hint = view.readOnly
          ? 'OpenPen is in read-only mode, so only read tools are available. Call tools/list to see them.'
          : 'Call tools/list to see the available tools.';
        return { isError: true, content: [{ type: 'text', text: `Tool "${name}" is not available. ${hint}` }] };
      }
      if (isPluginTool(tool)) return callPluginTool(tool, rawArgs, extra);
      const parsed = tool.inputSchema.safeParse(rawArgs ?? {});
      if (!parsed.success) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Invalid arguments for ${name}: ${describeIssues(parsed.error)}. Call openpen__get_guide for the expected arguments.` }],
        };
      }
      try {
        return await tool.handler(parsed.data);
      } catch (err) {
        logger?.error?.('[mcp] tool handler threw:', err);
        return { isError: true, content: [{ type: 'text', text: `${name} failed: ${err?.message ?? err}. The canvas is unchanged.` }] };
      }
    });
    return server;
  }

  function closeSession(id) {
    const entry = sessions.get(id);
    if (!entry) return;
    sessions.delete(id);
    void entry.transport.close().catch(() => {});
    void entry.server.close().catch(() => {});
  }

  function openSession() {
    const server = buildServer();
    /** @type {{ server: Server, transport: StreamableHTTPServerTransport, lastUsed: number }} */
    const entry = { server, transport: /** @type {any} */ (null), lastUsed: Date.now() };
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, entry);
        while (sessions.size > MAX_SESSIONS) {
          let oldest = null;
          for (const [sid, e] of sessions) {
            if (sid !== id && (oldest === null || e.lastUsed < sessions.get(oldest).lastUsed)) oldest = sid;
          }
          if (oldest === null) break;
          closeSession(oldest);
        }
      },
    });
    entry.transport = transport;
    server.onclose = () => {
      if (transport.sessionId) sessions.delete(transport.sessionId);
    };
    return { server, transport, entry };
  }

  /** Tell every open session the tool list changed (the clients that listen re-fetch it). */
  function notifyToolListChanged() {
    for (const { server } of sessions.values()) {
      void server.sendToolListChanged().catch(() => {});
    }
  }

  async function onRequest(req, res) {
    const boundPort = httpServer?.address()?.port;
    const pathname = (req.url ?? '').split('?')[0];
    if (pathname !== MCP_PATH) return reply(res, 404, 'Not found');

    if (req.headers.origin !== undefined) {
      warnThrottled('origin', String(req.headers.origin));
      return reply(res, 403, 'Browser requests are not allowed');
    }
    const hostHeader = String(req.headers.host ?? '').toLowerCase();
    if (hostHeader !== `${MCP_HOST}:${boundPort}` && hostHeader !== `localhost:${boundPort}`) {
      warnThrottled('host', hostHeader);
      return reply(res, 403, 'Host not allowed');
    }

    const config = getConfig();
    const auth = String(req.headers.authorization ?? '');
    const presented = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!config?.apiKey || !presented || !safeEqual(presented, config.apiKey)) {
      warnThrottled('key', presented ? 'wrong key' : 'missing key');
      res.setHeader('www-authenticate', 'Bearer');
      return reply(res, 401, 'Missing or wrong API key');
    }

    const method = req.method ?? '';
    if (method !== 'POST' && method !== 'GET' && method !== 'DELETE') {
      res.setHeader('allow', 'POST, GET, DELETE');
      return reply(res, 405, 'Method not allowed');
    }

    // Requests that belong to a session (the event stream, termination and every
    // call after initialize) go to that session's transport.
    const sessionHeader = req.headers['mcp-session-id'];
    const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
    if (sessionId !== undefined) {
      const entry = sessions.get(sessionId);
      if (!entry) return reply(res, 404, 'Unknown or expired session; initialize again');
      entry.lastUsed = Date.now();
      try {
        if (method === 'POST') {
          let body;
          try {
            body = JSON.parse(await readBody(req));
          } catch (err) {
            if (err?.code === 'TOO_LARGE') return reply(res, 413, 'Request body too large');
            return reply(res, 400, 'Invalid JSON');
          }
          await entry.transport.handleRequest(req, res, body);
        } else {
          await entry.transport.handleRequest(req, res);
        }
      } catch (err) {
        logger?.error?.('[mcp] session request failed:', err);
        reply(res, 500, 'Internal error');
      }
      return;
    }

    if (method !== 'POST') {
      res.setHeader('allow', 'POST');
      return reply(res, 405, 'Method not allowed');
    }

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (err) {
      if (err?.code === 'TOO_LARGE') return reply(res, 413, 'Request body too large');
      return reply(res, 400, 'Invalid JSON');
    }

    // `initialize` opens a session; anything else without one is served statelessly.
    if (isInitializeRequest(body)) {
      const { server, transport } = openSession();
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, body);
      } catch (err) {
        logger?.error?.('[mcp] initialize failed:', err);
        reply(res, 500, 'Internal error');
      }
      return;
    }

    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch (err) {
      logger?.error?.('[mcp] request failed:', err);
      reply(res, 500, 'Internal error');
    }
  }

  function doStart() {
    if (httpServer) return Promise.resolve(currentStatus);
    return new Promise((resolve) => {
      const srv = http.createServer((req, res) => { void onRequest(req, res); });
      srv.once('error', (err) => {
        const inUse = err?.code === 'EADDRINUSE';
        currentStatus = {
          running: false,
          url: null,
          error: inUse ? 'port_in_use' : 'failed',
          ...(inUse ? {} : { message: err?.message ?? String(err) }),
        };
        logger?.error?.('[mcp] listen failed:', err?.message ?? err);
        resolve(currentStatus);
      });
      srv.listen(port, MCP_HOST, () => {
        srv.removeAllListeners('error');
        srv.on('error', (err) => logger?.error?.('[mcp] server error:', err));
        httpServer = srv;
        const bound = /** @type {import('node:net').AddressInfo} */ (srv.address());
        currentStatus = { running: true, url: `http://${MCP_HOST}:${bound.port}${MCP_PATH}`, error: null };
        resolve(currentStatus);
      });
    });
  }

  function doStop() {
    const srv = httpServer;
    httpServer = null;
    currentStatus = { running: false, url: null, error: null };
    for (const id of [...sessions.keys()]) closeSession(id);
    if (!srv) return Promise.resolve();
    return new Promise((resolve) => {
      srv.close(() => resolve());
      srv.closeAllConnections?.();
    });
  }

  // start / stop never overlap: a quick off-on-off from the settings panel
  // must not race two listen() calls.
  const enqueue = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.then(() => undefined, () => undefined);
    return run;
  };

  return {
    start: () => enqueue(doStart),
    stop: () => enqueue(doStop),
    status: () => ({ ...currentStatus }),
    notifyToolListChanged,
    sessionCount: () => sessions.size,
    boundAddress: () => (httpServer ? /** @type {import('node:net').AddressInfo} */ (httpServer.address()).address : null),
  };
}
