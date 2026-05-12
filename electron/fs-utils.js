/**
 * Tiny filesystem helpers shared across persistence sites (settings-store,
 * diagnostics-manager). Kept in a separate module so the consumers do not
 * form a circular dependency.
 */

import fs from 'node:fs';

/**
 * fsync a directory after a rename so the entry is durable across power loss.
 *
 * The standard atomic-write idiom (write tmp → fsync file → rename → fsync
 * dir) needs the dir-level flush; otherwise the rename can be lost on crash
 * even though the file content is on disk. Best-effort: Windows and some
 * network filesystems do not support directory fsync — swallow the error
 * because the rename itself already happened.
 *
 * @param {string} dirPath
 */
export function fsyncDir(dirPath) {
  try {
    const fd = fs.openSync(dirPath, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  } catch (_) {
    /* best-effort — platform may not support directory fsync */
  }
}
