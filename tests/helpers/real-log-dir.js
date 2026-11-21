/**
 * Where electron-log writes the main-process log outside Electron, i.e. the
 * developer's real log directory. Mirrors electron-log's getAppLogPath():
 *   macOS   <home>/Library/Logs/<app>
 *   Windows %APPDATA% (or <home>/AppData/Roaming) /<app>/logs
 *   Linux   $XDG_CONFIG_HOME (or <home>/.config) /<app>/logs
 * `platform` selects the path flavour so every OS rule is testable anywhere.
 */
import path from 'node:path';

export function resolveRealLogDir({ platform, home, env = {}, appName = 'openpen' }) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  if (platform === 'darwin') return p.join(home, 'Library/Logs', appName);
  if (platform === 'win32') return p.join(env.APPDATA || p.join(home, 'AppData/Roaming'), appName, 'logs');
  return p.join(env.XDG_CONFIG_HOME || p.join(home, '.config'), appName, 'logs');
}

/** True when `file` is `dir` itself or lies below it (Windows compares case-insensitively). */
export function isInsideDir(platform, dir, file) {
  const p = platform === 'win32' ? path.win32 : path.posix;
  const fold = (s) => (platform === 'win32' ? s.toLowerCase() : s);
  const rel = p.relative(fold(p.resolve(dir)), fold(p.resolve(file)));
  return rel === '' || (rel.split(p.sep)[0] !== '..' && !p.isAbsolute(rel));
}
