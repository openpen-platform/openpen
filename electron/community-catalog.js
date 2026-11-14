/**
 * Community catalog gate for the plugin marketplace.
 *
 * Kept free of `electron` imports so the rules can be unit-tested. The main
 * process is the authority on whether community plugins are shown or
 * installable: the renderer's copy of the setting is never trusted.
 */

import { parseCommunityCatalog, withoutOfficialIds } from '@openpen/plugin-manager'

export const COMMUNITY_OFF_ERROR = 'Community plugins are turned off.'

/**
 * @typedef {object} CommunityDeps
 * @property {() => boolean} isEnabled       current value of the `showCommunityPlugins` setting
 * @property {(url: string) => Promise<unknown>} fetchJson  fetch and parse a JSON document
 * @property {string} officialUrl
 * @property {string} communityUrl
 */

/**
 * Fetch the community catalog. Refuses while the setting is off, and drops
 * entries that share an id with an official plugin.
 *
 * @param {CommunityDeps} deps
 * @returns {Promise<{ ok: true, plugins: import('@openpen/plugin-manager').CommunityCatalogEntry[] } | { ok: false, error: string }>}
 */
export async function loadCommunityPlugins(deps) {
  if (!deps.isEnabled()) return { ok: false, error: COMMUNITY_OFF_ERROR }
  const [officialDoc, communityDoc] = await Promise.all([
    deps.fetchJson(deps.officialUrl),
    deps.fetchJson(deps.communityUrl),
  ])
  const official = Array.isArray(officialDoc?.plugins) ? officialDoc.plugins : []
  const plugins = withoutOfficialIds(parseCommunityCatalog(communityDoc), official)
  return { ok: true, plugins }
}

/**
 * Decide whether a community install may proceed: the setting must be on, and
 * the id must not belong to an official plugin.
 *
 * @param {CommunityDeps} deps
 * @param {string} id
 * @returns {Promise<{ ok: true } | { ok: false, error: string }>}
 */
export async function checkCommunityInstallAllowed(deps, id) {
  if (!deps.isEnabled()) return { ok: false, error: COMMUNITY_OFF_ERROR }
  const officialDoc = await deps.fetchJson(deps.officialUrl)
  const official = Array.isArray(officialDoc?.plugins) ? officialDoc.plugins : []
  if (official.some((p) => p?.id === id)) {
    return { ok: false, error: `"${id}" is an official plugin and cannot be installed from the community catalog.` }
  }
  return { ok: true }
}
