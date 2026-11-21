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
import path from 'node:path';
import log from 'electron-log/main.js';
import { isInsideDir, resolveRealLogDir } from '../helpers/real-log-dir.js';
import { logRejected } from '../../electron/ipc-validation.js';

test('main-process log lines from unit tests land in the run sandbox, not the real home', () => {
  const sandbox = process.env.OPENPEN_UNIT_HOME;
  expect(sandbox).toBeTruthy();

  const marker = `unit-log-isolation-${process.pid}-${Date.now()}`;
  logRejected('test:log-isolation', marker);

  const logFile = log.transports.file.getFile().path;
  expect(path.relative(sandbox, logFile).startsWith('..')).toBe(false);
  // Not "under the home directory": the Windows temp dir is under it too.
  const realLogDir = process.env.OPENPEN_UNIT_REAL_LOG_DIR;
  expect(realLogDir).toBeTruthy();
  // Compare resolved targets so a link from the sandbox into the real dir cannot hide a leak.
  const resolved = (p) => {
    try {
      return fs.realpathSync(p);
    } catch {
      return p;
    }
  };
  expect(isInsideDir(process.platform, resolved(realLogDir), resolved(logFile))).toBe(false);
  expect(fs.readFileSync(logFile, 'utf-8')).toContain(marker);
});

test('a log file inside the real log directory is detected on macOS and Windows', () => {
  const cases = [
    { platform: 'darwin', home: '/Users/dev', real: '/Users/dev/Library/Logs/openpen/main.log' },
    {
      platform: 'win32',
      home: 'C:\\Users\\dev',
      real: 'C:\\Users\\dev\\AppData\\Roaming\\openpen\\logs\\main.log',
    },
  ];
  for (const { platform, home, real } of cases) {
    const dir = resolveRealLogDir({ platform, home, env: {} });
    expect(isInsideDir(platform, dir, real)).toBe(true);
  }
  // A Windows sandbox in %TEMP% is under the home dir but not in the real log dir.
  const winDir = resolveRealLogDir({ platform: 'win32', home: 'C:\\Users\\dev', env: {} });
  const winSandboxLog =
    'C:\\Users\\dev\\AppData\\Local\\Temp\\openpen-unit-home-x\\AppData\\Roaming\\openpen\\logs\\main.log';
  expect(isInsideDir('win32', winDir, winSandboxLog)).toBe(false);
});
