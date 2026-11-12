import fs from 'node:fs';
import path from 'node:path';

/** Total log files kept on disk, the active one included. */
export const MAX_LOG_FILES = 5;

/**
 * Archive path for slot `index`: 0 is `<name>.old<ext>`, then `<name>.old.<n><ext>`.
 * Slot 0 keeps the name electron-log uses by default so upgrades do not orphan it.
 *
 * @param {string} activePath
 * @param {number} index
 * @returns {string}
 */
export function archivePath(activePath, index) {
  const { dir, name, ext } = path.parse(activePath);
  return path.join(dir, index === 0 ? `${name}.old${ext}` : `${name}.old.${index}${ext}`);
}

/**
 * Shift archives one slot older, drop the oldest, then move the active file
 * into slot 0, so at most `maxFiles` files remain (active included).
 *
 * @param {string} activePath
 * @param {number} [maxFiles]
 * @param {Pick<typeof fs, 'existsSync' | 'renameSync' | 'rmSync'>} [fsImpl]
 */
export function rotateLogFiles(activePath, maxFiles = MAX_LOG_FILES, fsImpl = fs) {
  const slots = maxFiles - 1;
  if (slots < 1) {
    return;
  }
  const oldest = archivePath(activePath, slots - 1);
  if (fsImpl.existsSync(oldest)) {
    fsImpl.rmSync(oldest, { force: true });
  }
  for (let i = slots - 2; i >= 0; i--) {
    const from = archivePath(activePath, i);
    if (fsImpl.existsSync(from)) {
      fsImpl.renameSync(from, archivePath(activePath, i + 1));
    }
  }
  fsImpl.renameSync(activePath, archivePath(activePath, 0));
}
