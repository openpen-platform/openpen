<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { AppBanner } from '@openpen/module-api/uikit'

const { t } = useI18n()

type CustomTab = 'local' | 'github'

withDefaults(defineProps<{
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

async function pickFolder() {
  const picked = await window.openPenApi?.pickPluginFolder()
  if (!picked) return
  selectedPath.value = picked
  localStatus.value = 'ok'
  localStatusMessage.value = t('pluginLocalDetected', { path: picked })
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
    <div v-if="open" class="pac-overlay" @click.self="emit('update:open', false)">
      <div class="pac-modal mp-custom-modal">
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
          <button class="mp-custom-sub-tab" :class="{ active: activeTab === 'local' }" @click="activeTab = 'local'">
            {{ t('pluginTabLocal') }}
          </button>
          <button class="mp-custom-sub-tab" :class="{ active: activeTab === 'github' }" @click="activeTab = 'github'">
            {{ t('pluginTabGitHub') }}
          </button>
        </div>

        <!-- Warning banner -->
        <AppBanner variant="warning">{{ t('pluginCustomWarning') }}</AppBanner>

        <!-- Tab content area — animated on tab switch -->
        <div v-auto-animate>
          <!-- Local folder tab -->
          <div v-if="activeTab === 'local'" class="mp-tab-content">
            <div class="mp-drop-zone" @click="pickFolder">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {{ t('pluginDropZone') }}
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
  padding: 28px 20px; text-align: center; font-size: 12.5px; color: var(--text-muted);
  background: var(--row-bg); display: flex; flex-direction: column;
  align-items: center; gap: 8px; cursor: pointer;
  transition: border-color var(--t-fast), background var(--t-fast);
}
.mp-drop-zone:hover {
  border-color: rgba(129, 140, 248, 0.55); background: var(--accent-bg);
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
