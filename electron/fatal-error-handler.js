/**
 * Single disposition for an uncaught exception in the main process: record it,
 * restore the OS cursor, then exit non-zero. Swallowing the error would leave
 * a zombie process whose crash no supervisor or user can detect.
 *
 * @param {unknown} err
 * @param {{ log: { error: (...args: unknown[]) => void }, showOsCursor: () => void, exit: (code: number) => void }} deps
 */
export function handleUncaughtException(err, { log, showOsCursor, exit }) {
  try {
    log.error('uncaughtException, exiting:', err);
  } finally {
    try {
      showOsCursor();
    } finally {
      exit(1);
    }
  }
}
