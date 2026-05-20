/**
 * Dev-mode launcher: starts Vite programmatically, then spawns Electron with
 * VITE_DEV_SERVER_URL pointing at whatever port Vite actually grabbed.
 *
 * The previous `concurrently vite + wait-on tcp:5173` setup hardcoded port
 * 5173 in two places (the wait-on probe and electron/main.js). If another
 * project on the same machine already occupied 5173, Vite would silently move
 * to 5174, Electron would still load 5173, and the transparent overlay would
 * render the foreign project's page on top of the desktop with no obvious way
 * to recover. Owning the launch end-to-end means Electron always loads the
 * exact URL Vite chose, regardless of port.
 */
import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const electronBin = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'electron.cmd' : 'electron',
);

const vite = await createServer();
await vite.listen();

const url = vite.resolvedUrls?.local?.[0];
if (!url) {
  console.error('[dev] Vite started but resolvedUrls.local is empty — cannot determine dev server URL');
  await vite.close();
  process.exit(1);
}

vite.printUrls();
console.log(`[dev] launching Electron against ${url}`);

const env = { ...process.env, VITE_DEV_SERVER_URL: url };

// Linux Wayland sessions need ELECTRON_OZONE_PLATFORM_HINT BEFORE the electron
// binary starts; otherwise Chromium registers as an Xwayland client and Mutter
// ignores X11 SHAPE input regions, breaking click-through.
if (process.platform === 'linux' && !env.ELECTRON_OZONE_PLATFORM_HINT) {
  env.ELECTRON_OZONE_PLATFORM_HINT = env.WAYLAND_DISPLAY ? 'wayland' : 'x11';
}

const args = ['.'];
if (process.platform === 'linux') {
  // Sandbox interferes with Ozone Wayland's setIgnoreMouseEvents path: empty
  // input region never reaches the compositor, so clicks on the transparent
  // overlay window are captured by the OpenPen renderer instead of passing
  // through to underlying apps.
  args.push('--no-sandbox');
}

const child = spawn(electronBin, args, {
  stdio: 'inherit',
  env,
  // .cmd shims on Windows need a shell to dispatch (CreateProcess cannot invoke
  // .cmd files directly).
  shell: process.platform === 'win32',
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    await vite.close();
  } catch {
    // ignore — process is exiting anyway
  }
  if (signal) process.kill(process.pid, signal);
}

child.on('exit', async (code, signal) => {
  await shutdown();
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});

process.on('SIGINT', () => { child.kill('SIGINT'); });
process.on('SIGTERM', () => { child.kill('SIGTERM'); });
