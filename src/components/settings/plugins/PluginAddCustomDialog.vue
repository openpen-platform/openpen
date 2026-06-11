<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { AppBanner } from '@openpen/module-api/uikit'

const { t } = useI18n()

type CustomTab = 'local' | 'github'

const props = withDefaults(defineProps<{
  open: boolean
  installing?: boolean
  errorMessage?: string | null
}>(), {
  installing: false,
  errorMessage: null,
})

const emit = defineEmits<{
  'update:open': [boolean]
  installLocal: [sourcePath: string]
  installGitHub: [repoUrl: string]
}>()

const activeTab = ref<CustomTab>('local')
const selectedPath = ref<string | null>(null)
const repoUrl = ref('')
const repoUrlError = ref<string | null>(null)
const localStatus = ref<'idle' | 'ok' | 'error'>('idle')
const localStatusMessage = ref('')
const dragActive = ref(false)

// The dialog uses v-if on its inner template but the component itself never
// unmounts, so setup-script refs would otherwise persist across openings.
// Reset on every open→true transition so a re-opened dialog is always clean.
// The open/close transitions also drive the main process's drop-mode toggle:
// while the dialog is up, the settings window drops from 'screen-saver' to
// 'floating' so macOS NSWindowServer will actually deliver OS drag sessions
// onto the drop zone.
onUnmounted(() => {
  if (props.open) window.openPenApi?.exitLocalInstallMode()
})

watch(() => props.open, (isOpen, wasOpen) => {
  if (isOpen && !wasOpen) {
    activeTab.value = 'local'
    selectedPath.value = null
    repoUrl.value = ''
    repoUrlError.value = null
    localStatus.value = 'idle'
    localStatusMessage.value = ''
    dragActive.value = false
    window.openPenApi?.enterLocalInstallMode()
  } else if (!isOpen && wasOpen) {
    window.openPenApi?.exitLocalInstallMode()
  }
})

function acceptPath(picked: string) {
  selectedPath.value = picked
  localStatus.value = 'ok'
  localStatusMessage.value = t('pluginLocalDetected', { path: picked })
}

async function pickFolder() {
  const picked = await window.openPenApi?.pickPluginFolder()
  if (!picked) return
  acceptPath(picked)
}

async function pickZip() {
  const picked = await window.openPenApi?.pickPluginZip()
  if (!picked) return
  acceptPath(picked)
}

function resolveDroppedPath(event: DragEvent): string | null {
  // Tier 1: webUtils.getPathForFile via preload. This is the canonical post-
  // Electron-32 API but only returns a non-empty string when the WebBlob
  // backing the File still exists in this synchronous tick — i.e. the call
  // must happen inside the native drop handler before any await / Vue
  // reactive boundary clones the event.
  const file = event.dataTransfer?.files?.[0]
  const viaWebUtils = file ? window.openPenApi?.getDroppedFilePath(file) : null

  // Tier 2: text/uri-list. macOS Finder and most Linux file managers set this
  // MIME type with `file://` URLs. Web-standard, independent of Electron API.
  const uriList = event.dataTransfer?.getData('text/uri-list') ?? ''
  let viaUriList: string | null = null
  if (uriList) {
    const line = uriList.split(/[\r\n]+/).map((s) => s.trim()).find((l) => l.startsWith('file://'))
    if (line) {
      try {
        viaUriList = decodeURIComponent(new URL(line).pathname)
      } catch { /* malformed URI — ignore */ }
    }
  }

  // Tier 3: text/plain. Windows Explorer sometimes only sets this with the
  // raw path. Cheap last-ditch.
  const plain = event.dataTransfer?.getData('text/plain')?.trim() ?? ''
  const viaPlain = plain && (plain.startsWith('/') || /^[A-Za-z]:[\\/]/.test(plain)) ? plain : null

  if (import.meta.env.DEV) {
    console.log('[PluginAddCustomDialog] drop diagnostics', {
      types: event.dataTransfer ? Array.from(event.dataTransfer.types) : [],
      fileCount: event.dataTransfer?.files?.length ?? 0,
      tier1_webUtils: viaWebUtils,
      tier2_uriList: viaUriList,
      tier3_plain: viaPlain,
    })
  }

  return viaWebUtils || viaUriList || viaPlain || null
}

function handleDrop(event: DragEvent) {
  dragActive.value = false
  const droppedPath = resolveDroppedPath(event)
  if (!droppedPath) return
  acceptPath(droppedPath)
}

function handleDragOver(event: DragEvent) {
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
  dragActive.value = true
}

function handleDragLeave() {
  dragActive.value = false
}

function validateRepoUrl() {
  const v = repoUrl.value.trim()
  if (!v) { repoUrlError.value = null; return }
  const validPattern = /^(https?:\/\/)?github\.com\/[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+\/?$/
  repoUrlError.value = validPattern.test(v) ? null : t('pluginRepoUrlInvalid')
}

const canInstallLocal = computed(() => selectedPath.value !== null && localStatus.value === 'ok')
const canInstallGitHub = computed(() => repoUrl.value.trim().length > 0 && !repoUrlError.value)

function install() {
  if (activeTab.value === 'local' && selectedPath.value) {
    emit('installLocal', selectedPath.value)
  } else if (activeTab.value === 'github' && canInstallGitHub.value) {
    emit('installGitHub', repoUrl.value.trim())
  }
  // Parent owns close; it will set open=false on success or surface
  // errorMessage prop on failure.
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="pac-overlay" data-testid="pac-overlay" @click.self="emit('update:open', false)">
      <div class="pac-modal mp-custom-modal" data-testid="pac-modal">
        <!-- Header -->
        <div class="pac-header">
          <div class="pac-title">{{ t('pluginAddCustomTitle') }}</div>
          <button class="pac-close" :aria-label="t('close')" @click="emit('update:open', false)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Source sub-tabs -->
        <div class="mp-custom-sub-tabs">
          <button class="mp-custom-sub-tab" data-testid="pac-tab-local" :class="{ active: activeTab === 'local' }" :aria-pressed="activeTab === 'local'" @click="activeTab = 'local'">
            {{ t('pluginTabLocal') }}
          </button>
          <button class="mp-custom-sub-tab" data-testid="pac-tab-github" :class="{ active: activeTab === 'github' }" :aria-pressed="activeTab === 'github'" @click="activeTab = 'github'">
            {{ t('pluginTabGitHub') }}
          </button>
        </div>

        <!-- Warning banner -->
        <AppBanner variant="warning">{{ t('pluginCustomWarning') }}</AppBanner>

        <!-- Tab content area — animated on tab switch -->
        <div v-auto-animate>
          <!-- Local folder / zip tab -->
          <div v-if="activeTab === 'local'" class="mp-tab-content">
            <div
              class="mp-drop-zone"
              data-testid="pac-drop-zone"
              :class="{ 'is-drag-active': dragActive }"
              @dragenter.prevent="handleDragOver"
              @dragover.prevent="handleDragOver"
              @dragleave.prevent="handleDragLeave"
              @drop.prevent="handleDrop"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span>{{ t('pluginDropZone') }}</span>
              <div class="mp-drop-actions">
                <button type="button" class="mp-pick-btn" @click="pickFolder">
                  {{ t('pluginPickFolder') }}
                </button>
                <button type="button" class="mp-pick-btn" @click="pickZip">
                  {{ t('pluginPickZip') }}
                </button>
              </div>
            </div>

            <div v-if="selectedPath" class="mp-path-display">{{ selectedPath }}</div>

            <AppBanner v-if="localStatus !== 'idle'" :variant="localStatus === 'ok' ? 'success' : 'error'" inline>
              {{ localStatusMessage }}
            </AppBanner>
          </div>

          <!-- GitHub repo tab -->
          <div v-else-if="activeTab === 'github'" class="mp-tab-content">
            <input
              v-model="repoUrl"
              type="text"
              class="mp-input-field"
              data-testid="pac-repo-input"
              :placeholder="t('pluginRepoPlaceholder')"
              :aria-label="t('pluginRepoLabel')"
              @blur="validateRepoUrl"
            />
            <div class="mp-input-hint">{{ t('pluginRepoHint') }}</div>
            <AppBanner v-if="repoUrlError" variant="error" inline>{{ repoUrlError }}</AppBanner>
          </div>
        </div>

        <!-- Error feedback (install failure) -->
        <AppBanner v-if="errorMessage" variant="error" inline>{{ errorMessage }}</AppBanner>

        <!-- Footer -->
        <div class="pac-actions">
          <button
            class="cw-btn cw-btn-cancel"
            :disabled="installing"
            @click="emit('update:open', false)"
          >{{ t('cancel') }}</button>
          <button
            class="cw-btn cw-btn-save"
            :disabled="installing || (activeTab === 'local' ? !canInstallLocal : !canInstallGitHub)"
            @click="install"
          >
            {{ installing ? t('pluginInstallingButton') : t('pluginInstallAction') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pac-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.pac-modal {
  display: flex; flex-direction: column; gap: 14px;
  min-width: 320px; max-width: 400px; width: 90%;
  background: var(--surface-hi); border: 1px solid var(--border-hi);
  border-radius: var(--radius); padding: 20px 22px;
  box-shadow: var(--shadow), 0 0 40px rgba(0,0,0,0.35);
  backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
}
.pac-header { display: flex; align-items: center; justify-content: space-between; }
.pac-title { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.pac-close {
  width: 26px; height: 26px; border-radius: 6px; border: none;
  background: transparent; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: var(--text-muted); flex-shrink: 0;
  transition: background var(--t-fast);
}
.pac-close:hover { background: var(--row-bg); }

.mp-custom-sub-tabs {
  display: inline-flex; gap: 2px; background: var(--row-bg);
  border: 1px solid var(--border); border-radius: var(--radius-full); padding: 3px;
  align-self: flex-start;
}
.mp-custom-sub-tab {
  padding: 4px 14px; font-size: 12px; font-weight: 500; color: var(--text-muted);
  border: none; background: transparent; cursor: pointer; border-radius: var(--radius-full);
  transition: background var(--t-fast), color var(--t-fast);
}
.mp-custom-sub-tab:hover { color: var(--text-dim); }
.mp-custom-sub-tab.active {
  background: var(--surface-hi); color: var(--text-primary);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.20);
}

.mp-drop-zone {
  border: 1.5px dashed var(--border-hi); border-radius: var(--radius-sm);
  padding: 24px 20px 18px; text-align: center; font-size: 12.5px; color: var(--text-muted);
  background: var(--row-bg); display: flex; flex-direction: column;
  align-items: center; gap: 8px;
  transition: border-color var(--t-fast), background var(--t-fast);
}
.mp-drop-zone.is-drag-active {
  border-color: rgba(129, 140, 248, 0.75); background: var(--accent-bg);
}
.mp-drop-actions {
  display: flex; gap: 8px; margin-top: 6px;
}
.mp-pick-btn {
  padding: 5px 12px; font-size: 12px; font-weight: 500; color: var(--text-primary);
  background: var(--surface-hi); border: 1px solid var(--border-hi);
  border-radius: var(--radius-sm); cursor: pointer;
  transition: background var(--t-fast), border-color var(--t-fast);
}
.mp-pick-btn:hover {
  background: var(--accent-bg); border-color: rgba(129, 140, 248, 0.55);
}
.mp-path-display {
  font-family: 'SF Mono', 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px; color: var(--text-dim); background: var(--row-bg);
  border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; word-break: break-all;
}
.mp-input-field {
  width: 100%; padding: 7px 12px; background: var(--input-bg);
  border: 1px solid var(--border-hi); border-radius: var(--radius-sm);
  color: var(--text-primary); font-size: 13px; outline: none; box-sizing: border-box;
}
.mp-input-field::placeholder { color: var(--text-muted); opacity: 0.4; }
.mp-input-hint { font-size: 11.5px; color: var(--text-muted); line-height: 1.5; }
.mp-tab-content { display: flex; flex-direction: column; gap: 14px; }
.pac-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
</style>
