export type { PluginEntry, InstallOptions, ProgressEvent, CatalogEntry, CatalogIndex } from './types.js'

export { PLUGIN_ID_RE, parsePluginId, pluginsDirFor } from './id.js'

export type { InspectedPluginSource } from './install.js'

export {
  inspectLocalSource,
  installFromLocal,
  installFromGitHubReleaseUrl,
  installFromGitHubRepo,
  installFromCatalog,
} from './install.js'

export { removePlugin } from './remove.js'
export { listInstalled } from './list.js'

export { CATALOG_OWNER, CATALOG_REPO, CATALOG_URL_DEFAULT } from './config.js'
