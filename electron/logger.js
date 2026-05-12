/**
 * Centralised file logger for OpenPen.
 *
 * Writes to OS-standard log paths (electron-log default):
 *   macOS:   ~/Library/Logs/openpen/main.log
 *   Windows: %USERPROFILE%\AppData\Roaming\openpen\logs\main.log
 *   Linux:   ~/.config/openpen/logs/main.log
 *
 * Rotation: 5MB per file, keep 5 archives.
 * Levels: prod = info+, dev = debug+.
 * Renderer-side errors flow over IPC and land in the same main.log.
 */

import log from 'electron-log/main.js';

/**
 * Initialise the global logger. Call once before app.whenReady() handlers
 * run so every subsequent module can safely use `log`.
 *
 * @param {object} opts
 * @param {boolean} opts.isDev
 */
export function initLogger({ isDev }) {
  log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB per file
  log.transports.file.level = isDev ? 'debug' : 'info';
  log.transports.console.level = isDev ? 'debug' : 'warn';

  // Initialise IPC bridge so renderer-side `electron-log/renderer` can pipe through.
  log.initialize();

  log.info('--- OpenPen session start ---');
  return log;
}

/**
 * Returns the absolute path of the current log file.
 *
 * @returns {string}
 */
export function getLogFilePath() {
  return log.transports.file.getFile().path;
}

export { log };
