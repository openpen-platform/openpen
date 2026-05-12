/**
 * Minimal i18n module for the Electron main process.
 *
 * Only covers the small set of keys the main process itself needs (tray menu
 * labels, etc.). The renderer has its own, larger i18n dictionaries.
 *
 * Supported locales: en, zh-Hant, zh-Hans, ja.
 * Unknown keys fall back to the English bundle, then to the key string itself.
 */

/** @type {Record<string, Record<string, string>>} Loaded locale bundles keyed by locale id. */
const _bundles = {};

/** @type {string} Currently active locale identifier. */
let _locale = 'en';

/**
 * Load all locale bundles and set the initial locale.
 * Must be called once before t() is used.
 *
 * @param {string} initialLocale - Locale to activate (e.g. 'en', 'zh-Hant').
 * @returns {Promise<void>}
 */
export async function initI18n(initialLocale) {
  const [en, zhHant, zhHans, ja] = await Promise.all([
    import('./en.js'),
    import('./zh-Hant.js'),
    import('./zh-Hans.js'),
    import('./ja.js'),
  ]);
  _bundles['en'] = en.default;
  _bundles['zh-Hant'] = zhHant.default;
  _bundles['zh-Hans'] = zhHans.default;
  _bundles['ja'] = ja.default;

  setLocale(initialLocale);
}

/**
 * Switch the active locale. No-op if the locale has no loaded bundle.
 *
 * @param {string} locale
 */
export function setLocale(locale) {
  if (_bundles[locale]) {
    _locale = locale;
  }
}

/**
 * Translate a key using the active locale bundle.
 * Falls back: active locale → English → key string itself.
 *
 * @param {string} key
 * @returns {string}
 */
export function t(key) {
  const activeBundle = _bundles[_locale];
  if (activeBundle && key in activeBundle) return activeBundle[key];

  const enBundle = _bundles['en'];
  if (enBundle && key in enBundle) return enBundle[key];

  return key;
}

/**
 * Return the currently active locale identifier.
 * Useful for unit tests and diagnostics.
 *
 * @returns {string}
 */
export function getLocale() {
  return _locale;
}
