/**
 * stdio <-> HTTP bridge between Claude Desktop and the local OpenPen MCP endpoint.
 *
 * Claude Desktop starts this file from the OpenPen .mcpb and talks MCP over
 * stdio (one JSON-RPC message per line). Every message is POSTed to OpenPen's
 * stateless Streamable HTTP endpoint with the API key the user entered at
 * install time, and the reply is written back as one line.
 *
 * When OpenPen cannot be used (wrong key, app not running, MCP switch off) the
 * bridge keeps the connection alive instead of exiting: `initialize` is answered
 * locally, `tools/list` offers a single connection-check tool, and every tool
 * call returns `isError` with what to fix, so Claude can tell the user in the
 * chat. Once OpenPen answers again the bridge sends `tools/list_changed`.
 *
 * Dependency-free on purpose: the .mcpb ships this folder as-is and Claude
 * Desktop runs it with its bundled Node.
 */

import http from 'node:http';

/** Must match shared/mcp-constants.js (a unit test checks it). */
export const DEFAULT_URL = 'http://127.0.0.1:17639/mcp';
export const CHECK_TOOL = 'openpen__check_connection';
/** The key must never leave this computer: only loopback targets are accepted. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);
const REQUEST_TIMEOUT_MS = 60_000;
const FALLBACK_PROTOCOL_VERSION = '2025-06-18';

const MESSAGES = {
  wrongKey:
    'OpenPen refused the API key. Open OpenPen Settings > MCP, copy the API key, ' +
    'then paste it into the OpenPen extension settings in Claude Desktop (Settings > Extensions > OpenPen) and save.',
  notRunning:
    'Cannot reach OpenPen on this computer. Make sure OpenPen is running, ' +
    'then open OpenPen Settings > MCP, turn on "Enable MCP server" and click Save.',
  timeout: 'OpenPen did not answer within 60 seconds. Check that OpenPen is responding, then try again.',
  unexpected: (status) =>
    `Something other than the OpenPen MCP server answered (HTTP ${status}). ` +
    'Open OpenPen Settings > MCP and check that the server is running.',
};

const CHECK_TOOL_DEF = {
  name: CHECK_TOOL,
  description:
    'Checks whether Claude can reach OpenPen, the screen-annotation app on this computer, and explains what to fix if not. ' +
    'Suited to the moment OpenPen drawing tools are missing: it is the only tool offered while OpenPen is unreachable. ' +
    'It draws nothing and changes nothing. Takes no parameters.',
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true, openWorldHint: false },
};

class UpstreamError extends Error {
  /** @param {'wrongKey' | 'notRunning' | 'timeout' | 'unexpected'} kind */
  constructor(kind, status) {
    super(kind === 'unexpected' ? MESSAGES.unexpected(status) : MESSAGES[kind]);
    this.kind = kind;
  }
}

/** Reads one JSON-RPC reply from a JSON or SSE body. */
function parseReply(text) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return JSON.parse(trimmed);
  const data = trimmed.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
  return data.length ? JSON.parse(data[data.length - 1]) : null;
}

/**
 * @param {{
 *   url?: string,
 *   apiKey?: string,
 *   version?: string,
 *   logger?: { error: Function },
 *   notify?: (message: object) => void,
 * }} opts
 */
export function createBridge({ url = DEFAULT_URL, apiKey = '', version = '0.0.0', logger = console, notify = () => {} } = {}) {
  const target = new URL(url);
  if (target.protocol !== 'http:' || !LOOPBACK_HOSTS.has(target.hostname)) {
    throw new Error(`OpenPen bridge only connects to OpenPen on this computer, not ${target.host}`);
  }
  /** Protocol version OpenPen agreed to; sent as a header once known. */
  let protocolVersion = null;
  /** True after Claude was shown the fallback tool list, so a recovery must announce new tools. */
  let fallbackListed = false;

  function post(message) {
    if (!apiKey) return Promise.reject(new UpstreamError('wrongKey'));
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(message);
      const req = http.request(
        {
          host: target.hostname,
          port: target.port,
          path: target.pathname,
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json, text/event-stream',
            authorization: `Bearer ${apiKey}`,
            'content-length': Buffer.byteLength(payload),
            ...(protocolVersion ? { 'mcp-protocol-version': protocolVersion } : {}),
          },
          timeout: REQUEST_TIMEOUT_MS,
        },
        (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (text += c));
          res.on('end', () => {
            if (res.statusCode === 401) return reject(new UpstreamError('wrongKey'));
            if (res.statusCode === 202) return resolve(null);
            if (res.statusCode !== 200) return reject(new UpstreamError('unexpected', res.statusCode));
            try {
              resolve(parseReply(text));
            } catch {
              reject(new UpstreamError('unexpected', res.statusCode));
            }
          });
        },
      );
      req.on('timeout', () => req.destroy(new UpstreamError('timeout')));
      req.on('error', (err) => reject(err instanceof UpstreamError ? err : new UpstreamError('notRunning')));
      req.end(payload);
    });
  }

  function recovered() {
    if (!fallbackListed) return;
    fallbackListed = false;
    notify({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
  }

  const toolError = (id, text) => ({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text }] } });

  /** Local answers used while OpenPen cannot be reached. */
  function fallback(message, err) {
    const { id, method } = message;
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: message.params?.protocolVersion ?? FALLBACK_PROTOCOL_VERSION,
            capabilities: { tools: { listChanged: true } },
            serverInfo: { name: 'openpen', version },
            instructions: `OpenPen is not connected yet. ${err.message}`,
          },
        };
      case 'tools/list':
        fallbackListed = true;
        return { jsonrpc: '2.0', id, result: { tools: [CHECK_TOOL_DEF] } };
      case 'tools/call':
        return toolError(id, err.message);
      case 'ping':
        return { jsonrpc: '2.0', id, result: {} };
      default:
        return { jsonrpc: '2.0', id, error: { code: -32000, message: err.message } };
    }
  }

  async function checkConnection(id) {
    await post({ jsonrpc: '2.0', id: `${id}-check`, method: 'tools/list', params: {} });
    recovered();
    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{
          type: 'text',
          text: 'OpenPen is connected. Its drawing tools are available now. If they do not show up, ' +
            'turn the OpenPen extension off and on again in Claude Desktop Settings > Extensions.',
        }],
      },
    };
  }

  /**
   * Handles one message from Claude Desktop.
   * @returns {Promise<object | object[] | null>} the reply, or null for notifications
   */
  async function handle(message) {
    if (Array.isArray(message)) {
      const replies = (await Promise.all(message.map(handle))).filter(Boolean);
      return replies.length ? replies : null;
    }
    const isRequest = message && message.id !== undefined && typeof message.method === 'string';
    try {
      if (isRequest && message.method === 'tools/call' && message.params?.name === CHECK_TOOL) {
        return await checkConnection(message.id);
      }
      const reply = await post(message);
      if (message?.method === 'initialize' && reply?.result?.protocolVersion) {
        protocolVersion = reply.result.protocolVersion;
      }
      recovered();
      return isRequest ? reply : null;
    } catch (err) {
      if (!(err instanceof UpstreamError)) throw err;
      logger.error?.(`[openpen] ${message?.method ?? 'message'}: ${err.message}`);
      return isRequest ? fallback(message, err) : null;
    }
  }

  return { handle };
}

/**
 * Wires a bridge to newline-delimited JSON-RPC streams (stdin / stdout).
 * @param {{ handle: Function }} bridge
 * @param {NodeJS.ReadableStream} input
 * @param {NodeJS.WritableStream} output
 * @param {{ onDone?: () => void }} [opts] onDone runs once input has ended and every reply is written
 */
export function attachStdio(bridge, input, output, { onDone } = {}) {
  const write = (msg) => output.write(JSON.stringify(msg) + '\n');
  let buffer = '';
  let pending = 0;
  let ended = false;
  const settle = () => {
    if (ended && pending === 0) onDone?.();
  };
  input.on('end', () => {
    ended = true;
    settle();
  });
  input.setEncoding?.('utf8');
  input.on('data', (chunk) => {
    buffer += chunk;
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
        continue;
      }
      pending++;
      bridge.handle(message).then(
        (reply) => { if (reply) write(reply); },
        (err) => {
          if (message?.id !== undefined) {
            write({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: `Internal error: ${err?.message ?? err}` } });
          }
        },
      ).finally(() => {
        pending--;
        settle();
      });
    }
  });
  return { write };
}
