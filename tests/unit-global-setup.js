/**
 * Vitest global setup: give the unit run a throwaway home directory.
 *
 * Main-process modules under test log through electron-log. Outside Electron
 * it resolves its file from the home directory (macOS ~/Library/Logs/openpen,
 * Linux $XDG_CONFIG_HOME or ~/.config/openpen/logs, Windows %APPDATA%), so
 * without this a test that triggers a warning — a rejected IPC payload, a
 * failed shortcut registration — appends to the developer's real main.log.
 *
 * The variables are set before the worker pool starts, so every worker and
 * every module instance (including ones re-imported after vi.resetModules)
 * resolves into the sandbox. The sandbox is exposed as OPENPEN_UNIT_HOME and
 * removed on teardown, so the run leaves the machine as it found it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HOME_ENV_KEYS = ['HOME', 'USERPROFILE', 'APPDATA', 'XDG_CONFIG_HOME', 'OPENPEN_UNIT_HOME'];

export default function setup() {
  const previous = Object.fromEntries(HOME_ENV_KEYS.map((key) => [key, process.env[key]]));
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-unit-home-'));

  process.env.HOME = sandbox;
  process.env.USERPROFILE = sandbox;
  process.env.APPDATA = path.join(sandbox, 'AppData', 'Roaming');
  process.env.XDG_CONFIG_HOME = path.join(sandbox, '.config');
  process.env.OPENPEN_UNIT_HOME = sandbox;

  return () => {
    for (const key of HOME_ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    // A cleanup failure is a warning, not a failed run.
    try {
      fs.rmSync(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (error) {
      console.warn(`[unit] Could not remove sandbox home ${sandbox}: ${error.message}`);
    }
  };
}
