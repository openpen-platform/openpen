/**
 * Bundled plugins: first-launch seeding.
 *
 * The installer (and the dev checkout) carry a folder of plugins laid out like
 * ~/.openpen/plugins, plus a manifest.json listing {id, version} pairs. Each
 * listed plugin is copied into the user's plugins folder once.
 *
 * A plugin is seeded at most once per user: its id is recorded in a state
 * file under userData right after it is handled. That makes a later removal
 * stick across app updates, and a plugin the user installed before the
 * bundled copy existed is recorded without being touched (version and
 * settings stay as they are).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fsyncDir } from './fs-utils.js';
import { MODULE_ID_RE } from './plugin-id-validator.js';

export const BUNDLED_STATE_FILE = 'bundled-plugins-state.json';

/** @param {string} statePath */
function readState(statePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    if (parsed && typeof parsed === 'object' && parsed.handled && typeof parsed.handled === 'object') {
      return { handled: { ...parsed.handled } };
    }
  } catch (_) {
    // Missing or unreadable state is treated as a first launch.
  }
  return { handled: {} };
}

/** @param {string} statePath @param {{ handled: Record<string, unknown> }} state */
function writeState(statePath, state) {
  const tmpPath = `${statePath}.tmp`;
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeSync(fd, JSON.stringify(state, null, 2), 0, 'utf-8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, statePath);
  fsyncDir(path.dirname(statePath));
}

/** @param {string} bundledDir */
function readBundledList(bundledDir) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(bundledDir, 'manifest.json'), 'utf-8'));
    if (!Array.isArray(parsed?.plugins)) return [];
    return parsed.plugins.filter(
      (p) => p && typeof p.id === 'string' && typeof p.version === 'string' && MODULE_ID_RE.test(p.id),
    );
  } catch (_) {
    return [];
  }
}

/**
 * Copy each bundled plugin the user has never been offered into pluginsDir.
 *
 * @param {{ bundledDir: string, pluginsDir: string, statePath: string, log?: { info: Function, warn: Function } }} opts
 * @returns {{ installed: string[], adopted: string[], skipped: string[] }}
 */
export function seedBundledPlugins({ bundledDir, pluginsDir, statePath, log }) {
  const result = { installed: [], adopted: [], skipped: [] };
  const list = readBundledList(bundledDir);
  if (list.length === 0) return result;

  const state = readState(statePath);
  for (const { id, version } of list) {
    if (state.handled[id]) {
      result.skipped.push(id);
      continue;
    }
    const src = path.join(bundledDir, id);
    const dest = path.join(pluginsDir, id);
    if (fs.existsSync(path.join(dest, 'plugin.json'))) {
      state.handled[id] = { via: 'existing' };
      writeState(statePath, state);
      result.adopted.push(id);
      continue;
    }
    if (!fs.existsSync(path.join(src, 'plugin.json'))) {
      log?.warn?.(`[BundledPlugins] ${id} is listed but missing from ${bundledDir}`);
      continue;
    }
    try {
      const tmp = `${dest}.seeding`;
      fs.rmSync(tmp, { recursive: true, force: true });
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.cpSync(src, tmp, { recursive: true });
      fs.renameSync(tmp, dest);
    } catch (err) {
      log?.warn?.(`[BundledPlugins] could not install ${id}: ${err?.message}`);
      continue;
    }
    state.handled[id] = { via: 'bundled', version };
    writeState(statePath, state);
    result.installed.push(id);
  }
  return result;
}
