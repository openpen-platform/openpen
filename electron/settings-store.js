/**
 * SettingsStore — user-preferences read/write.
 * Persists to userdata/{app_name}/config.json with atomic writes (write-to-tmp
 * then rename) so a crash mid-write cannot corrupt the config file.
 */

import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { SETTINGS, LAYOUT, SHORTCUTS, MODULE } from './ipc-channels.js';
import { recordDiagnosticsEvent } from './diagnostics-manager.js';
import { fsyncDir } from './fs-utils.js';
import { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS } from '../shared/settings-defaults.js';
import { setLocale as setMainLocale } from './i18n/index.js';
import { refreshTrayLocale } from './tray-manager.js';

export { DEFAULT_SETTINGS, DEFAULT_SHORTCUTS };

/** @type {typeof DEFAULT_SETTINGS} In-memory cache of the effective settings. */
let cache = { ...DEFAULT_SETTINGS };

/**
 * Boot-time snapshot of disabledModules — captured once after the first
 * readConfig() call and never mutated again. Used by the renderer to
 * determine whether the user's changes require a restart.
 * @type {string[]}
 */
let INITIAL_DISABLED_MODULES = [];

/** @type {typeof DEFAULT_SHORTCUTS} In-memory cache of user shortcuts. */
let shortcutsCache = { ...DEFAULT_SHORTCUTS };

/** @type {Record<string, string>} namespacedId → custom accelerator override for module shortcuts. */
let moduleShortcutsCache = {};

// ── Control bar layout ─────────────────────────────────────────────────────

/**
 * @typedef {{ id: string; items: string[]; separator?: 'auto'|'always'|'never' }} LayoutGroup
 * @typedef {{ version: 1; groups: LayoutGroup[] }} ControlBarLayout
 */

/** @type {ControlBarLayout} */
const DEFAULT_LAYOUT = { version: 1, groups: [{ id: 'default', items: [], separator: 'auto' }] };

/** @type {ControlBarLayout} */
let layoutCache = structuredClone(DEFAULT_LAYOUT);

// ── Module settings ────────────────────────────────────────────────────────

/** @type {Record<string, Record<string, unknown>>} Persisted settings blobs keyed by moduleId. */
let modulesCache = {};

/** @type {Record<string, { schemaVersion: number }>} Schema version sentinels keyed by moduleId. */
let moduleMetaCache = {};

/**
 * Validate that a parsed value conforms to ControlBarLayout v1.
 * Returns the valid layout, or null if validation fails (L2).
 * @param {unknown} raw
 * @returns {ControlBarLayout | null}
 */
function validateLayout(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const obj = /** @type {Record<string, unknown>} */ (raw);
  if (obj['version'] !== 1) return null;
  if (!Array.isArray(obj['groups'])) return null;
  const ids = [];
  const allItems = [];
  for (const g of obj['groups']) {
    if (!g || typeof g !== 'object') return null;
    if (typeof g['id'] !== 'string' || !/^[a-z][a-z0-9-]*$/.test(g['id'])) return null;
    if (!Array.isArray(g['items'])) return null;
    for (const item of g['items']) {
      if (typeof item !== 'string') return null;
      allItems.push(item);
    }
    if (g['separator'] !== undefined && !['auto', 'always', 'never'].includes(g['separator'])) return null;
    if (g['inset'] !== undefined) {
      const inset = g['inset'];
      if (!inset || typeof inset !== 'object') return null;
      if (typeof inset['enabled'] !== 'boolean') return null;
      if (inset['color'] !== undefined && typeof inset['color'] !== 'string') return null;
    }
    ids.push(g['id']);
  }
  if (!ids.includes('default')) return null;
  if (new Set(ids).size !== ids.length) return null;
  if (new Set(allItems).size !== allItems.length) return null;
  return /** @type {ControlBarLayout} */ (raw);
}

/**
 * Apply L3a non-destructive repairs: ensure 'default' group exists,
 * replace invalid separator values with 'auto'.
 * @param {ControlBarLayout} layout
 * @returns {{ layout: ControlBarLayout; repaired: boolean }}
 */
function repairLayoutL3a(layout) {
  let repaired = false;
  let groups = layout.groups.map((g) => {
    if (g.separator !== undefined && !['auto', 'always', 'never'].includes(g.separator)) {
      repaired = true;
      return { ...g, separator: /** @type {'auto'} */ ('auto') };
    }
    return g;
  });
  if (!groups.some((g) => g.id === 'default')) {
    groups.push({ id: 'default', items: [], separator: 'auto' });
    repaired = true;
  }

  // Backward-compat: ensure the design-canonical 'tools' group has inset enabled.
  // Older persisted layouts predate the per-group inset field; without this repair
  // the visible "grouped tools" container would silently disappear when older
  // configs are loaded by newer code.
  groups = groups.map((g) => {
    if (g.id === 'tools' && g.inset === undefined) {
      repaired = true;
      return { ...g, inset: { enabled: true } };
    }
    return g;
  });

  // Migrate eraser out of the 'tools' group: it must live in its own group with separator: 'always'.
  const toolsGroup = groups.find((g) => g.id === 'tools');
  if (toolsGroup && toolsGroup.items.includes('eraser')) {
    repaired = true;
    const repairedTools = { ...toolsGroup, items: toolsGroup.items.filter((id) => id !== 'eraser') };
    groups = groups.map((g) => (g.id === 'tools' ? repairedTools : g));
    const eraserGroup = groups.find((g) => g.id === 'eraser');
    if (eraserGroup) {
      if (!eraserGroup.items.includes('eraser')) {
        const repairedEraser = { ...eraserGroup, items: [...eraserGroup.items, 'eraser'] };
        groups = groups.map((g) => (g.id === 'eraser' ? repairedEraser : g));
      }
    } else {
      // Insert 'eraser' group right after 'tools' so layout order matches design.
      const toolsIdx = groups.findIndex((g) => g.id === 'tools');
      const insertAt = toolsIdx >= 0 ? toolsIdx + 1 : groups.length - 1;
      groups = [
        ...groups.slice(0, insertAt),
        { id: 'eraser', items: ['eraser'], separator: 'always' },
        ...groups.slice(insertAt),
      ];
    }
  }

  return { layout: { ...layout, groups }, repaired };
}

/**
 * Apply L3b de-duplication: remove item ids that appear in multiple groups
 * (keep last occurrence). When any ghost id exists (count >= 1), trim all ghost ids.
 * @param {ControlBarLayout} layout
 * @param {Set<string>} knownItemIds
 * @returns {{ layout: ControlBarLayout; repaired: boolean }}
 */
function repairLayoutL3b(layout, knownItemIds) {
  let repaired = false;
  const seen = new Set();
  const reversedGroups = [...layout.groups].reverse();
  const deduped = reversedGroups.map((g) => {
    const items = g.items.filter((id) => {
      if (seen.has(id)) { repaired = true; return false; }
      seen.add(id);
      return true;
    });
    return { ...g, items };
  });
  const groups = deduped.reverse();
  const totalItems = groups.flatMap((g) => g.items);
  const ghostCount = totalItems.filter((id) => !knownItemIds.has(id)).length;
  // Trim ghosts only when the layout is heavily polluted (>= 20). Below this
  // threshold ghost ids are silently retained so a temporarily-disabled plugin
  // can restore its position when re-enabled.
  if (ghostCount >= 20) {
    repaired = true;
    const cleaned = groups.map((g) => ({ ...g, items: g.items.filter((id) => knownItemIds.has(id)) }));
    return { layout: { ...layout, groups: cleaned }, repaired };
  }
  return { layout: { ...layout, groups }, repaired };
}

// ── Single writer queue ────────────────────────────────────────────────────

/** @type {Promise<void>} Tail of the write queue. */
let writeQueue = Promise.resolve();
let _quittingAfterFlush = false;

/**
 * Enqueue a write. All writes are serialized — never run concurrently.
 * Uses fsync to guarantee data is flushed to disk before resolving.
 * @param {() => void} writeFn
 */
function enqueueWrite(writeFn) {
  writeQueue = writeQueue.then(() => writeFn()).catch((e) => {
    console.error('[SettingsStore] Write queue error:', e.message);
  });
}

/** Flush any pending writes (called before-quit). */
export async function flushWrites() {
  await writeQueue;
}

/** @returns {string} Path to config.json in userData. */
export function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json');
}

/**
 * Write a backup of the raw config bytes to <userData>/backups/ before a
 * corruption reset. The file name encodes the current timestamp with colons
 * replaced by dashes so it is safe on all filesystems.
 *
 * Uses a synchronous two-step write (.bak.tmp → rename) because this runs on
 * the error/reset path where async queuing is not yet reliable.
 *
 * @param {string} rawBytes  Raw UTF-8 string read from config.json.
 * @returns {string}  Absolute path of the written .bak file.
 */
export function writeBackup(rawBytes) {
  const timestamp = new Date().toISOString().replace(/:/g, '-');
  const backupsDir = path.join(app.getPath('userData'), 'backups');
  const backupPath = path.join(backupsDir, `config.json.${timestamp}.bak`);
  const tmpPath = backupPath + '.tmp';
  try {
    fs.mkdirSync(backupsDir, { recursive: true });
    fs.writeFileSync(tmpPath, rawBytes, 'utf-8');
    fs.renameSync(tmpPath, backupPath);
    fsyncDir(backupsDir);
  } catch (e) {
    console.error('[SettingsStore] Failed to write backup:', e.message);
    try { fs.unlinkSync(tmpPath); } catch (_) { /* ignore */ }
  }
  return backupPath;
}

/**
 * Resolve the currently effective theme, taking 'system' mode into account.
 * @returns {'light' | 'dark'}
 */
export function getEffectiveTheme() {
  if (cache.theme === 'system') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  }
  return /** @type {'light' | 'dark'} */ (cache.theme);
}

/** Read config.json into the cache, apply theme, and register IPC handlers. */
export function initSettingsStore() {
  const isFirstLaunch = !fs.existsSync(getConfigPath());
  readConfig();
  INITIAL_DISABLED_MODULES = [...(cache.disabledModules ?? [])];

  // First launch: pick the user's OS language if it maps to a supported
  // locale, otherwise stay on the 'en' default. Persist so behaviour is
  // stable across subsequent launches.
  if (isFirstLaunch) {
    cache = { ...cache, language: resolveSystemLanguage(app.getLocale()) };
    writeConfig();
  }

  applyTheme(cache.theme);

  // Re-broadcast when the OS theme changes so renderers can update data-theme.
  nativeTheme.on('updated', () => {
    if (cache.theme === 'system') {
      broadcastSettings();
    }
  });

  // Flush any queued writes before the process exits.
  app.on('before-quit', (e) => {
    if (_quittingAfterFlush) return;
    e.preventDefault();
    _quittingAfterFlush = true;
    flushWrites().then(() => app.quit());
  });

  registerIpcHandlers();
}

/** @type {readonly ('en' | 'zh-Hans' | 'zh-Hant' | 'ja')[]} */
const SUPPORTED_LANGUAGES = ['en', 'zh-Hant', 'zh-Hans', 'ja'];

/** Map old region-tag locale values persisted before BCP47 migration to new script tags. */
const LEGACY_LOCALE_MAP = { 'zh-TW': 'zh-Hant', 'zh-CN': 'zh-Hans' };

/**
 * Resolve an OS BCP-47 locale tag to one of the supported app languages.
 * Uses Intl.Locale.maximize() to map region codes to script subtags.
 * Falls back to 'en' for anything unrecognised.
 * @param {string} sysLocale e.g. `'en-US'`, `'zh-TW'`, `'zh-Hans-CN'`, `'ja'`.
 * @returns {'en' | 'zh-Hans' | 'zh-Hant' | 'ja'}
 */
export function resolveSystemLanguage(sysLocale) {
  if (typeof sysLocale !== 'string' || !sysLocale) return 'en';

  // Exact supported tag wins (includes new BCP47 script tags).
  if (SUPPORTED_LANGUAGES.includes(/** @type {any} */ (sysLocale))) {
    return /** @type {any} */ (sysLocale);
  }

  // Use Intl.Locale.maximize() to resolve script subtag from region codes.
  try {
    const maximized = new Intl.Locale(sysLocale).maximize();
    if (maximized.language === 'zh') {
      if (maximized.script === 'Hant') return 'zh-Hant';
      if (maximized.script === 'Hans') return 'zh-Hans';
    }
    if (maximized.language === 'en') return 'en';
    if (maximized.language === 'ja') return 'ja';
  } catch (_) {
    // Invalid locale string — fall through to primary-tag fallback.
  }

  const primary = sysLocale.split('-')[0].toLowerCase();
  if (primary === 'en') return 'en';
  if (primary === 'ja') return 'ja';

  return 'en';
}

function readConfig() {
  const configPath = getConfigPath();
  // Reset to defaults first so a missing/invalid file leaves us in a known state.
  cache = { ...DEFAULT_SETTINGS };
  layoutCache = structuredClone(DEFAULT_LAYOUT);
  shortcutsCache = { ...DEFAULT_SHORTCUTS };
  modulesCache = {};
  moduleMetaCache = {};
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      // L1: JSON parse failure → reset all (defaults already applied above).
      const parsed = JSON.parse(raw);
      // Only merge known keys — drop any unknown fields from older/newer versions.
      const merged = { ...DEFAULT_SETTINGS };
      for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (key in parsed && parsed[key] !== undefined) {
          merged[key] = parsed[key];
        }
      }
      // Silently migrate legacy locale values ('zh-TW' → 'zh-Hant', 'zh-CN' → 'zh-Hans').
      if (merged.language in LEGACY_LOCALE_MAP) {
        merged.language = LEGACY_LOCALE_MAP[merged.language];
      }
      // Silently migrate deprecated barLayout value: 'auto' → 'horizontal'.
      if (merged.barLayout === 'auto') {
        merged.barLayout = 'horizontal';
      }
      // Silently migrate the renamed `animations` setting (true=on) into the
      // semantically inverted `reducedMotion` (true=reduce motion). The new
      // name aligns with the OS-level prefers-reduced-motion media query.
      if ('animations' in parsed && typeof parsed['animations'] === 'boolean' && !('reducedMotion' in parsed)) {
        merged.reducedMotion = !parsed['animations'];
      }
      // Coerce disabledModules: must be a string array; fall back to [] otherwise.
      if (!Array.isArray(merged.disabledModules)) {
        merged.disabledModules = [];
      } else {
        merged.disabledModules = merged.disabledModules.filter((v) => typeof v === 'string');
      }
      // Coerce pluginIdConflictResolutions: must be Record<string, string>; fall back to {}.
      if (
        !merged.pluginIdConflictResolutions ||
        typeof merged.pluginIdConflictResolutions !== 'object' ||
        Array.isArray(merged.pluginIdConflictResolutions)
      ) {
        merged.pluginIdConflictResolutions = {};
      } else {
        const coerced = {};
        for (const [k, v] of Object.entries(merged.pluginIdConflictResolutions)) {
          if (typeof k === 'string' && typeof v === 'string') coerced[k] = v;
        }
        merged.pluginIdConflictResolutions = coerced;
      }
      cache = merged;

      // Layout field: 3-layer corruption detection.
      const rawLayout = parsed['controlBarLayout'];
      if (rawLayout !== undefined) {
        // L2: schema validation failure → reset layout to default.
        const valid = validateLayout(rawLayout);
        if (valid === null) {
          console.warn('[SettingsStore] controlBarLayout failed validation (L2), resetting to default.');
          try {
            const backupPath = writeBackup(raw);
            recordDiagnosticsEvent('L2', backupPath);
          } catch (_) { /* backup is best-effort; never block recovery */ }
          layoutCache = structuredClone(DEFAULT_LAYOUT);
        } else {
          // L3a: non-destructive repairs.
          const { layout: l3a, repaired: repairedA } = repairLayoutL3a(valid);
          if (repairedA) console.info('[SettingsStore] Applied L3a layout repairs.');
          layoutCache = l3a;
        }
      }

      // Shortcuts field: merge known keys, discard unknown/invalid.
      const rawShortcuts = parsed['userShortcuts'];
      if (rawShortcuts && typeof rawShortcuts === 'object') {
        const mergedShortcuts = { ...DEFAULT_SHORTCUTS };
        for (const key of Object.keys(DEFAULT_SHORTCUTS)) {
          if (key in rawShortcuts && typeof rawShortcuts[key] === 'string' && rawShortcuts[key]) {
            mergedShortcuts[key] = rawShortcuts[key];
          }
        }
        shortcutsCache = mergedShortcuts;
      }

      // Module shortcut overrides: plain Record<string, string>, discard non-strings.
      const rawModuleShortcuts = parsed['moduleShortcuts'];
      if (rawModuleShortcuts && typeof rawModuleShortcuts === 'object' && !Array.isArray(rawModuleShortcuts)) {
        moduleShortcutsCache = {};
        for (const [id, accel] of Object.entries(rawModuleShortcuts)) {
          if (typeof id === 'string' && typeof accel === 'string' && accel) {
            moduleShortcutsCache[id] = accel;
          }
        }
      }

      // Module settings: accept plain objects, silently drop non-object entries.
      const rawModules = parsed['modules'];
      if (rawModules && typeof rawModules === 'object' && !Array.isArray(rawModules)) {
        for (const [id, blob] of Object.entries(rawModules)) {
          if (blob && typeof blob === 'object' && !Array.isArray(blob)) {
            modulesCache[id] = /** @type {Record<string, unknown>} */ (blob);
          }
        }
      }
      const rawModuleMeta = parsed['moduleMeta'];
      if (rawModuleMeta && typeof rawModuleMeta === 'object' && !Array.isArray(rawModuleMeta)) {
        for (const [id, meta] of Object.entries(rawModuleMeta)) {
          if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
            const sv = /** @type {any} */ (meta)['schemaVersion'];
            if (typeof sv === 'number') {
              moduleMetaCache[id] = { schemaVersion: sv };
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[SettingsStore] Failed to read config.json (L1):', e.message);
    // Capture the corrupt bytes (already read above before parse failure) and
    // emit a diagnostics event so the user can inspect/report the issue.
    try {
      if (fs.existsSync(configPath)) {
        const rawForBackup = fs.readFileSync(configPath, 'utf-8');
        const backupPath = writeBackup(rawForBackup);
        recordDiagnosticsEvent('L1', backupPath);
      }
    } catch (_) { /* backup is best-effort; never block recovery */ }
    cache = { ...DEFAULT_SETTINGS };
    layoutCache = structuredClone(DEFAULT_LAYOUT);
    shortcutsCache = { ...DEFAULT_SHORTCUTS };
    moduleShortcutsCache = {};
    modulesCache = {};
    moduleMetaCache = {};
  }
}

/** @param {string} theme */
function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark' || theme === 'system') {
    nativeTheme.themeSource = theme;
  }
}

/**
 * @returns {typeof DEFAULT_SETTINGS & { effectiveTheme: 'light' | 'dark' }}
 */
export function getSettings() {
  return { ...cache, effectiveTheme: getEffectiveTheme() };
}

/** @returns {string[]} Defensive copy of the boot-time disabled-modules snapshot. */
export function getInitialDisabledModules() {
  return [...INITIAL_DISABLED_MODULES];
}

/**
 * @template {keyof typeof DEFAULT_SETTINGS} K
 * @param {K} key
 * @returns {typeof DEFAULT_SETTINGS[K]}
 */
export function getSetting(key) {
  return cache[key];
}

/**
 * Merge a patch into the cache, write to disk, and broadcast the update.
 * @param {Partial<typeof DEFAULT_SETTINGS>} patch
 */
export function updateSettings(patch) {
  cache = { ...cache, ...patch };
  if ('theme' in patch) {
    applyTheme(patch.theme);
  }
  if ('language' in patch) {
    BrowserWindow.getAllWindows().forEach((win) =>
      safeSend(win, SETTINGS.LOCALE_CHANGED, cache.language)
    );
    setMainLocale(cache.language);
    refreshTrayLocale();
  }
  writeConfig();
  broadcastSettings();
}

/**
 * Live-preview a settings patch: update the in-memory cache and broadcast,
 * but do NOT persist. Used by the settings panel for instant preview; callers
 * must call revertSettings() if the user cancels.
 * @param {Partial<typeof DEFAULT_SETTINGS>} patch
 */
export function previewSettings(patch) {
  const safePatch = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (key in patch) safePatch[key] = patch[key];
  }
  cache = { ...cache, ...safePatch };
  if ('theme' in safePatch) {
    applyTheme(safePatch.theme);
  }
  if ('language' in safePatch) {
    setMainLocale(cache.language);
    refreshTrayLocale();
  }
  broadcastSettings();
}

/** Re-read from disk and broadcast, undoing any in-memory live-preview. */
export function revertSettings() {
  readConfig();
  applyTheme(cache.theme);
  setMainLocale(cache.language);
  refreshTrayLocale();
  broadcastSettings();
}

/** @returns {typeof DEFAULT_SHORTCUTS} */
export function getShortcuts() {
  return { ...shortcutsCache };
}

/**
 * Update one shortcut entry and persist.
 * @param {string} id
 * @param {string} accelerator
 */
export function setShortcut(id, accelerator) {
  shortcutsCache = { ...shortcutsCache, [id]: accelerator };
  writeConfig();
  broadcastShortcuts();
}

/**
 * Reset one shortcut to its default and persist.
 * @param {string} id
 */
export function resetShortcut(id) {
  const defaultAccel = DEFAULT_SHORTCUTS[/** @type {keyof typeof DEFAULT_SHORTCUTS} */ (id)];
  if (!defaultAccel) return;
  shortcutsCache = { ...shortcutsCache, [id]: defaultAccel };
  writeConfig();
  broadcastShortcuts();
}

/**
 * Send a message to a BrowserWindow, ignoring errors from windows that are
 * destroyed between the isDestroyed() check and the send() call.
 * @param {BrowserWindow} win
 * @param {string} channel
 * @param {unknown} [payload]
 */
function safeSend(win, channel, payload) {
  if (win.isDestroyed()) return;
  try {
    win.webContents.send(channel, payload);
  } catch (_) {
    // Window was destroyed between the isDestroyed() check and send().
  }
}

function broadcastShortcuts() {
  const payload = getShortcuts();
  BrowserWindow.getAllWindows().forEach((win) => safeSend(win, SHORTCUTS.UPDATED, payload));
}

/** @returns {Record<string, string>} */
export function getModuleShortcuts() {
  return { ...moduleShortcutsCache };
}

/** @param {string} namespacedId @param {string} accelerator */
export function setModuleShortcut(namespacedId, accelerator) {
  moduleShortcutsCache = { ...moduleShortcutsCache, [namespacedId]: accelerator };
  writeConfig();
  broadcastModuleShortcuts();
}

/** @param {string} namespacedId */
export function resetModuleShortcut(namespacedId) {
  const { [namespacedId]: _, ...rest } = moduleShortcutsCache;
  moduleShortcutsCache = rest;
  writeConfig();
  broadcastModuleShortcuts();
}

function broadcastModuleShortcuts() {
  const payload = getModuleShortcuts();
  BrowserWindow.getAllWindows().forEach((win) => safeSend(win, SHORTCUTS.MODULE_UPDATED, payload));
}

/**
 * Synchronously serialise every persisted cache into a config.json string.
 * Captured at call time so a later cache mutation (e.g. previewSettings)
 * cannot bleed into a queued async write. Single source of truth for the
 * on-disk JSON shape — all write paths must go through here.
 * @returns {string}
 */
function _serializeConfig() {
  return JSON.stringify({
    ...cache,
    controlBarLayout: structuredClone(layoutCache),
    userShortcuts: { ...shortcutsCache },
    moduleShortcuts: { ...moduleShortcutsCache },
    modules: { ...modulesCache },
    moduleMeta: { ...moduleMetaCache },
  }, null, 2);
}

/** Atomic config.json write: .tmp first + fsync, then rename. Runs inside writeQueue. */
function writeConfig() {
  const snapshot = _serializeConfig();
  enqueueWrite(() => {
    const configPath = getConfigPath();
    const tmpPath = configPath + '.tmp';
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      const fd = fs.openSync(tmpPath, 'w');
      try {
        fs.writeSync(fd, snapshot, 0, 'utf-8');
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmpPath, configPath);
      fsyncDir(path.dirname(configPath));
    } catch (e) {
      console.error('[SettingsStore] Failed to write config.json:', e.message);
      try { fs.unlinkSync(tmpPath); } catch (_) { /* ignore */ }
    }
  });
}

// ── Layout accessors ───────────────────────────────────────────────────────

/** @returns {ControlBarLayout} */
export function getLayout() {
  return structuredClone(layoutCache);
}

/**
 * Replace the layout and persist. Does not broadcast (caller decides).
 * @param {ControlBarLayout} newLayout
 */
export function setLayout(newLayout) {
  layoutCache = structuredClone(newLayout);
  writeConfig();
  broadcastLayout();
}

/**
 * Run L3b repairs using currently-known item ids, persist if repaired.
 * Called by the renderer after modules are loaded.
 * @param {string[]} knownIds
 */
export function repairLayoutWithKnownIds(knownIds) {
  const { layout, repaired } = repairLayoutL3b(layoutCache, new Set(knownIds));
  if (repaired) {
    console.info('[SettingsStore] Applied L3b layout repairs.');
    // Capture pre-repair bytes before overwriting; emit diagnostics event.
    try {
      const configPath = getConfigPath();
      if (fs.existsSync(configPath)) {
        const rawForBackup = fs.readFileSync(configPath, 'utf-8');
        const backupPath = writeBackup(rawForBackup);
        recordDiagnosticsEvent('L3b', backupPath);
      }
    } catch (_) { /* backup is best-effort; never block repair */ }
    layoutCache = layout;
    writeConfig();
    broadcastLayout();
  }
}

// ── Module settings accessors ──────────────────────────────────────────────

/**
 * Return the persisted settings blob and stored schema version for a module.
 * Missing moduleId → empty data + version 1 (first-run defaults).
 * @param {string} moduleId
 * @returns {{ data: Record<string, unknown>; schemaVersion: number }}
 */
export function getModuleSettings(moduleId) {
  return {
    data: modulesCache[moduleId] ?? {},
    schemaVersion: moduleMetaCache[moduleId]?.schemaVersion ?? 1,
  };
}

/**
 * Persist a module's settings blob and schema version. Broadcasts
 * MODULE.SETTINGS_CHANGED to all windows after the write completes.
 * @param {string} moduleId
 * @param {Record<string, unknown>} data
 * @param {number} schemaVersion
 * @returns {Promise<void>}
 */
export function setModuleSettings(moduleId, data, schemaVersion) {
  modulesCache[moduleId] = data;
  moduleMetaCache[moduleId] = { schemaVersion };
  const snapshot = _serializeConfig();
  // Enqueue write; broadcast after the write resolves so listeners
  // receive notification only once the data is durable on disk.
  return new Promise((resolve, reject) => {
    writeQueue = writeQueue
      .then(() => {
        const configPath = getConfigPath();
        const tmpPath = configPath + '.tmp';
        try {
          fs.mkdirSync(path.dirname(configPath), { recursive: true });
          const fd = fs.openSync(tmpPath, 'w');
          try {
            fs.writeSync(fd, snapshot, 0, 'utf-8');
            fs.fsyncSync(fd);
          } finally {
            fs.closeSync(fd);
          }
          fs.renameSync(tmpPath, configPath);
          fsyncDir(path.dirname(configPath));
          broadcastModuleSettingsChanged(moduleId, data);
          resolve();
        } catch (e) {
          console.error('[SettingsStore] Failed to write module settings:', e.message);
          try { fs.unlinkSync(tmpPath); } catch (_) { /* ignore */ }
          reject(e);
        }
      })
      .catch((e) => {
        reject(e);
      });
  });
}

function broadcastModuleSettingsChanged(moduleId, settings) {
  BrowserWindow.getAllWindows().forEach((win) =>
    safeSend(win, MODULE.SETTINGS_CHANGED, { moduleId, settings })
  );
}

function broadcastLayout() {
  const payload = getLayout();
  BrowserWindow.getAllWindows().forEach((win) => safeSend(win, LAYOUT.UPDATED, payload));
}

function broadcastSettings() {
  const payload = getSettings();
  BrowserWindow.getAllWindows().forEach((win) => safeSend(win, SETTINGS.UPDATED, payload));
}

function registerIpcHandlers() {
  ipcMain.handle(MODULE.SETTINGS_GET, (_, moduleId) => {
    if (typeof moduleId !== 'string') return { data: {}, schemaVersion: 1 };
    return getModuleSettings(moduleId);
  });

  ipcMain.handle(MODULE.SETTINGS_SET, (_, { moduleId, settings, schemaVersion }) => {
    if (typeof moduleId !== 'string') return;
    const data = settings && typeof settings === 'object' && !Array.isArray(settings)
      ? /** @type {Record<string, unknown>} */ (settings)
      : {};
    const version = typeof schemaVersion === 'number' ? schemaVersion : 1;
    return setModuleSettings(moduleId, data, version);
  });

  ipcMain.handle(LAYOUT.GET, () => getLayout());

  ipcMain.handle(LAYOUT.SET, (_, newLayout) => {
    const valid = validateLayout(newLayout);
    if (!valid) return { ok: false, error: 'Invalid layout' };
    const { layout: l3a } = repairLayoutL3a(valid);
    setLayout(l3a);
    return { ok: true };
  });

  ipcMain.handle(LAYOUT.REPAIR, (_, knownIds) => {
    if (!Array.isArray(knownIds)) return;
    repairLayoutWithKnownIds(knownIds);
  });

  ipcMain.handle(SETTINGS.GET, () => {
    return getSettings();
  });

  ipcMain.handle(SETTINGS.GET_LOCALE, () => {
    return cache.language;
  });

  ipcMain.handle(SETTINGS.SET, (_, patch) => {
    if (!patch || typeof patch !== 'object') return getSettings();
    const safePatch = {};
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
      if (key in patch) safePatch[key] = patch[key];
    }
    // Coerce disabledModules from renderer: must be a string array.
    if ('disabledModules' in safePatch) {
      if (!Array.isArray(safePatch.disabledModules)) {
        safePatch.disabledModules = [];
      } else {
        safePatch.disabledModules = safePatch.disabledModules.filter((v) => typeof v === 'string');
      }
    }
    updateSettings(safePatch);
    return getSettings();
  });

  ipcMain.handle(MODULE.GET_INITIAL_DISABLED, () => getInitialDisabledModules());

  ipcMain.handle(MODULE.SET_PLUGIN_CONFLICT_RESOLUTIONS, (_, resolutions) => {
    if (!resolutions || typeof resolutions !== 'object' || Array.isArray(resolutions)) return;
    const coerced = {};
    for (const [k, v] of Object.entries(resolutions)) {
      if (typeof k === 'string' && typeof v === 'string') coerced[k] = v;
    }
    updateSettings({ pluginIdConflictResolutions: coerced });
    // Relaunch so the new resolutions take effect in the next boot cycle.
    app.relaunch();
    app.exit(0);
  });

  ipcMain.on(SETTINGS.PREVIEW, (_, patch) => {
    if (!patch || typeof patch !== 'object') return;
    previewSettings(patch);
  });

  ipcMain.handle(SETTINGS.REVERT, () => {
    revertSettings();
    return getSettings();
  });
}
