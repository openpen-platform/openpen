/**
 * Source tag the overlay puts on records that carry a plugin tool's own log
 * line (see pluginToolLogger in src/services/mcp-tool-bridge.ts).
 */
export const PLUGIN_TOOL_LOG_SOURCE = 'mcp-plugin-tool';

/**
 * Writes one renderer-reported record to the main-process file log at the
 * level the renderer asked for. A record without a level is an error, which is
 * what crash reporters (window.onerror and friends) send.
 *
 * A plugin tool's line is written as its message string alone, so it is one
 * log line that starts with the `[mcp] plugin <id>` prefix. Other records keep
 * the object form, which electron-log also truncates for long strings. Line
 * breaks inside a plugin message are escaped so the plugin cannot forge extra
 * log lines.
 *
 * Pure (the logger is a parameter) so it is unit-testable without Electron.
 *
 * @param {{ info: Function, warn: Function, error: Function }} logger
 * @param {{ level?: 'error'|'warn'|'info', message: string, source?: string|null }} payload
 */
export function logRendererRecord(logger, payload) {
  const level = payload.level === 'info' || payload.level === 'warn' ? payload.level : 'error';
  if (payload.source === PLUGIN_TOOL_LOG_SOURCE) {
    logger[level](payload.message.replace(/\r/g, '\\r').replace(/\n/g, '\\n'));
    return;
  }
  logger[level]('renderer:', payload);
}
