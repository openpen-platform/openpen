/**
 * Catalog configuration.
 *
 * OPENPEN_CATALOG_OWNER overrides the default owner for local testing
 * (e.g. pointing at a fork of the catalog repo).
 *
 * The community catalog lives in the same repository and branch as the
 * official index, under `community/plugins.json`.
 */
export const CATALOG_OWNER = process.env.OPENPEN_CATALOG_OWNER ?? 'openpen-platform'
export const CATALOG_REPO = 'OpenPen-plugins'
export const CATALOG_BRANCH = 'main'
const CATALOG_RAW_BASE = `https://raw.githubusercontent.com/${CATALOG_OWNER}/${CATALOG_REPO}/${CATALOG_BRANCH}`
export const CATALOG_URL_DEFAULT = `${CATALOG_RAW_BASE}/plugins.json`
export const COMMUNITY_CATALOG_URL_DEFAULT = `${CATALOG_RAW_BASE}/community/plugins.json`
