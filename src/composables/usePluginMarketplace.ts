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
}

async function installFromCatalog(id: string) {
  installingId.value = id
  installStage.value = 'downloading'
  installPercent.value = 0
  installError.value = null
  operationKind.value = 'install-from-catalog'
  subscribeProgress()
  try {
    const res = await window.openPenApi?.installPlugin(id)
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
  loading.value = false
  error.value = null
  installedVersions.value = {}
  operationKind.value = null
  resetInstallState()
  unsubProgress?.()
  unsubProgress = null
}

export interface UsePluginMarketplaceReturn {
  catalog: DeepReadonly<Ref<CatalogEntry[]>>
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
  installFromCatalog(id: string): Promise<void>
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
    removePlugin: removePluginFn,
    addFromLocal,
    addFromGitHubRepo,
    inspectLocal,
    markFailed,
    resetInstallState,
  }
}
