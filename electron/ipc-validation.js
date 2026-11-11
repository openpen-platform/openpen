/**
 * Payload validation for renderer → main IPC.
 *
 * Every main-process handler that reads data sent by a renderer registers
 * through `onValidated` / `handleValidated` with a schema from
 * `ipc-payload-schemas.js`. A payload that fails its schema never reaches the
 * handler: the request is dropped (one-way) or answered with the handler's
 * documented failure value / a rejected promise (invoke), and one warning
 * line is written to the main log.
 *
 * Handlers that take no renderer data keep using `ipcMain.on` /
 * `ipcMain.handle` directly; `tests/unit/ipcPayloadValidation.test.js`
 * fails if a raw handler starts reading a payload argument.
 */

import log from 'electron-log/main.js';

/** Upper bound on how many schema issues are written per rejection. */
const MAX_LOGGED_ISSUES = 5;

/**
 * Validate one payload against its schema. Logs a warning on failure.
 *
 * Only the issue paths and messages are logged, never the payload itself,
 * so a rejected request cannot flood the log or leak user data into it.
 *
 * @template T
 * @param {string} channel
 * @param {import('zod').ZodType<T>} schema
 * @param {unknown} payload
 * @returns {{ ok: true, data: T } | { ok: false }}
 */
export function parsePayload(channel, schema, payload) {
  const result = schema.safeParse(payload);
  if (result.success) return { ok: true, data: result.data };
  const issues = result.error.issues
    .slice(0, MAX_LOGGED_ISSUES)
    .map((issue) => `${issue.path.length ? issue.path.join('.') : '(payload)'}: ${issue.message}`)
    .join('; ');
  logRejected(channel, issues);
  return { ok: false };
}

/**
 * Write the single warning line for a rejected payload. Exported for handlers
 * that run a domain validator after the schema (for example the layout store).
 *
 * @param {string} channel
 * @param {string} reason
 */
export function logRejected(channel, reason) {
  log.warn(`[ipc] rejected invalid payload on "${channel}": ${reason}`);
}

/**
 * `ipcMain.on` with payload validation. The handler receives the parsed data.
 *
 * @template T
 * @param {Pick<import('electron').IpcMain, 'on'>} ipc
 * @param {string} channel
 * @param {import('zod').ZodType<T>} schema
 * @param {(event: import('electron').IpcMainEvent, data: T) => void} handler
 */
export function onValidated(ipc, channel, schema, handler) {
  ipc.on(channel, (event, payload) => {
    const parsed = parsePayload(channel, schema, payload);
    if (!parsed.ok) return;
    handler(event, parsed.data);
  });
}

/**
 * `ipcMain.handle` with payload validation. The handler receives the parsed data.
 *
 * On invalid payload: returns `onInvalid()` when given (for channels whose
 * callers already expect a failure value such as `{ ok: false }`), otherwise
 * throws so the renderer's `invoke` promise rejects.
 *
 * @template T
 * @param {Pick<import('electron').IpcMain, 'handle'>} ipc
 * @param {string} channel
 * @param {import('zod').ZodType<T>} schema
 * @param {(event: import('electron').IpcMainInvokeEvent, data: T) => unknown} handler
 * @param {{ onInvalid?: () => unknown }} [opts]
 */
export function handleValidated(ipc, channel, schema, handler, opts = {}) {
  ipc.handle(channel, (event, payload) => {
    const parsed = parsePayload(channel, schema, payload);
    if (!parsed.ok) {
      if (opts.onInvalid) return opts.onInvalid();
      throw new Error(`Invalid payload for IPC channel "${channel}"`);
    }
    return handler(event, parsed.data);
  });
}
