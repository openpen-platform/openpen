import { ref, computed, readonly } from 'vue'
import type { Ref, ComputedRef, DeepReadonly } from 'vue'

// ── Semver compare ────────────────────────────────────────────────────────────

/**
 * Compare two semver strings. Returns -1 (a < b), 0 (equal), or 1 (a > b).
 * Handles MAJOR.MINOR.PATCH and MAJOR.MINOR.PATCH-prerelease (pre-release is
 * considered lower than the release it annotates, per semver spec).
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const split = (v: string) => {
    const [main, pre] = v.split('-', 2)
    const parts = main.split('.').map(Number)
    return { parts, pre: pre ?? null }
  }
  const av = split(a)
  const bv = split(b)
  for (let i = 0; i < 3; i++) {
    const ap = av.parts[i] ?? 0
    const bp = bv.parts[i] ?? 0
    if (ap !== bp) return ap < bp ? -1 : 1
  }
  // Same numeric version: pre-release < release
  if (av.pre !== null && bv.pre === null) return -1
  if (av.pre === null && bv.pre !== null) return 1
  if (av.pre !== null && bv.pre !== null && av.pre !== bv.pre) {
    return av.pre < bv.pre ? -1 : 1
  }
  return 0
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type LocalInstallKind = 'fresh' | 'upgrade' | 'reinstall' | 'downgrade'

export interface LocalInspectionResult {
  kind: LocalInstallKind
  next: { id: string; version: string; displayName: string; description?: string; changelog?: string[] }
  /** Currently installed version, only present when kind !== 'fresh'. */
  current?: string
}

// ── Module-level singleton state ──────────────────────────────────────────────

const catalog = ref<CatalogEntry[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
const installingId = ref<string | null>(null)
const installPercent = ref(0)
const installStage = ref<'idle' | 'downloading' | 'verifying' | 'extracting' | 'completed' | 'failed'>('idle')
const installError = ref<string | null>(null)
const installedVersions = ref<Record<string, string>>({})
const installedIds = computed(() => new Set(Object.keys(installedVersions.value)))
const operationKind = ref<LocalInstallKind | 'install-from-catalog' | null>(null)

// Community catalog: only fetched and listed while the user setting is on.
const communityCatalog = ref<CatalogEntry[]>([])
const communityEnabled = ref(false)
const communityError = ref<string | null>(null)

/** Official entries, plus community entries while the setting is on. */
const listing = computed<CatalogEntry[]>(() =>
  communityEnabled.value ? [...catalog.value, ...communityCatalog.value] : catalog.value,
)

/** True for an entry that came from the community catalog. */
export function isCommunityEntry(entry: Pick<CatalogEntry, 'tier'>): boolean {
  return entry.tier === 'community'
}

let unsubProgress: (() => void) | null = null

function subscribeProgress() {
  // Re-subscribe each install so the listener captures the freshest
  // window.openPenApi mock (matters for tests; harmless in production).
  unsubProgress?.()
  unsubProgress = window.openPenApi?.onPluginInstallProgress((p) => {
    if (p.stage === 'download') {
      installStage.value = 'downloading'
      installPercent.value = p.percent ?? 0
    } else if (p.stage === 'verify') {
      installStage.value = 'verifying'
      installPercent.value = 100
    } else if (p.stage === 'extract') {
      installStage.value = 'extracting'
      installPercent.value = 100
    }
  }) ?? null
}

async function refreshInstalledVersions() {
  const manifests = await window.openPenApi?.getModuleManifests() ?? []
  const map: Record<string, string> = {}
  for (const m of manifests) {
    if (m.version) map[m.id] = m.version
  }
  installedVersions.value = map
}

async function fetchCatalog() {
  loading.value = true
  error.value = null
  try {
    await refreshInstalledVersions()
    const res = await window.openPenApi?.fetchPluginCatalog()
    if (!res) { error.value = 'No API available'; return }
    if (!res.ok) { error.value = res.error; return }
    catalog.value = res.plugins
  } catch (err_) {
    error.value = err_ instanceof Error ? err_.message : 'Unknown error'
  } finally {
    loading.value = false
  }
  // Community entries load after the official list is shown, so a slow
  // community request never holds the official list in its loading state.
  if (communityEnabled.value) await fetchCommunityCatalog()
}

// Each request gets a number; only the newest one may write state, so a slow
// stale response cannot overwrite a newer one after the setting is toggled.
let communityRequestSeq = 0
let communityInFlight: Promise<void> | null = null

function fetchCommunityCatalog(): Promise<void> {
  // Callers that overlap share one request.
  if (communityInFlight) return communityInFlight
  const seq = ++communityRequestSeq
  const isCurrent = () => seq === communityRequestSeq && communityEnabled.value
  communityError.value = null
  communityInFlight = (async () => {
    try {
      const res = await window.openPenApi?.fetchCommunityPluginCatalog()
      if (!isCurrent()) return
      if (!res) { communityCatalog.value = []; communityError.value = 'No API available'; return }
      if (!res.ok) { communityCatalog.value = []; communityError.value = res.error; return }
      // Tag locally as well: the badge must not depend on the file's own flags.
      communityCatalog.value = res.plugins.map((p) => ({ ...p, tier: 'community' as const, reviewed: false }))
    } catch (err_) {
      if (!isCurrent()) return
      communityCatalog.value = []
      communityError.value = err_ instanceof Error ? err_.message : 'Unknown error'
    } finally {
      if (seq === communityRequestSeq) communityInFlight = null
    }
  })()
  return communityInFlight
}

/**
 * Apply the user's "show community plugins" setting. Turning it off hides and
 * drops the community entries at once; turning it on fetches them.
 * Plugins already installed are not touched either way.
 */
async function setCommunityEnabled(enabled: boolean, fetchNow = true) {
  if (communityEnabled.value === enabled) return
  communityEnabled.value = enabled
  // Invalidate any request still in flight for the previous state.
  communityRequestSeq++
  communityInFlight = null
  if (!enabled) {
    communityCatalog.value = []
    communityError.value = null
    return
  }
  if (fetchNow) await fetchCommunityCatalog()
}

/**
 * Read the setting and follow later changes. Returns the unsubscribe function.
 * Pass `fetchNow: false` when a full catalog fetch follows right away, which
 * loads the community entries itself.
 */
async function watchCommunitySetting(opts: { fetchNow?: boolean } = {}): Promise<() => void> {
  const settings = await window.openPenApi?.getSettings?.()
  await setCommunityEnabled(settings?.showCommunityPlugins === true, opts.fetchNow ?? true)
  const unsub = window.openPenApi?.onSettingsUpdated?.((s) => {
    void setCommunityEnabled(s.showCommunityPlugins === true)
  })
  return () => unsub?.()
}

async function installFromCatalog(id: string, opts: { community?: boolean } = {}) {
  installingId.value = id
  installStage.value = 'downloading'
  installPercent.value = 0
  installError.value = null
  operationKind.value = 'install-from-catalog'
  subscribeProgress()
  try {
    const res = opts.community
      ? await window.openPenApi?.installCommunityPlugin(id)
      : await window.openPenApi?.installPlugin(id)
    if (!res) { installStage.value = 'failed'; installError.value = 'No API available'; return }
    if (!res.ok) { installStage.value = 'failed'; installError.value = res.error; return }
    installStage.value = 'completed'
    installPercent.value = 100
    await refreshInstalledVersions()
  } catch (err_) {
    installStage.value = 'failed'
    installError.value = err_ instanceof Error ? err_.message : 'Install failed'
  }
}

async function removePluginFn(id: string): Promise<{ ok: boolean; error?: string }> {
  const res = await window.openPenApi?.removePlugin(id)
  if (!res) return { ok: false, error: 'No API available' }
  if (res.ok) await refreshInstalledVersions()
  return res
}

async function addFromLocal(sourcePath: string): Promise<{ ok: boolean; error?: string }> {
  installingId.value = sourcePath
  installStage.value = 'extracting'
  installPercent.value = 0
  installError.value = null
  subscribeProgress()
  try {
    const res = await window.openPenApi?.addPluginFromLocal(sourcePath)
    if (!res) { installStage.value = 'failed'; installError.value = 'No API available'; return { ok: false, error: 'No API available' } }
    if (!res.ok) { installStage.value = 'failed'; installError.value = res.error; return res }
    installStage.value = 'completed'
    installPercent.value = 100
    await refreshInstalledVersions()
    return { ok: true }
  } catch (err_) {
    const msg = err_ instanceof Error ? err_.message : 'Install failed'
    installStage.value = 'failed'
    installError.value = msg
    return { ok: false, error: msg }
  }
}

async function addFromGitHubRepo(repoUrl: string): Promise<{ ok: boolean; error?: string }> {
  installingId.value = repoUrl
  installStage.value = 'downloading'
  installPercent.value = 0
  installError.value = null
  operationKind.value = null
  subscribeProgress()
  try {
    const res = await window.openPenApi?.addPluginFromGitHubRepo(repoUrl)
    if (!res) { installStage.value = 'failed'; installError.value = 'No API available'; return { ok: false, error: 'No API available' } }
    if (!res.ok) { installStage.value = 'failed'; installError.value = res.error; return res }
    installStage.value = 'completed'
    installPercent.value = 100
    await refreshInstalledVersions()
    return { ok: true }
  } catch (err_) {
    const msg = err_ instanceof Error ? err_.message : 'Install failed'
    installStage.value = 'failed'
    installError.value = msg
    return { ok: false, error: msg }
  }
}

async function inspectLocal(
  sourcePath: string,
): Promise<{ ok: true; result: LocalInspectionResult } | { ok: false; error: string }> {
  const res = await window.openPenApi?.inspectPluginSource(sourcePath)
  if (!res) return { ok: false, error: 'No API available' }
  if (!res.ok) return { ok: false, error: res.error }

  const { id, version: nextVersion, displayName, description, changelog } = res.info
  const currentVersion = installedVersions.value[id]

  let kind: LocalInstallKind
  if (!currentVersion) {
    kind = 'fresh'
  } else {
    const cmp = compareSemver(nextVersion, currentVersion)
    if (cmp > 0) kind = 'upgrade'
    else if (cmp === 0) kind = 'reinstall'
    else kind = 'downgrade'
  }

  const result: LocalInspectionResult = {
    kind,
    next: {
      id,
      version: nextVersion,
      displayName,
      ...(description ? { description } : {}),
      ...(changelog && changelog.length > 0 ? { changelog } : {}),
    },
    ...(currentVersion !== undefined ? { current: currentVersion } : {}),
  }
  return { ok: true, result }
}

/** Set install state to failed with the given error message. Used by the panel
 * to surface an inspect failure directly in the progress dialog. */
function markFailed(errorMessage: string) {
  installStage.value = 'failed'
  installError.value = errorMessage
}

function resetInstallState() {
  installingId.value = null
  installStage.value = 'idle'
  installPercent.value = 0
  installError.value = null
  operationKind.value = null
}

/** Internal — clear all module-level state. Used by tests only. */
export function resetMarketplaceForTest(): void {
  catalog.value = []
  communityCatalog.value = []
  communityEnabled.value = false
  communityError.value = null
  communityRequestSeq++
  communityInFlight = null
  loading.value = false
  error.value = null
  installedVersions.value = {}
  operationKind.value = null
  resetInstallState()
  unsubProgress?.()
  unsubProgress = null
}

export interface UsePluginMarketplaceReturn {
  /** Official catalog only. */
  catalog: DeepReadonly<Ref<CatalogEntry[]>>
  /** What the marketplace lists: official entries, plus community ones while the setting is on. */
  listing: ComputedRef<readonly CatalogEntry[]>
  communityEnabled: DeepReadonly<Ref<boolean>>
  communityError: DeepReadonly<Ref<string | null>>
  loading: DeepReadonly<Ref<boolean>>
  error: DeepReadonly<Ref<string | null>>
  /** Id of the plugin currently being installed/updated, or null. */
  installingId: DeepReadonly<Ref<string | null>>
  /** Progress of the current install (0–100). */
  installPercent: DeepReadonly<Ref<number>>
  /** Current install stage label. */
  installStage: DeepReadonly<Ref<'idle' | 'downloading' | 'verifying' | 'extracting' | 'completed' | 'failed'>>
  installError: DeepReadonly<Ref<string | null>>
  /** Set of locally installed plugin ids (from module manifests). */
  installedIds: ComputedRef<Set<string>>
  /** Local version map: id → version. */
  installedVersions: DeepReadonly<Ref<Record<string, string>>>
  /** Kind of the current or most recent local install operation. */
  operationKind: DeepReadonly<Ref<LocalInstallKind | 'install-from-catalog' | null>>
  fetchCatalog(): Promise<void>
  installFromCatalog(id: string, opts?: { community?: boolean }): Promise<void>
  /** Read the community setting, follow changes, return the unsubscribe function. */
  watchCommunitySetting(opts?: { fetchNow?: boolean }): Promise<() => void>
  removePlugin(id: string): Promise<{ ok: boolean; error?: string }>
  addFromLocal(sourcePath: string): Promise<{ ok: boolean; error?: string }>
  addFromGitHubRepo(repoUrl: string): Promise<{ ok: boolean; error?: string }>
  inspectLocal(sourcePath: string): Promise<{ ok: true; result: LocalInspectionResult } | { ok: false; error: string }>
  markFailed(errorMessage: string): void
  resetInstallState(): void
}

export function usePluginMarketplace(): UsePluginMarketplaceReturn {
  return {
    catalog: readonly(catalog),
    listing,
    communityEnabled: readonly(communityEnabled),
    communityError: readonly(communityError),
    loading: readonly(loading),
    error: readonly(error),
    installingId: readonly(installingId),
    installPercent: readonly(installPercent),
    installStage: readonly(installStage),
    installError: readonly(installError),
    installedIds,
    installedVersions: readonly(installedVersions),
    operationKind: readonly(operationKind),
    fetchCatalog,
    installFromCatalog,
    watchCommunitySetting,
    removePlugin: removePluginFn,
    addFromLocal,
    addFromGitHubRepo,
    inspectLocal,
    markFailed,
    resetInstallState,
  }
}
