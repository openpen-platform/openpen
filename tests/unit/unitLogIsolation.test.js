// @vitest-environment node
/**
 * Unit runs must not write into the developer's real log directory.
 *
 * Main-process modules log through electron-log, which outside Electron
 * resolves its file under the home directory (macOS: ~/Library/Logs/openpen).
 * tests/unit-global-setup.js points the home directory at a throwaway sandbox
 * for the whole run, so a rejected IPC payload logged by a test lands there.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import log from 'electron-log/main.js';
import { logRejected } from '../../electron/ipc-validation.js';

test('main-process log lines from unit tests land in the run sandbox, not the real home', () => {
  const sandbox = process.env.OPENPEN_UNIT_HOME;
  expect(sandbox).toBeTruthy();

  const marker = `unit-log-isolation-${process.pid}-${Date.now()}`;
  logRejected('test:log-isolation', marker);

  const logFile = log.transports.file.getFile().path;
  expect(path.relative(sandbox, logFile).startsWith('..')).toBe(false);
  expect(logFile.startsWith(os.userInfo().homedir + path.sep)).toBe(false);
  expect(fs.readFileSync(logFile, 'utf-8')).toContain(marker);
});
