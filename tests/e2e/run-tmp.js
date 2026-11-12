/**
 * Run-scoped temp root for the e2e suite.
 *
 * Specs and launch.js create throwaway directories (app userData, seeded
 * config, relaunch fixtures) with `fs.mkdtempSync(path.join(os.tmpdir(), ...))`
 * and none of them removes its own, each launched app adds roughly 8 MB to the
 * system temp dir unless the run confines them to one removable root.
 *
 * `enterRunTmpRoot()` creates one directory for the whole run and points
 * TMPDIR (POSIX) and TEMP/TMP (Windows) at it. `os.tmpdir()` reads those
 * variables on every call and Playwright workers inherit the environment, so
 * everything created through `os.tmpdir()` during the run lands inside the
 * root. `dispose()` restores the variables and removes only that root, never
 * any other `openpen-e2e-*` directory a previous run or another process left.
 * It never throws: a failed removal is reported as a warning.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const RUN_TMP_PREFIX = 'openpen-e2e-run-';
const TMP_ENV_KEYS = ['TMPDIR', 'TEMP', 'TMP'];

/**
 * @returns {{ root: string, dispose: () => void }}
 */
export function enterRunTmpRoot() {
  const previous = Object.fromEntries(TMP_ENV_KEYS.map((key) => [key, process.env[key]]));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), RUN_TMP_PREFIX));
  for (const key of TMP_ENV_KEYS) process.env[key] = root;

  let disposed = false;
  return {
    root,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const key of TMP_ENV_KEYS) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
      // Retries cover Windows, where a just-closed Electron can hold handles briefly.
      // A cleanup that still fails is only a warning: it must not turn a passing run red.
      try {
        fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch (error) {
        console.warn(`[e2e] Could not remove run temp root ${root}: ${error.message}`);
      }
    },
  };
}
