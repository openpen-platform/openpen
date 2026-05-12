import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, ipcMain } from 'electron';
import { APP_CONFIG } from './ipc-channels.js';

const APP_CONFIG_DEFAULTS = {
  ui: {
    settingsWindow: { opacity: 1 },
    eraser: { caretDirectionMode: /** @type {'directional'|'down'} */ ('directional') },
    popup: { gapPx: 12, safeMarginPx: 8, arrowInsetPx: 16 },
  },
  interaction: {
    drag: { thresholdPx: 4, snapDurationMs: 250, dragEndDelayMs: 50 },
  },
  electron: {
    window: {
      mainAlwaysOnTopLevel: /** @type {'normal'|'floating'|'torn-off-menu'|'modal-panel'|'main-menu'|'status'|'pop-up-menu'|'screen-saver'} */ ('screen-saver'),
      mainAlwaysOnTopRelativeLevel: 1,
      overlayAlwaysOnTopLevel: /** @type {'normal'|'floating'|'torn-off-menu'|'modal-panel'|'main-menu'|'status'|'pop-up-menu'|'screen-saver'} */ ('screen-saver'),
      overlayAlwaysOnTopRelativeLevel: 0,
    },
    devtools: { enabled: false, openMainWindow: true, openOverlayWindow: true, openSettingsWindow: true },
  },
  dev: { strictConfig: false },
};

/**
 * @typedef {{
 *   ui?: {
 *     settingsWindow?: {
 *       opacity?: number,
 *     },
 *     eraser?: {
 *       caretDirectionMode?: 'directional'|'down',
 *     },
 *     popup?: {
 *       gapPx?: number,
 *       safeMarginPx?: number,
 *       arrowInsetPx?: number,
 *     },
 *   },
 *   interaction?: {
 *     drag?: {
 *       thresholdPx?: number,
 *       snapDurationMs?: number,
 *       dragEndDelayMs?: number,
 *     },
 *   },
 *   electron?: {
 *     window?: {
 *       mainAlwaysOnTopLevel?: 'normal'|'floating'|'torn-off-menu'|'modal-panel'|'main-menu'|'status'|'pop-up-menu'|'screen-saver',
 *       mainAlwaysOnTopRelativeLevel?: number,
 *       overlayAlwaysOnTopLevel?: 'normal'|'floating'|'torn-off-menu'|'modal-panel'|'main-menu'|'status'|'pop-up-menu'|'screen-saver',
 *       overlayAlwaysOnTopRelativeLevel?: number,
 *     },
 *     devtools?: {
 *       enabled?: boolean,
 *       openMainWindow?: boolean,
 *       openOverlayWindow?: boolean,
 *       openSettingsWindow?: boolean,
 *     },
 *   },
 *   dev?: {
 *     strictConfig?: boolean,
 *   },
 * }} AppConfigInput
 */

/** @type {AppConfigInput & typeof APP_CONFIG_DEFAULTS} */
let appConfig = deepFreeze(deepClone(APP_CONFIG_DEFAULTS));
let ipcRegistered = false;

const ALWAYS_ON_TOP_LEVELS = new Set([
  'normal',
  'floating',
  'torn-off-menu',
  'modal-panel',
  'main-menu',
  'status',
  'pop-up-menu',
  'screen-saver',
]);

/**
 * Load app.config.js, merge with defaults, validate, and expose via IPC.
 */
export async function initConfigLoader() {
  const configPath = getAppConfigPath();
  const rawConfig = await loadRawAppConfig(configPath);
  const resolved = resolveAppConfig(rawConfig);

  for (const msg of resolved.warnings) {
    console.warn(`[AppConfig] ${msg}`);
  }

  const strictConfig = resolved.config.dev.strictConfig;
  if (resolved.errors.length > 0) {
    const errorMessage = resolved.errors.join(' | ');
    if (strictConfig) throw new Error(`[AppConfig] ${errorMessage}`);
    console.warn(`[AppConfig] ${errorMessage} (fallback to defaults)`);
  }

  appConfig = deepFreeze(resolved.config);
  registerIpcHandlers();
}

/**
 * @returns {AppConfigInput & typeof APP_CONFIG_DEFAULTS}
 */
export function getAppConfig() {
  return appConfig;
}

/**
 * Resolve the app.config.js path actually used at runtime.
 * Override via OPENPEN_APP_CONFIG_PATH (absolute, or relative to appPath).
 * @returns {string}
 */
export function getAppConfigPath() {
  const override = process.env.OPENPEN_APP_CONFIG_PATH;
  if (override && typeof override === 'string') {
    return path.isAbsolute(override) ? override : path.join(app.getAppPath(), override);
  }

  const appPath = app.getAppPath();
  const candidates = [
    path.join(appPath, 'app.config.js'),
    path.join(appPath, '..', 'app.config.js'),
    path.join(process.cwd(), 'app.config.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

/**
 * Pure merge-and-validate entry point; exposed for unit tests.
 * @param {unknown} rawConfig
 * @returns {{ config: AppConfigInput & typeof APP_CONFIG_DEFAULTS, warnings: string[], errors: string[] }}
 */
export function resolveAppConfig(rawConfig) {
  const warnings = [];
  const errors = [];
  const clonedDefaults = deepClone(APP_CONFIG_DEFAULTS);
  const merged = mergeKnown(clonedDefaults, rawConfig, '', warnings);
  const validated = applyValidation(merged, warnings, errors);
  return { config: validated, warnings, errors };
}

/**
 * @param {string} configPath
 * @returns {Promise<unknown>}
 */
async function loadRawAppConfig(configPath) {
  if (!fs.existsSync(configPath)) return {};

  try {
    const stat = fs.statSync(configPath);
    const url = `${pathToFileURL(configPath).href}?mtime=${stat.mtimeMs}`;
    const mod = await import(url);
    if (!('default' in mod)) {
      console.warn('[AppConfig] app.config.js missing default export, fallback to defaults');
      return {};
    }
    return mod.default ?? {};
  } catch (error) {
    console.warn(`[AppConfig] Failed to load ${configPath}: ${error?.message || error}`);
    return {};
  }
}

function registerIpcHandlers() {
  if (ipcRegistered) return;
  ipcMain.handle(APP_CONFIG.GET, () => getAppConfig());
  ipcRegistered = true;
}

/**
 * Merge userConfig into defaults key-by-key. Unknown keys are dropped with a
 * warning so a typo like `dv.strictConfig` doesn't silently no-op.
 * @param {Record<string, any>} defaults
 * @param {unknown} userConfig
 * @param {string} basePath
 * @param {string[]} warnings
 * @returns {Record<string, any>}
 */
function mergeKnown(defaults, userConfig, basePath, warnings) {
  const user = isPlainObject(userConfig) ? userConfig : {};
  const output = {};

  for (const key of Object.keys(defaults)) {
    const pathKey = basePath ? `${basePath}.${key}` : key;
    const defaultVal = defaults[key];
    const userHasKey = Object.prototype.hasOwnProperty.call(user, key);
    const userVal = userHasKey ? user[key] : undefined;

    if (isPlainObject(defaultVal)) {
      output[key] = mergeKnown(defaultVal, userVal, pathKey, warnings);
      continue;
    }

    output[key] = userHasKey ? userVal : defaultVal;
  }

  for (const key of Object.keys(user)) {
    if (Object.prototype.hasOwnProperty.call(defaults, key)) continue;
    const pathKey = basePath ? `${basePath}.${key}` : key;
    warnings.push(`Unknown key "${pathKey}" is ignored.`);
  }

  return output;
}

/**
 * @param {Record<string, any>} config
 * @param {string[]} warnings
 * @param {string[]} errors
 * @returns {AppConfigInput & typeof APP_CONFIG_DEFAULTS}
 */
function applyValidation(config, warnings, errors) {
  const out = deepClone(APP_CONFIG_DEFAULTS);

  out.ui.settingsWindow.opacity = readNumber(config, 'ui.settingsWindow.opacity', {
    min: 0.1, max: 1.0, fallback: out.ui.settingsWindow.opacity, warnings, errors,
  });

  const caretMode = config.ui.eraser.caretDirectionMode;
  if (caretMode === 'directional' || caretMode === 'down') {
    out.ui.eraser.caretDirectionMode = caretMode;
  } else {
    errors.push('ui.eraser.caretDirectionMode must be "directional" or "down"');
  }

  out.ui.popup.gapPx = readNumber(config, 'ui.popup.gapPx', {
    min: 0, max: 64, fallback: out.ui.popup.gapPx, warnings, errors,
  });
  out.ui.popup.safeMarginPx = readNumber(config, 'ui.popup.safeMarginPx', {
    min: 0, max: 64, fallback: out.ui.popup.safeMarginPx, warnings, errors,
  });
  out.ui.popup.arrowInsetPx = readNumber(config, 'ui.popup.arrowInsetPx', {
    min: 0, max: 64, fallback: out.ui.popup.arrowInsetPx, warnings, errors,
  });

  out.interaction.drag.thresholdPx = readNumber(config, 'interaction.drag.thresholdPx', {
    min: 0, max: 40, fallback: out.interaction.drag.thresholdPx, warnings, errors,
  });
  out.interaction.drag.snapDurationMs = readNumber(config, 'interaction.drag.snapDurationMs', {
    min: 10, max: 2000, fallback: out.interaction.drag.snapDurationMs, warnings, errors,
  });
  out.interaction.drag.dragEndDelayMs = readNumber(config, 'interaction.drag.dragEndDelayMs', {
    min: 0, max: 1000, fallback: out.interaction.drag.dragEndDelayMs, warnings, errors,
  });

  out.electron.window.mainAlwaysOnTopLevel = readAlwaysOnTopLevel(
    config,
    'electron.window.mainAlwaysOnTopLevel',
    out.electron.window.mainAlwaysOnTopLevel,
    errors
  );
  out.electron.window.mainAlwaysOnTopRelativeLevel = readNumber(
    config,
    'electron.window.mainAlwaysOnTopRelativeLevel',
    { min: 0, max: 10, fallback: out.electron.window.mainAlwaysOnTopRelativeLevel, warnings, errors }
  );
  out.electron.window.overlayAlwaysOnTopLevel = readAlwaysOnTopLevel(
    config,
    'electron.window.overlayAlwaysOnTopLevel',
    out.electron.window.overlayAlwaysOnTopLevel,
    errors
  );
  out.electron.window.overlayAlwaysOnTopRelativeLevel = readNumber(
    config,
    'electron.window.overlayAlwaysOnTopRelativeLevel',
    { min: 0, max: 10, fallback: out.electron.window.overlayAlwaysOnTopRelativeLevel, warnings, errors }
  );

  out.electron.devtools.enabled = readBoolean(
    config,
    'electron.devtools.enabled',
    out.electron.devtools.enabled,
    errors
  );
  out.electron.devtools.openMainWindow = readBoolean(
    config,
    'electron.devtools.openMainWindow',
    out.electron.devtools.openMainWindow,
    errors
  );
  out.electron.devtools.openOverlayWindow = readBoolean(
    config,
    'electron.devtools.openOverlayWindow',
    out.electron.devtools.openOverlayWindow,
    errors
  );
  out.electron.devtools.openSettingsWindow = readBoolean(
    config,
    'electron.devtools.openSettingsWindow',
    out.electron.devtools.openSettingsWindow,
    errors
  );

  if (typeof config.dev.strictConfig === 'boolean') {
    out.dev.strictConfig = config.dev.strictConfig;
  } else {
    errors.push('dev.strictConfig must be boolean');
  }

  return out;
}

/**
 * @param {Record<string, any>} config
 * @param {string} pathKey
 * @param {{ min:number, max:number, fallback:number, warnings:string[], errors:string[] }} options
 */
function readNumber(config, pathKey, options) {
  const value = readPath(config, pathKey);
  if (!Number.isFinite(value)) {
    options.errors.push(`${pathKey} must be a finite number`);
    return options.fallback;
  }
  if (value < options.min || value > options.max) {
    options.warnings.push(`${pathKey} out of range [${options.min}, ${options.max}], fallback to ${options.fallback}`);
    return options.fallback;
  }
  return value;
}

/**
 * @param {Record<string, any>} config
 * @param {string} pathKey
 * @param {string} fallback
 * @param {string[]} errors
 */
function readAlwaysOnTopLevel(config, pathKey, fallback, errors) {
  const value = readPath(config, pathKey);
  if (typeof value !== 'string' || !ALWAYS_ON_TOP_LEVELS.has(value)) {
    errors.push(`${pathKey} is invalid`);
    return fallback;
  }
  return value;
}

/**
 * @param {Record<string, any>} config
 * @param {string} pathKey
 * @param {boolean} fallback
 * @param {string[]} errors
 */
function readBoolean(config, pathKey, fallback, errors) {
  const value = readPath(config, pathKey);
  if (typeof value !== 'boolean') {
    errors.push(`${pathKey} must be boolean`);
    return fallback;
  }
  return value;
}

/**
 * @param {Record<string, any>} obj
 * @param {string} dotPath
 */
function readPath(obj, dotPath) {
  const keys = dotPath.split('.');
  let current = obj;
  for (const key of keys) {
    if (!isPlainObject(current) && !Array.isArray(current)) return undefined;
    current = current[key];
  }
  return current;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepClone(value) {
  if (Array.isArray(value)) {
    return /** @type {T} */ (value.map((item) => deepClone(item)));
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value)) out[key] = deepClone(value[key]);
    return /** @type {T} */ (out);
  }
  return value;
}

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (isPlainObject(value) || Array.isArray(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      // @ts-ignore - runtime guard already handled
      deepFreeze(value[key]);
    }
  }
  return value;
}
