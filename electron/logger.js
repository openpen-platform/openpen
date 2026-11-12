/**
 * Centralised file logger for OpenPen.
 *
 * Writes to OS-standard log paths (electron-log default):
 *   macOS:   ~/Library/Logs/openpen/main.log
 *   Windows: %USERPROFILE%\AppData\Roaming\openpen\logs\main.log
 *   Linux:   ~/.config/openpen/logs/main.log
 *
 * Rotation: 5MB per file, at most 5 log files on disk (the active one included).
 * Levels: prod = info+, dev = debug+.
 * Renderer-side errors flow over IPC and land in the same main.log.
 */

import log from 'electron-log/main.js';
import { rotateLogFiles, MAX_LOG_FILES } from './log-rotation.js';

/**
 * Initialise the global logger. Call once before app.whenReady() handlers
 * run so every subsequent module can safely use `log`.
 *
 * @param {object} opts
 * @param {boolean} opts.isDev
 */
export function initLogger({ isDev }) {
  log.transports.file.maxSize = 5 * 1024 * 1024; // 5 MB per file
  log.transports.file.archiveLogFn = (file) => {
    try {
      rotateLogFiles(file.toString(), MAX_LOG_FILES);
    } catch (err) {
      // Rotation failed (file locked, permissions): trim instead so the log cannot grow unbounded.
      file.crop(Math.min(Math.round(log.transports.file.maxSize / 4), 256 * 1024));
      console.error('Could not rotate log', err);
    }
  };
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
