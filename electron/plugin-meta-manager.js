/**
 * PluginMetaManager — installedAt timestamp sidecar.
 *
 * Maintains <userData>/plugin-meta.json to record the first time each
 * plugin id is observed on disk. The sidecar is written on first scan
 * only — existing entries are never overwritten so the install timestamp
 * is preserved across reinstalls and app restarts.
 *
 * The sidecar is always read fresh on init and written atomically
 * (.tmp → fsyncSync → closeSync → renameSync → fsyncDir).
 * If the sidecar itself is missing or unparseable it silently resets
 * to an empty map — no recursive backup.
 */

import { app, ipcMain } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { PLUGIN_META } from './ipc-channels.js';
import { fsyncDir } from './fs-utils.js';
import { MODULE_ID_RE } from './plugin-id-validator.js';

/** @type {Record<string, { installedAt: string }>} */
let metaMap = {}

/** @returns {string} */
function getMetaPath() {
  return path.join(app.getPath('userData'), 'plugin-meta.json')
}

/**
 * Hydrate metaMap from disk. Silently resets to {} on any error.
 */
function loadMeta() {
  const filePath = getMetaPath()
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        metaMap = parsed
        return
      }
    }
  } catch (_) {
    // Silent reset — do not recursively backup plugin-meta.json itself.
  }
  metaMap = {}
}

/**
 * Atomically persist metaMap to plugin-meta.json (.tmp → rename).
 */
function persistMeta() {
  const filePath = getMetaPath()
  const tmpPath = filePath + '.tmp'
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    const data = JSON.stringify(metaMap, null, 2)
    const fd = fs.openSync(tmpPath, 'w')
    try {
      fs.writeSync(fd, data, 0, 'utf-8')
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    fs.renameSync(tmpPath, filePath)
    fsyncDir(path.dirname(filePath))
  } catch (e) {
    console.error('[PluginMetaManager] Failed to write plugin-meta.json:', e.message)
    try { fs.unlinkSync(tmpPath) } catch (_) { /* ignore */ }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialise the manager: hydrate from disk and register IPC handler.
 * Must be called before initModuleManifestLoader() so ensurePluginInstalledAt
 * calls during the first scan land on an already-initialised manager.
 */
export function initPluginMetaManager() {
  loadMeta()
  ipcMain.handle(PLUGIN_META.GET_ALL, () => getAllPluginMeta())
}

/**
 * Return the installedAt timestamp for a plugin id, or null if unknown.
 * @param {string} pluginId
 * @returns {string | null}
 */
export function getPluginInstalledAt(pluginId) {
  return metaMap[pluginId]?.installedAt ?? null
}

/**
 * Write a new installedAt entry the first time a plugin id is seen.
 * Existing entries are never rewritten — first observed time is preserved
 * across reinstalls and repeated app starts.
 * @param {string} pluginId
 * @returns {string} the (existing or newly-written) ISO8601 timestamp
 */
export function ensurePluginInstalledAt(pluginId) {
  if (!MODULE_ID_RE.test(pluginId)) {
    throw new Error(`[PluginMetaManager] Invalid plugin id: ${pluginId}`)
  }
  if (metaMap[pluginId]) {
    return metaMap[pluginId].installedAt
  }
  const installedAt = new Date().toISOString()
  metaMap[pluginId] = { installedAt }
  persistMeta()
  return installedAt
}

/**
 * Return a shallow copy of the full plugin-meta map.
 * @returns {Record<string, { installedAt: string }>}
 */
export function getAllPluginMeta() {
  return { ...metaMap }
}
