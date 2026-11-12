/**
 * Config-file versioning. The top-level `configVersion` field in config.json
 * records which file shape the data was written in; files without it predate
 * the field and are treated as version 0. Each step in MIGRATIONS lifts a
 * parsed config one version up, so loading an old file runs the steps from its
 * version up to CURRENT_CONFIG_VERSION in order.
 *
 * Steps operate on the raw parsed JSON (before known keys are merged over the
 * defaults) and must not mutate their input.
 */

/** Version written to every config.json this build saves. */
export const CURRENT_CONFIG_VERSION = 1;

/** Map old region-tag locale values persisted before BCP47 migration to new script tags. */
const LEGACY_LOCALE_MAP = { 'zh-TW': 'zh-Hant', 'zh-CN': 'zh-Hans' };

/**
 * @typedef {Record<string, any>} RawConfig
 * @typedef {{ config: RawConfig; changed: boolean }} MigrationResult
 */

/**
 * v0 to v1: fold the legacy values of three settings into their current form.
 * @param {RawConfig} config
 * @returns {MigrationResult}
 */
function migrateV0ToV1(config) {
  const next = { ...config };
  let changed = false;
  // 'zh-TW' becomes 'zh-Hant', 'zh-CN' becomes 'zh-Hans'.
  if (typeof next['language'] === 'string' && next['language'] in LEGACY_LOCALE_MAP) {
    next['language'] = LEGACY_LOCALE_MAP[next['language']];
    changed = true;
  }
  // Deprecated barLayout value: 'auto' becomes 'horizontal'.
  if (next['barLayout'] === 'auto') {
    next['barLayout'] = 'horizontal';
    changed = true;
  }
  // `animations` (true=on) was renamed to the inverted `reducedMotion`
  // (true=reduce motion). An explicit `reducedMotion` wins over the old key.
  if ('animations' in next) {
    if (typeof next['animations'] === 'boolean' && !('reducedMotion' in next)) {
      next['reducedMotion'] = !next['animations'];
    }
    delete next['animations'];
    changed = true;
  }
  return { config: next, changed };
}

/** @type {Array<(config: RawConfig) => MigrationResult>} MIGRATIONS[n] lifts version n to n + 1. */
const MIGRATIONS = [migrateV0ToV1];

/**
 * Read the file's version. A missing or non-integer / negative value is treated
 * as version 0 so that a damaged marker never blocks loading.
 * @param {RawConfig} config
 * @returns {number}
 */
export function getConfigVersion(config) {
  const v = config['configVersion'];
  return Number.isInteger(v) && v >= 0 ? v : 0;
}

/**
 * Lift a parsed config to CURRENT_CONFIG_VERSION. A version newer than this
 * build knows is returned untouched; the caller decides how to treat it.
 * @param {RawConfig} config
 * @returns {{ config: RawConfig; fromVersion: number; changed: boolean }}
 */
export function migrateConfig(config) {
  const fromVersion = getConfigVersion(config);
  let current = config;
  let changed = false;
  for (let v = fromVersion; v < CURRENT_CONFIG_VERSION; v++) {
    const step = MIGRATIONS[v](current);
    current = step.config;
    changed = changed || step.changed;
  }
  return { config: current, fromVersion, changed };
}
