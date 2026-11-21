/**
 * Screen-lock precondition for specs that read real screen pixels.
 *
 * While the macOS session is locked, a desktop capture returns the lock screen
 * (wallpaper only, no menu bar and no app windows), so anything an app draws
 * is absent from the image. Specs that assert on captured pixels call
 * `skipIfScreenLocked(test)` at the start of each such test: the lock state can
 * change during a run, so it is checked per test, not once per file.
 *
 * Detection reads `CGSSessionScreenIsLocked` from the IORegistry root via
 * `ioreg -n Root -d1 -a`. The key is present and true only while locked. When
 * the state cannot be read (not macOS, ioreg missing or failing) the test runs
 * normally, so a real failure is never hidden behind a skip.
 */
import { execFileSync } from 'node:child_process';

const LOCKED_RE = /<key>CGSSessionScreenIsLocked<\/key>\s*<true\/>/;

/**
 * Skip reason for the given platform and `ioreg -n Root -d1 -a` output, or
 * null when the screen is not known to be locked.
 *
 * @param {NodeJS.Platform} platform
 * @param {string | null} ioregOutput
 * @returns {string | null}
 */
export function screenLockSkipReason(platform, ioregOutput) {
  if (platform !== 'darwin' || !ioregOutput) return null;
  if (!LOCKED_RE.test(ioregOutput)) return null;
  return 'The macOS screen is locked (ioreg CGSSessionScreenIsLocked = true): a screen capture shows the lock screen, not the app, so captured pixels cannot be checked.';
}

/** @returns {string | null} */
function readIoregRoot() {
  try {
    return execFileSync('ioreg', ['-n', 'Root', '-d1', '-a'], { encoding: 'utf-8', timeout: 5000 });
  } catch {
    return null;
  }
}

/** @param {typeof import('@playwright/test').test} test */
export function skipIfScreenLocked(test) {
  const reason = process.platform === 'darwin' ? screenLockSkipReason(process.platform, readIoregRoot()) : null;
  test.skip(reason !== null, reason ?? '');
}
