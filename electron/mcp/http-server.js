/**
 * Local MCP endpoint: stateless Streamable HTTP on loopback.
 *
 * Request gate, in order: path -> Origin / Host -> bearer key -> method -> body.
 * - any `Origin` header is refused (a browser page must never reach this);
 * - `Host` must be 127.0.0.1:<port> or localhost:<port> (DNS-rebinding guard);
 * - the key is read from `getConfig()` on every request, so regenerating it
 *   kills the old one immediately.
 * A fresh SDK server + transport serves each request, so no session state
 * outlives it. Pure Node (no Electron imports) so it runs under vitest.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { z } from 'zod';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { MCP_HOST, MCP_PATH, MCP_MAX_BODY_BYTES } from '../../shared/mcp-constants.js';
import { filterTools, SERVER_INSTRUCTIONS } from './tools.js';

const WARN_INTERVAL_MS = 60_000;

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

/**
 * @param {{
 *   port: number,
 *   getConfig: () => { apiKey: string, readOnly?: boolean, exposeAll?: boolean, enabledPlugins?: string[] },
 *   getTools: () => Array<any>,
 *   logger?: { warn: Function, info: Function, error: Function },
 *   serverVersion?: string,
 * }} opts
 */
export function createMcpHttpServer({ port, getConfig, getTools, logger, serverVersion = '0.0.0' }) {
  /** @type {http.Server | null} */
  let httpServer = null;
  /** @type {{ running: boolean, url: string | null, error: null | 'port_in_use' | 'failed', message?: string }} */
  let currentStatus = { running: false, url: null, error: null };
  let queue = Promise.resolve();
  /** @type {Map<string, number>} */
  const lastWarn = new Map();

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

  function buildServer(config) {
    const server = new Server(
      { name: 'openpen', version: serverVersion },
      { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
    );
    const exposed = () => filterTools(getTools(), config);

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: exposed().map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: toInputJsonSchema(t.inputSchema),
      })),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: rawArgs } = request.params;
      const tool = exposed().find((t) => t.name === name);
      if (!tool) {
        const hint = config.readOnly
          ? 'OpenPen is in read-only mode, so only read tools are available. Call tools/list to see them.'
          : 'Call tools/list to see the available tools.';
        return { isError: true, content: [{ type: 'text', text: `Tool "${name}" is not available. ${hint}` }] };
      }
      const parsed = tool.inputSchema.safeParse(rawArgs ?? {});
      if (!parsed.success) {
        const detail = parsed.error.issues.map((i) => `${i.path.join('.') || 'arguments'}: ${i.message}`).join('; ');
        return {
          isError: true,
          content: [{ type: 'text', text: `Invalid arguments for ${name}: ${detail}. Call openpen__get_guide for the expected arguments.` }],
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

    if (req.method !== 'POST') {
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

    const server = buildServer(config);
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
    boundAddress: () => (httpServer ? /** @type {import('node:net').AddressInfo} */ (httpServer.address()).address : null),
  };
}
