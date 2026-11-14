export type { PluginEntry, InstallOptions, ProgressEvent, CatalogEntry, CatalogIndex, CatalogTier, CommunityCatalogEntry, CommunityCatalogIndex } from './types.js'

export { PLUGIN_ID_RE, parsePluginId, pluginsDirFor } from './id.js'

export type { InspectedPluginSource } from './install.js'

export {
  inspectLocalSource,
  installFromLocal,
  installFromGitHubReleaseUrl,
  installFromGitHubRepo,
  installFromCatalog,
  installFromCommunityCatalog,
} from './install.js'

export { removePlugin } from './remove.js'
export { listInstalled } from './list.js'

export { parseCommunityCatalog, withoutOfficialIds } from './community.js'

export {
  CATALOG_OWNER,
  CATALOG_REPO,
  CATALOG_URL_DEFAULT,
  COMMUNITY_CATALOG_URL_DEFAULT,
} from './config.js'
