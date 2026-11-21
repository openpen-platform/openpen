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
 *
 * A run that is killed from outside (the test queue's 15-minute cap, a closed
 * terminal) never reaches `dispose()`, so its root stays behind. Each root
 * therefore carries a marker file naming the owning process, and
 * `sweepStaleRunRoots()` (called at the start of the next run) removes roots
 * whose marker proves they are ours and whose owner is gone. Anything without
 * a matching marker, or whose owner is still alive (a concurrent run), is left.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const RUN_TMP_PREFIX = 'openpen-e2e-run-';
export const RUN_MARKER_FILE = 'run-marker.json';
const RUN_MARKER_SIGNATURE = 'openpen-e2e-run-root';
const TMP_ENV_KEYS = ['TMPDIR', 'TEMP', 'TMP'];

/**
 * @returns {{ root: string, dispose: () => void }}
 */
export function enterRunTmpRoot() {
  const previous = Object.fromEntries(TMP_ENV_KEYS.map((key) => [key, process.env[key]]));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), RUN_TMP_PREFIX));
  fs.writeFileSync(
    path.join(root, RUN_MARKER_FILE),
    JSON.stringify({ signature: RUN_MARKER_SIGNATURE, pid: process.pid, root, createdAt: Date.now() }),
  );
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
        removeRunRoot(root);
      } catch (error) {
        console.warn(`[e2e] Could not remove run temp root ${root}: ${error.message}`);
      }
    },
  };
}

/**
 * Delete a run root with its marker file last. If a child cannot be removed
 * (a just-killed Electron still holding a handle), the marker survives and a
 * later sweep can still prove the leftover is ours and retry.
 */
function removeRunRoot(root) {
  const opts = { recursive: true, force: true, maxRetries: 5, retryDelay: 200 };
  for (const entry of fs.readdirSync(root)) {
    if (entry !== RUN_MARKER_FILE) fs.rmSync(path.join(root, entry), opts);
  }
  fs.rmSync(path.join(root, RUN_MARKER_FILE), opts);
  fs.rmSync(root, opts);
}

function defaultIsPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: the process exists but belongs to someone else, so it is alive.
    return error.code === 'EPERM';
  }
}

/**
 * Remove run roots left by a run that was killed before `dispose()`.
 *
 * A directory is removed only when ALL hold, so a foreign folder can never
 * match: it is a direct child of `tmpDir`, a real directory (not a symlink),
 * named with RUN_TMP_PREFIX, holds a marker file with our signature whose
 * recorded `root` equals its own path, and the recorded owner pid is dead.
 * Never throws; failures are warnings.
 *
 * @param {{ tmpDir?: string, isPidAlive?: (pid: number) => boolean }} [options]
 * @returns {{ removed: string[], kept: string[] }}
 */
export function sweepStaleRunRoots({ tmpDir = os.tmpdir(), isPidAlive = defaultIsPidAlive } = {}) {
  const removed = [];
  const kept = [];
  let names;
  try {
    names = fs.readdirSync(tmpDir);
  } catch (error) {
    console.warn(`[e2e] Could not list ${tmpDir} for stale run roots: ${error.message}`);
    return { removed, kept };
  }
  for (const name of names) {
    if (!name.startsWith(RUN_TMP_PREFIX)) continue;
    const dir = path.join(tmpDir, name);
    try {
      if (!fs.lstatSync(dir).isDirectory()) continue;
      const marker = JSON.parse(fs.readFileSync(path.join(dir, RUN_MARKER_FILE), 'utf-8'));
      const ours =
        marker?.signature === RUN_MARKER_SIGNATURE &&
        Number.isInteger(marker.pid) &&
        path.resolve(marker.root) === path.resolve(dir);
      if (!ours || isPidAlive(marker.pid)) {
        kept.push(dir);
        continue;
      }
      removeRunRoot(dir);
      removed.push(dir);
    } catch (error) {
      // No readable marker means we cannot prove the folder is ours: leave it.
      if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) {
        console.warn(`[e2e] Could not sweep ${dir}: ${error.message}`);
      }
      kept.push(dir);
    }
  }
  return { removed, kept };
}
