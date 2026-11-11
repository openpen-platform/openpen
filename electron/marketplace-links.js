/**
 * Outbound links shown in the plugin marketplace (Report, Marketplace policy).
 *
 * The renderer only names *what* to open (a plugin id, a UI locale); the
 * main process builds the URL here. Plugins run inside the renderer, so
 * accepting a raw URL over IPC would let any plugin hand an arbitrary
 * address to shell.openExternal.
 */

import { t } from './i18n/index.js'
import { onValidated } from './ipc-validation.js'
import { pluginReportSchema, policyLocaleSchema } from './ipc-payload-schemas.js'

/** Issue tracker of the plugin catalog — the channel for reporting a listed plugin. */
export const CATALOG_ISSUES_URL = 'https://github.com/openpen-platform/OpenPen-plugins/issues'

/** Private reporting channel for security problems; never a public catalog issue. */
export const SECURITY_POLICY_URL = 'https://github.com/openpen-platform/openpen/security/policy'

const DOCS_BASE_URL = 'https://openpen.pages.dev/docs'
const POLICY_PATH = 'marketplace/policy'

/** Docs path prefix per UI locale; English lives at the docs root. */
const POLICY_LOCALE_PREFIX = {
  en: '',
  'zh-Hant': 'zh-Hant/',
  'zh-Hans': 'zh-Hans/',
  ja: 'ja/',
}

// Same shape as the catalog's plugin ids (`@scope/name`).
const PLUGIN_ID_RE = /^@[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9-]{0,38}$/
const VERSION_RE = /^[0-9A-Za-z.+-]{1,64}$/

/**
 * URL of the marketplace policy page in the given UI locale.
 * Unknown locales fall back to English.
 *
 * @param {unknown} locale
 * @returns {string}
 */
export function buildPolicyUrl(locale) {
  const prefix = typeof locale === 'string' && Object.hasOwn(POLICY_LOCALE_PREFIX, locale)
    ? POLICY_LOCALE_PREFIX[locale]
    : ''
  return `${DOCS_BASE_URL}/${prefix}${POLICY_PATH}`
}

/**
 * URL of a new catalog issue pre-filled with the reported plugin, in the
 * main process's active UI locale. Returns null when the id is not a valid `@scope/name`.
 *
 * @param {unknown} pluginId
 * @param {unknown} [version]
 * @returns {string | null}
 */
export function buildReportUrl(pluginId, version) {
  if (typeof pluginId !== 'string' || !PLUGIN_ID_RE.test(pluginId)) return null
  // The security notice comes first so it is read before anything is typed.
  const lines = [`> ${t('marketplace.report.securityNotice')} ${SECURITY_POLICY_URL}`, '', `Plugin: ${pluginId}`]
  if (typeof version === 'string' && VERSION_RE.test(version)) lines.push(`Version: ${version}`)
  lines.push('', t('marketplace.report.prompt'), '')
  const params = new URLSearchParams({
    title: `Report: ${pluginId}`,
    body: lines.join('\n'),
  })
  return `${CATALOG_ISSUES_URL}/new?${params.toString()}`
}

/**
 * Wire the marketplace link IPC listeners.
 *
 * @param {object} deps
 * @param {Pick<import('electron').IpcMain, 'on' | 'removeAllListeners'>} deps.ipcMain
 * @param {(url: string) => unknown} deps.openExternal
 * @param {{ OPEN_REPORT: string, OPEN_POLICY: string }} deps.channels
 */
export function registerMarketplaceLinkHandlers({ ipcMain, openExternal, channels }) {
  ipcMain.removeAllListeners(channels.OPEN_REPORT)
  ipcMain.removeAllListeners(channels.OPEN_POLICY)
  onValidated(ipcMain, channels.OPEN_REPORT, pluginReportSchema, (_event, payload) => {
    const url = buildReportUrl(payload.id, payload.version)
    if (url) openExternal(url)
  })
  onValidated(ipcMain, channels.OPEN_POLICY, policyLocaleSchema, (_event, payload) => {
    openExternal(buildPolicyUrl(payload.locale))
  })
}
