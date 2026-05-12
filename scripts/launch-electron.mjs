/**
 * Wrapper that spawns electron with platform-specific environment + flags.
 *
 * On Linux Wayland sessions Chromium needs ELECTRON_OZONE_PLATFORM_HINT to be
 * set BEFORE the electron binary starts; setting it from main.js via
 * `app.commandLine.appendSwitch('ozone-platform', ...)` is too late because
 * Chromium parses the ozone backend at process startup, not at app.whenReady.
 * Without the hint, electron registers as an Xwayland client; Mutter ignores
 * X11 SHAPE input regions on Xwayland clients, so click-through breaks and
 * the desktop locks up after collapse.
 *
 * Used as the launch wrapper in the npm `dev` script. Mac is unaffected.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Windows ships .cmd shims under node_modules/.bin (no PATH-style auto
// extension resolution); Unix uses an extension-less symlink.
const electronBin = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron',
);

const env = { ...process.env };
if (process.platform === 'linux' && !env.ELECTRON_OZONE_PLATFORM_HINT) {
  // Pick Wayland when the session advertises it, X11 otherwise. The 'auto'
  // value Electron documents has been empirically unreliable on Mutter —
  // probing WAYLAND_DISPLAY ourselves is more deterministic. User can
  // override by exporting ELECTRON_OZONE_PLATFORM_HINT explicitly.
  env.ELECTRON_OZONE_PLATFORM_HINT = env.WAYLAND_DISPLAY ? 'wayland' : 'x11';
}

const args = ['.'];
if (process.platform === 'linux') {
  // Sandbox interferes with Ozone Wayland's setIgnoreMouseEvents path:
  // empty input region never reaches the compositor, so clicks on the
  // transparent overlay window are captured by the OpenPen renderer
  // instead of passing through to underlying apps.
  args.push('--no-sandbox');
}

// shell: true on Windows so .cmd shims execute through cmd.exe (CreateProcess
// cannot invoke .cmd files directly). Mac/Linux pass through unchanged.
const child = spawn(electronBin, args, {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
