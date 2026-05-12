/**
 * Catalog configuration.
 *
 * OPENPEN_CATALOG_OWNER overrides the default owner for local testing
 * (e.g. pointing at a fork of the catalog repo).
 */
export const CATALOG_OWNER = process.env.OPENPEN_CATALOG_OWNER ?? 'openpen-platform'
export const CATALOG_REPO = 'OpenPen-plugins'
export const CATALOG_URL_DEFAULT = `https://raw.githubusercontent.com/${CATALOG_OWNER}/${CATALOG_REPO}/main/plugins.json`
