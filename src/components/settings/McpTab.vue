<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { AppBanner, AppDialog, AppSegmented, AppToggle } from '@openpen/module-api/uikit'
import type { AppSettings } from '../../types/settings'
import { MCP_PORT, MCP_PORT_MAX, MCP_PORT_MIN, isValidMcpPort } from '../../../shared/mcp-constants.js'

const { t } = useI18n()

const props = defineProps<{
  /** Settings draft owned by the parent; this tab mutates `draft.mcp` directly. */
  draft: AppSettings
}>()

type McpStatus = McpServerStatus
const api = () => window.openPenApi

const mcp = computed(() => props.draft.mcp)

// ── Server status (owned by main; only presented here) ───────────────────────
const status = ref<McpStatus>({ running: false, url: null, error: null })
let unsubStatus: (() => void) | null = null

async function refreshStatus() {
  const s = await api()?.getMcpStatus()
  if (s) status.value = s
}

/** Retry for real: main restarts the server, then pushes the new status. */
async function retryStart() {
  const retry = (api() as unknown as { retryMcpStart?: () => Promise<McpServerStatus | void> } | undefined)?.retryMcpStart
  const s = retry ? await retry.call(api()) : undefined
  if (s) status.value = s
  else await refreshStatus()
}

const enabled = computed(() => mcp.value.enabled)
const pending = computed(() => enabled.value && !status.value.running && !status.value.error)
const stopping = computed(() => !enabled.value && status.value.running)
// Driven by the server status, not the draft toggle: a failed start is reported
// again every time the window opens, even though `enabled` was never saved.
const showError = computed(() => status.value.error !== null)

const chip = computed(() => {
  if (showError.value) return { cls: 'chip-err', text: t('mcpChipError'), id: 'error' }
  if (pending.value) return { cls: 'chip-off', text: t('mcpChipPending'), id: 'pending' }
  if (stopping.value) return { cls: 'chip-off', text: t('mcpChipStopping'), id: 'stopping' }
  if (!enabled.value) return { cls: 'chip-off', text: t('mcpChipOff'), id: 'off' }
  if (mcp.value.readOnly) return { cls: 'chip-ro', text: t('mcpChipRunningReadOnly'), id: 'running-readonly' }
  return { cls: 'chip-on', text: t('mcpChipRunning'), id: 'running' }
})

// ── Port (draft; main listens on it after Save) ─────────────────────────────
const draftPort = computed(() => mcp.value.port ?? MCP_PORT)
// The field keeps what the user typed; only a valid port reaches the draft, so
// Save (shared by the whole window) never writes an invalid one.
const portText = ref<string | null>(null)
const portShown = computed(() => portText.value ?? String(draftPort.value))
const portValid = computed(() => /^\d{1,5}$/.test(portShown.value.trim()) && isValidMcpPort(Number(portShown.value.trim())))
const portTouched = ref(false)
const portInvalidShown = computed(() => portTouched.value && !portValid.value)
/** The port before this window's edits; an invalid field puts it back so no half-typed value is saved. */
let portBefore: number | null = null
function onPortInput(e: Event) {
  if (portBefore === null) portBefore = draftPort.value
  portText.value = (e.target as HTMLInputElement).value
  if (portValid.value) {
    props.draft.mcp.port = Number(portText.value.trim())
    portTouched.value = true
  } else {
    props.draft.mcp.port = portBefore
  }
}
const runningPort = computed(() => (status.value.url ? Number(new URL(status.value.url).port) : null))
// Edited in this window: the address shows the port Save will apply.
const portEdited = computed(() => portText.value !== null)
const portPending = computed(() => portEdited.value && portValid.value && status.value.running && runningPort.value !== draftPort.value)
const portInUse = computed(() => status.value.error === 'port_in_use')

// Turning the switch on failed, so `enabled` was never saved. The banner says
// to pick another port and save: show the switch on again, so that Save starts
// the server on the new port. Done once per loaded draft, so the user can still
// turn it off.
let adoptedPendingFor: object | null = null
watch(
  () => [props.draft.mcp, status.value.pendingEnable, status.value.error] as const,
  ([draftMcp, pendingEnable, error]) => {
    if (!pendingEnable || !error || draftMcp.enabled || adoptedPendingFor === draftMcp) return
    adoptedPendingFor = draftMcp
    props.draft.mcp.enabled = true
  },
)

const errorText = computed(() => {
  const s = status.value
  if (s.error === 'port_in_use') return t('mcpErrPortInUse', { port: s.port ?? draftPort.value })
  return s.message ? t('mcpErrFailed', { message: s.message }) : t('mcpErrFailedNoMessage')
})

const endpoint = computed(() =>
  portEdited.value || !status.value.url ? `http://127.0.0.1:${draftPort.value}/mcp` : status.value.url,
)
const heroText = computed(() =>
  status.value.running && !showError.value
    ? t('mcpHeroListening', { url: status.value.url })
    : t('mcpHeroIntro'),
)

// ── API key ──────────────────────────────────────────────────────────────────
const revealed = ref(false)
const justRegenerated = ref(false)
const apiKey = computed(() => mcp.value.apiKey)
const maskedKey = computed(() => {
  const k = apiKey.value
  if (!k) return t('mcpKeyPending')
  return k.slice(0, 4) + '•'.repeat(12) + k.slice(-4)
})
const shownKey = computed(() => (revealed.value && apiKey.value ? apiKey.value : maskedKey.value))


function snippetFor(c: 'claude' | 'codex', key: string): string {
  const url = endpoint.value
  if (c === 'claude') {
    return `claude mcp add --transport http openpen ${url} \\\n  --header "Authorization: Bearer ${key}"`
  }
  return `# ~/.codex/config.toml\n[mcp_servers.openpen]\nurl = "${url}"\nbearer_token_env_var = "OPENPEN_MCP_KEY"\n\n# shell\nexport OPENPEN_MCP_KEY="${key}"`
}
const client = ref<'claude' | 'codex'>('claude')
const clientOptions = computed(() => [
  { value: 'claude', label: t('mcpTabClaude'), testid: 'mcp-client-claude' },
  { value: 'codex', label: t('mcpCmdCodex'), testid: 'mcp-client-codex' },
])
const snippetShown = (c: 'claude' | 'codex') => snippetFor(c, apiKey.value ? maskedKey.value : '…')

// ── Claude Desktop: hand the bundled installer to the OS ─────────────────────
const installFailed = ref(false)
async function installClaudeDesktop() {
  installFailed.value = false
  const result = await api()?.installClaudeDesktopExtension()
  installFailed.value = !result?.ok
}

// Brief "Copied" flash per button, keyed by what was copied.
const copied = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | null = null
async function copy(what: string, text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    return
  }
  copied.value = what
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copied.value = null; copiedTimer = null }, 1000)
}

// ── Regenerate (immediate, after a danger confirmation) ──────────────────────
const confirmOpen = ref(false)
const cancelBtn = ref<HTMLButtonElement | null>(null)

// Default focus is Cancel so Enter / Space never destroys the key by accident.
watch(confirmOpen, async (open) => {
  if (!open) return
  await nextTick()
  await nextTick()
  cancelBtn.value?.focus()
})

async function confirmRegenerate() {
  confirmOpen.value = false
  const key = await api()?.regenerateMcpKey()
  if (!key) return
  // The key change is already live in main. Mirror it into the draft, or the
  // next Save would write the stale key back over it.
  props.draft.mcp.apiKey = key
  revealed.value = true
  justRegenerated.value = true
}

// ── Access (read & draw / read-only) ─────────────────────────────────────────
const accessOptions = computed(() => [
  { value: 'full', label: t('mcpAccessFull'), testid: 'mcp-access-full' },
  { value: 'ro', label: t('mcpAccessReadOnly'), testid: 'mcp-access-readonly' },
])

// ── Plugin tools ─────────────────────────────────────────────────────────────
interface PluginRow { id: string; description: string }
const plugins = ref<PluginRow[]>([])
const pluginsOpen = ref(false)
const filter = ref('')

async function loadPlugins() {
  const manifests = (await api()?.getModuleManifests()) ?? []
  plugins.value = manifests.map((m) => ({ id: m.id, description: m.description ?? m.name ?? '' }))
}

const exposeOptions = computed(() => [
  { value: 'all', label: t('mcpExposeAll'), testid: 'mcp-expose-all' },
  { value: 'choose', label: t('mcpExposeChoose'), testid: 'mcp-expose-choose' },
])
const exposedCount = computed(() =>
  mcp.value.exposeAll
    ? plugins.value.length
    : plugins.value.filter((p) => mcp.value.enabledPlugins.includes(p.id)).length,
)
const pluginSummary = computed(() =>
  mcp.value.exposeAll
    ? t('mcpPluginsAll', { n: plugins.value.length })
    : t('mcpPluginsSome', { n: exposedCount.value, total: plugins.value.length }),
)

// Tools a plugin declared but the endpoint does not expose, with the reason.
const issueReasonKey: Record<McpPluginToolIssue['reason'], string> = {
  invalid_chars: 'mcpIssueInvalidChars',
  too_long: 'mcpIssueTooLong',
  duplicate: 'mcpIssueDuplicate',
}
const issuesFor = (id: string): McpPluginToolIssue[] => status.value.pluginToolIssues?.[id] ?? []
const expandedIssues = ref<Set<string>>(new Set())
function toggleIssues(id: string) {
  const next = new Set(expandedIssues.value)
  if (!next.delete(id)) next.add(id)
  expandedIssues.value = next
}

// Which rows the plugin list shows. Choosing plugins: all of them, with toggles.
// "All plugins" and read-only: no toggles, only plugins with tools that are not exposed.
const showToggles = computed(() => !mcp.value.readOnly && !mcp.value.exposeAll)
const pluginsWithIssues = computed(() => plugins.value.filter((p) => issuesFor(p.id).length > 0))
const listedPlugins = computed(() => (showToggles.value ? visiblePlugins.value : pluginsWithIssues.value))
const listShown = computed(() => {
  if (mcp.value.readOnly) return pluginsWithIssues.value.length > 0
  return pluginsOpen.value && listedPlugins.value.length > 0
})

const visiblePlugins = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return q ? plugins.value.filter((p) => p.id.toLowerCase().includes(q)) : plugins.value
})

function setExposed(id: string, on: boolean) {
  const set = new Set(mcp.value.enabledPlugins)
  if (on) set.add(id)
  else set.delete(id)
  props.draft.mcp.enabledPlugins = [...set]
}

onMounted(() => {
  void refreshStatus()
  void loadPlugins()
  unsubStatus = api()?.onMcpStatusChanged((s) => { status.value = s }) ?? null
})
onUnmounted(() => {
  unsubStatus?.()
  if (copiedTimer) clearTimeout(copiedTimer)
})
</script>

<template>
  <div data-testid="mcp-tab">
    <!-- Status card -->
    <section class="cw-section" aria-labelledby="mcp-hero-title">
      <div class="b-hero">
        <div class="b-hero-main">
          <h2 id="mcp-hero-title" class="b-hero-title">
            {{ t('mcpServerTitle') }}
            <span class="chip" :class="chip.cls" data-testid="mcp-status-chip" :data-state="chip.id">{{ chip.text }}</span>
          </h2>
          <p class="b-hero-sub" data-testid="mcp-hero-sub">{{ heroText }}</p>
        </div>
        <AppToggle
          :model-value="enabled"
          :aria-label="t('mcpEnableLabel')"
          testid="mcp-enable-toggle"
          @update:model-value="draft.mcp.enabled = $event"
        />
      </div>

      <div v-if="showError" data-testid="mcp-error-banner">
        <AppBanner variant="error">
          <span id="mcp-error-text">{{ errorText }}</span>
          <template #actions>
            <button type="button" class="btn-sm" data-testid="mcp-retry-btn" @click="retryStart">{{ t('mcpRetry') }}</button>
          </template>
        </AppBanner>
      </div>

      <ul v-if="!enabled" class="b-what" :aria-label="t('mcpWhatLabel')" data-testid="mcp-what-list">
        <li>{{ t('mcpWhat1') }}</li>
        <li>{{ t('mcpWhat2') }}</li>
        <li>{{ t('mcpWhat3') }}</li>
      </ul>
    </section>

    <!-- Also shown while the port is taken, so the field to fix it is at hand. -->
    <template v-if="enabled || portInUse">
      <!-- Connection card -->
      <section class="cw-section" aria-labelledby="mcp-sec-conn">
        <h2 id="mcp-sec-conn" class="cw-section-title">{{ t('mcpSectionConnection') }}</h2>
        <div v-if="justRegenerated" data-testid="mcp-regenerated-banner">
          <AppBanner variant="success">{{ t('mcpRegenerated') }}</AppBanner>
        </div>
        <div class="b-card">
          <div class="b-fields">
            <span id="mcp-lbl-port" class="field-label">{{ t('mcpPort') }}</span>
            <input
              id="mcp-port"
              class="field-value field-input"
              :class="{ 'is-invalid': portInvalidShown || portInUse }"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              spellcheck="false"
              maxlength="5"
              aria-labelledby="mcp-lbl-port"
              :aria-invalid="portInvalidShown || portInUse"
              :aria-describedby="portInvalidShown ? 'mcp-port-msg' : portInUse ? 'mcp-error-text' : portPending ? 'mcp-port-note' : undefined"
              data-testid="mcp-port-input"
              :value="portShown"
              @input="onPortInput"
              @blur="portTouched = true"
            />
            <span class="b-fieldbtns"><span v-if="draftPort !== MCP_PORT" class="muted-note b-port-default" data-testid="mcp-port-default">{{ t('mcpPortDefault', { port: MCP_PORT }) }}</span></span>
            <div v-if="portInvalidShown" id="mcp-port-msg" class="b-port-msg" data-testid="mcp-port-invalid">
              <AppBanner variant="error" inline>{{ t('mcpPortInvalid', { min: MCP_PORT_MIN, max: MCP_PORT_MAX }) }}</AppBanner>
            </div>
            <p v-else-if="portPending" id="mcp-port-note" class="muted-note b-port-msg" data-testid="mcp-port-pending">{{ t('mcpPortPending', { port: draftPort }) }}</p>
            <span id="mcp-lbl-url" class="field-label">{{ t('mcpEndpoint') }}</span>
            <code class="field-value" aria-labelledby="mcp-lbl-url" data-testid="mcp-endpoint">{{ endpoint }}</code>
            <span class="b-fieldbtns">
              <button type="button" class="btn-sm" :class="{ 'is-done': copied === 'endpoint' }" data-testid="mcp-copy-endpoint" :aria-label="t('mcpCopyEndpoint')" @click="copy('endpoint', endpoint)">
                {{ copied === 'endpoint' ? t('mcpCopied') : t('mcpCopy') }}
              </button>
            </span>
            <span id="mcp-lbl-key" class="field-label">{{ t('mcpApiKey') }}</span>
            <code class="field-value" aria-labelledby="mcp-lbl-key" data-testid="mcp-key">{{ shownKey }}</code>
            <span class="b-fieldbtns">
              <button type="button" class="btn-sm" :disabled="!apiKey" data-testid="mcp-reveal-btn" :aria-label="revealed ? t('mcpHideKey') : t('mcpShowKey')" :aria-pressed="revealed" @click="revealed = !revealed">
                {{ revealed ? t('mcpHideKey') : t('mcpShowKey') }}
              </button>
              <button type="button" class="btn-sm" :class="{ 'is-done': copied === 'key' }" :disabled="!apiKey" data-testid="mcp-copy-key" :aria-label="t('mcpCopyKey')" @click="copy('key', apiKey)">
                {{ copied === 'key' ? t('mcpCopied') : t('mcpCopy') }}
              </button>
            </span>
          </div>
          <div class="b-divider" />
          <div class="b-card-head">
            <AppSegmented
              data-testid="mcp-client-seg"
              :model-value="client"
              :options="clientOptions"
              :aria-label="t('mcpAgent')"
              @update:model-value="client = $event as 'claude' | 'codex'"
            />
            <button v-if="client === 'codex'" type="button" class="btn-md" :class="{ 'is-done': copied === 'setup-codex' }" :disabled="!apiKey" data-testid="mcp-copy-setup-codex" @click="copy('setup-codex', snippetFor('codex', apiKey))">
              {{ copied === 'setup-codex' ? t('mcpCopied') : t('mcpCopySetup') }}
            </button>
          </div>
          <template v-if="client === 'codex'">
            <pre class="snippet" :aria-label="t('mcpSetupSnippet')" data-testid="mcp-snippet-codex">{{ snippetShown('codex') }}</pre>
          </template>
          <template v-else>
            <!-- Claude: Claude Code or Claude Desktop, either one -->
            <div class="b-card-head">
              <span class="b-card-label">{{ t('mcpCmdClaude') }}</span>
              <button type="button" class="btn-md" :class="{ 'is-done': copied === 'setup-claude' }" :disabled="!apiKey" data-testid="mcp-copy-setup-claude" @click="copy('setup-claude', snippetFor('claude', apiKey))">
                {{ copied === 'setup-claude' ? t('mcpCopied') : t('mcpCopySetup') }}
              </button>
            </div>
            <pre class="snippet" :aria-label="t('mcpSetupSnippet')" data-testid="mcp-snippet-claude">{{ snippetShown('claude') }}</pre>
            <div class="b-divider" />
            <div class="b-card-head">
              <span class="b-card-label">{{ t('mcpClaudeDesktop') }}</span>
              <button type="button" class="btn-md" data-testid="mcp-install-claude-desktop" @click="installClaudeDesktop">
                {{ t('mcpInstallClaudeDesktop') }}
              </button>
            </div>
            <p class="muted-note" data-testid="mcp-install-claude-desktop-note">{{ installFailed ? t('mcpInstallClaudeDesktopFailed') : t('mcpInstallClaudeDesktopHint', { port: draftPort }) }}</p>
            <div class="b-divider" />
          </template>
          <div class="b-card-head">
            <p class="muted-note">{{ t('mcpCopiedIncludesKey') }}</p>
            <button type="button" class="btn-sm btn-danger-text" :disabled="!apiKey" data-testid="mcp-regenerate-btn" @click="confirmOpen = true">{{ t('mcpRegenerate') }}</button>
          </div>
        </div>
      </section>

      <!-- Permissions -->
      <section class="cw-section" aria-labelledby="mcp-sec-perm">
        <h2 id="mcp-sec-perm" class="cw-section-title">{{ t('mcpSectionPermissions') }}</h2>
        <div class="b-card">
          <div class="b-card-head">
            <span class="b-card-label">{{ t('mcpAccess') }}</span>
            <AppSegmented
              data-testid="mcp-access-seg"
              :model-value="mcp.readOnly ? 'ro' : 'full'"
              :options="accessOptions"
              :aria-label="t('mcpAccess')"
              @update:model-value="draft.mcp.readOnly = $event === 'ro'"
            />
          </div>
          <p class="muted-note" data-testid="mcp-access-note">
            {{ mcp.readOnly ? t('mcpAccessReadOnlyNote') : t('mcpAccessFullNote') }}
          </p>

          <template v-if="plugins.length === 0">
            <div class="b-divider" />
            <div class="empty" data-testid="mcp-no-plugins">{{ t('mcpNoPlugins') }}</div>
          </template>
          <template v-else>
            <div class="b-divider" />
            <template v-if="!mcp.readOnly">
              <button type="button" class="b-disclose" :aria-expanded="pluginsOpen" aria-controls="mcp-plugs" data-testid="mcp-plugins-disclose" @click="pluginsOpen = !pluginsOpen">
                <span class="b-disc-l">{{ t('mcpPluginTools') }} <small data-testid="mcp-plugins-summary">· {{ pluginSummary }}</small></span>
                <span class="b-disc-hint">{{ pluginsOpen ? t('mcpHide') : t('mcpChoose') }}</span>
                <svg class="b-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
              </button>
              <div v-if="pluginsOpen" id="mcp-plugs" class="b-plugs">
                <AppSegmented
                  data-testid="mcp-expose-seg"
                  :model-value="mcp.exposeAll ? 'all' : 'choose'"
                  :options="exposeOptions"
                  :aria-label="t('mcpPluginTools')"
                  @update:model-value="draft.mcp.exposeAll = $event === 'all'"
                />
                <template v-if="!mcp.exposeAll && plugins.length > 8">
                  <label class="sr-only" for="mcp-filter">{{ t('mcpFilterPlugins') }}</label>
                  <input id="mcp-filter" v-model="filter" class="b-filter" type="search" data-testid="mcp-plugin-filter" :placeholder="t('mcpFilterPlaceholder', { n: plugins.length })" />
                </template>
              </div>
            </template>
            <!--
              One list for every mode. Choosing plugins: every plugin with its toggle.
              "All plugins" and read-only: no toggles, and only the plugins that have
              tools which are not exposed (nothing extra when there are none).
            -->
            <ul v-if="listShown" class="plug-list" :class="{ 'plug-list-after-seg': !mcp.readOnly }" :aria-label="t('mcpPluginList')" data-testid="mcp-plugin-list">
              <li v-for="p in listedPlugins" :key="p.id" class="b-plug" :class="{ 'b-plug-wrap': issuesFor(p.id).length > 0 }" :data-testid="`mcp-plugin-row-${p.id}`">
                <span class="b-plug-name">
                  <span class="b-plug-top">
                    {{ p.id }}
                    <button
                      v-if="issuesFor(p.id).length > 0"
                      type="button"
                      class="chip chip-warn"
                      :aria-expanded="expandedIssues.has(p.id)"
                      :aria-controls="`mcp-issues-${p.id}`"
                      :data-testid="`mcp-plugin-issues-${p.id}`"
                      @click="toggleIssues(p.id)"
                    >
                      {{ t('mcpToolsNotExposed', { n: issuesFor(p.id).length }, issuesFor(p.id).length) }}
                      <svg class="b-chev" :class="{ 'is-open': expandedIssues.has(p.id) }" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                  </span>
                  <span v-if="p.description" class="b-plug-d">{{ p.description }}</span>
                </span>
                <AppToggle
                  v-if="showToggles"
                  :model-value="mcp.enabledPlugins.includes(p.id)"
                  :aria-label="t('mcpExposePlugin', { id: p.id })"
                  :testid="`mcp-plugin-toggle-${p.id}`"
                  @update:model-value="setExposed(p.id, $event)"
                />
                <div
                  v-if="issuesFor(p.id).length > 0 && expandedIssues.has(p.id)"
                  :id="`mcp-issues-${p.id}`"
                  class="b-issues"
                  :data-testid="`mcp-plugin-issues-list-${p.id}`"
                >
                  <div v-for="issue in issuesFor(p.id)" :key="issue.fullName" class="b-issue">
                    <code class="b-issue-name" :title="issue.tool">{{ issue.tool }}</code>
                    <span>— {{ t(issueReasonKey[issue.reason]) }}</span>
                  </div>
                </div>
              </li>
            </ul>
          </template>
        </div>
      </section>
    </template>

    <!-- Regenerate confirmation (danger; Cancel holds the default focus) -->
    <AppDialog
      modal-id="settings-mcp-regenerate"
      :title="t('mcpRegenTitle')"
      :open="confirmOpen"
      danger
      @update:open="(v) => { if (!v) confirmOpen = false }"
    >
      <template #trigger><span /></template>
      <div data-testid="mcp-regen-dialog">
        <p class="dialog-body-text">{{ t('mcpRegenBody') }}</p>
        <p class="muted-note">{{ t('mcpRegenNote') }}</p>
      </div>
      <template #footer>
        <button ref="cancelBtn" type="button" class="cw-btn cw-btn-cancel" data-testid="mcp-regen-cancel" @click="confirmOpen = false">{{ t('cancel') }}</button>
        <button type="button" class="mcp-danger-btn" data-testid="mcp-regen-confirm" @click="confirmRegenerate">{{ t('mcpRegenConfirm') }}</button>
      </template>
    </AppDialog>
  </div>
</template>

<style scoped>
.cw-section { margin-bottom: 24px; }
.cw-section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.b-hero { padding: 14px 16px; border-radius: 10px; background: var(--row-bg); border: 1px solid var(--border-hi); display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; margin-bottom: 10px; }
.b-hero-main { min-width: 0; }
.b-hero-title { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; margin: 0; flex-wrap: wrap; }
.b-hero-sub { font-size: 12px; color: var(--text-dim); margin: 4px 0 0; line-height: 1.5; overflow-wrap: anywhere; }
.b-what { list-style: none; margin: 0; padding: 4px 16px 0 17px; display: grid; gap: 6px; }
.b-what li { font-size: 12.5px; color: var(--text-dim); display: flex; gap: 8px; line-height: 1.45; }
.b-what li::before { content: '•'; color: var(--text-dim); }

.b-card { border-radius: 8px; background: var(--row-bg); border: 1px solid var(--border); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; margin-bottom: 6px; }
.b-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.b-card-label { font-size: 13.5px; font-weight: 500; }
.b-fields { display: grid; grid-template-columns: auto 1fr auto; gap: 6px 8px; align-items: center; }
.b-fieldbtns { display: flex; gap: 6px; }
.b-divider { height: 1px; background: var(--border); margin: 2px 0; }

.chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 8px; border-radius: 99px; font-size: 11px; font-weight: 600; line-height: 1.5; border: 1px solid; white-space: nowrap; }
.chip::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.chip-off { color: var(--text-primary); border-color: var(--border-hi); background: var(--input-bg); }
.chip-on { color: var(--op-state-success-text); border-color: var(--op-state-success-border); background: var(--op-state-success-bg); }
.chip-err { color: var(--op-state-error-text); border-color: var(--op-state-error-border); background: var(--op-state-error-bg); }
.chip-ro { color: var(--op-state-info-text); border-color: var(--op-state-info-border); background: var(--op-state-info-bg); }

.btn-sm { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 28px; padding: 3px 10px; border-radius: 6px; font-size: 11.5px; font-weight: 500; cursor: pointer; border: 1px solid var(--border-hi); background: transparent; color: var(--text-dim); flex-shrink: 0; white-space: nowrap; }
.btn-sm:hover:not(:disabled) { background: var(--row-bg); color: var(--text-primary); }
.btn-sm:disabled, .btn-md:disabled { opacity: 0.45; cursor: not-allowed; }
.btn-sm.is-done, .btn-md.is-done { color: var(--op-state-success-text); border-color: var(--op-state-success-border); }
.btn-md { display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 5px 12px; border-radius: 8px; font-size: 12.5px; font-weight: 500; cursor: pointer; border: 1px solid var(--border-hi); background: var(--cancel-btn-bg); color: var(--text-primary); flex-shrink: 0; }
.btn-md:hover:not(:disabled) { background: var(--cancel-btn-hover-bg); }
.btn-danger-text { color: var(--op-state-error-text); border-color: var(--op-state-error-border); background: transparent; }
.btn-danger-text:hover:not(:disabled) { background: var(--op-state-error-bg); }

.field-label { font-size: 12px; font-weight: 600; color: var(--text-dim); min-width: 64px; }
.field-value { min-width: 0; font-family: var(--mono, 'SF Mono', Consolas, monospace); font-size: 12px; color: var(--text-primary); background: var(--input-bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px 9px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.snippet { font-family: var(--mono, 'SF Mono', Consolas, monospace); font-size: 11.5px; line-height: 1.6; color: var(--text-primary); background: var(--input-bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin: 0; white-space: pre-wrap; word-break: break-all; }
.muted-note { font-size: 12px; color: var(--text-dim); line-height: 1.5; margin: 0; }

.b-disclose { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 8px; background: none; border: none; color: var(--text-primary); padding: 4px 0; cursor: pointer; min-height: 28px; font-size: 13px; font-weight: 500; text-align: left; }
.b-disclose small { font-size: 12px; color: var(--text-dim); font-weight: 400; }
.b-chev { transition: transform 150ms; }
.b-disc-l { flex: 1; }
.b-disc-hint { margin-left: auto; font-size: 12px; font-weight: 600; color: var(--text-dim); }
.b-disclose[aria-expanded='true'] .b-chev { transform: rotate(90deg); }
.b-plugs { display: flex; flex-direction: column; gap: 8px; }
.b-filter { width: 100%; font-size: 12.5px; padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border-hi); background: var(--input-bg); color: var(--text-primary); font-family: inherit; min-height: 30px; box-sizing: border-box; }
.b-filter::placeholder { color: var(--text-dim); }
.plug-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.plug-list-after-seg { margin-top: -2px; } /* the card gap is 10px, the segmented control sits 8px above its list */
.b-plug { display: flex; align-items: center; gap: 10px; padding: 6px 2px; min-height: 32px; border-bottom: 1px solid var(--border); }
.b-plug:last-child { border-bottom: none; }
.b-plug-name { font-size: 12.5px; font-weight: 600; flex: 1; min-width: 0; }
.b-plug-wrap { flex-wrap: wrap; }
.b-plug-top { display: flex; align-items: center; gap: 8px; }
/* The chip must not grow the first line, so a row keeps its height with or without it. */
.b-plug-top .chip { margin: -3px 0; }
.chip-warn { color: var(--op-state-warning-text); border-color: var(--op-state-warning-border); background: var(--op-state-warning-bg); font-family: inherit; cursor: pointer; }
.chip-warn .b-chev { transition: transform 150ms; }
.chip-warn .b-chev.is-open { transform: rotate(90deg); }
.b-issues { order: 3; flex-basis: 100%; border-radius: 8px; border: 1px solid var(--op-state-warning-border); background: var(--op-state-warning-bg); color: var(--op-state-warning-text); padding: 8px 12px; margin: 2px 0 4px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; line-height: 1.45; font-weight: 400; }
.b-issue { display: flex; gap: 8px; align-items: baseline; }
.b-issue-name { font-family: var(--mono, 'SF Mono', Consolas, monospace); font-size: 11.5px; font-weight: 600; flex: 0 1 auto; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.b-plug-d { display: block; font-weight: 400; font-size: 12px; color: var(--text-dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.empty { padding: 8px 0; font-size: 12.5px; color: var(--text-dim); line-height: 1.5; }
.field-input { width: 100%; box-sizing: border-box; outline: none; }
.field-input:hover { border-color: var(--accent); }
.field-input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.field-input.is-invalid { border-color: var(--op-state-error-border); }
.b-port-default { white-space: nowrap; }
.b-port-msg { grid-column: 2 / -1; margin-bottom: 4px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

.dialog-body-text { font-size: 13px; line-height: 1.55; color: var(--text-primary); margin: 0 0 8px; }
.mcp-danger-btn { padding: 8px 20px; border-radius: 10px; font-size: 13.5px; font-weight: 600; border: none; background: #dc2626; color: #fff; cursor: pointer; }
.mcp-danger-btn:hover { background: #b91c1c; }
</style>
