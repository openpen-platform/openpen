<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { AppBanner } from '@openpen/module-api/uikit'

const { t } = useI18n()

type InstallStage = 'idle' | 'downloading' | 'verifying' | 'extracting' | 'completed' | 'failed'
type OperationKind = 'install' | 'upgrade' | 'reinstall' | 'downgrade'

const props = defineProps<{
  open: boolean
  pluginId: string
  version?: string
  currentVersion?: string
  stage: InstallStage
  percent: number
  errorMessage?: string | null
  operationKind?: OperationKind
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  dismiss: []
  retry: []
  restart: []
}>()

const progressPercent = computed(() => {
  if (props.stage === 'downloading') return props.percent
  if (props.stage === 'verifying' || props.stage === 'extracting') return 100
  if (props.stage === 'completed') return 100
  return 0
})

const progressColor = computed(() =>
  props.stage === 'completed' ? 'var(--success)' : 'var(--accent)'
)

const titleText = computed(() => {
  const kind = props.operationKind ?? 'install'
  if (kind === 'upgrade') return t('pluginUpgradingTo', { version: props.version ?? '' })
  if (kind === 'reinstall') return t('pluginReinstalling')
  if (kind === 'downgrade') return t('pluginDowngradingTo', { version: props.version ?? '' })
  return t('pluginInstalling', { id: props.pluginId })
})

const subtitleText = computed(() => {
  const kind = props.operationKind ?? 'install'
  if ((kind === 'upgrade' || kind === 'downgrade') && props.currentVersion) {
    return t('pluginCurrentVersion', { version: props.currentVersion })
  }
  return props.version ?? null
})

const completedBannerText = computed(() => {
  const kind = props.operationKind ?? 'install'
  if (kind === 'upgrade') return t('pluginUpgradeCompleted', { version: props.version ?? '' })
  if (kind === 'reinstall') return t('pluginReinstallCompleted')
  if (kind === 'downgrade') return t('pluginDowngradeCompleted', { version: props.version ?? '' })
  return t('pluginRestartRequired')
})

type StepStatus = 'done' | 'active' | 'pending'

const downloadStatus = computed<StepStatus>(() => {
  if (props.stage === 'downloading') return 'active'
  if (['verifying', 'extracting', 'completed'].includes(props.stage)) return 'done'
  return 'pending'
})
const verifyStatus = computed<StepStatus>(() => {
  if (props.stage === 'verifying') return 'active'
  if (['extracting', 'completed'].includes(props.stage)) return 'done'
  return 'pending'
})
const extractStatus = computed<StepStatus>(() => {
  if (props.stage === 'extracting') return 'active'
  if (props.stage === 'completed') return 'done'
  return 'pending'
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="pip-overlay">
      <div class="pip-modal mp-progress-modal" v-auto-animate>
        <div class="pip-title">{{ titleText }}</div>
        <div v-if="subtitleText" class="pip-version">{{ subtitleText }}</div>

        <!-- Progress bar -->
        <div class="pip-progress-track">
          <div
            class="pip-progress-fill"
            :style="{ width: progressPercent + '%', background: progressColor }"
          />
        </div>

        <!-- Steps -->
        <div v-if="stage !== 'failed'" class="pip-steps">
          <div class="pip-step">
            <svg v-if="downloadStatus === 'done'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
            <svg v-else-if="downloadStatus === 'active'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5"><circle cx="12" cy="12" r="9"/></svg>
            <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--border-hi)" stroke-width="2.5"><circle cx="12" cy="12" r="9"/></svg>
            <span :class="['pip-step-label', downloadStatus]">{{ t('pluginStepDownload') }}</span>
          </div>
          <div class="pip-step">
            <svg v-if="verifyStatus === 'done'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
            <svg v-else-if="verifyStatus === 'active'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5"><circle cx="12" cy="12" r="9"/></svg>
            <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--border-hi)" stroke-width="2.5"><circle cx="12" cy="12" r="9"/></svg>
            <span :class="['pip-step-label', verifyStatus]">{{ t('pluginStepVerify') }}</span>
          </div>
          <div class="pip-step">
            <svg v-if="extractStatus === 'done'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5"><path d="M20 6 9 17l-5-5"/></svg>
            <svg v-else-if="extractStatus === 'active'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.5"><circle cx="12" cy="12" r="9"/></svg>
            <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--border-hi)" stroke-width="2.5"><circle cx="12" cy="12" r="9"/></svg>
            <span :class="['pip-step-label', extractStatus]">{{ t('pluginStepExtract') }}</span>
          </div>
        </div>

        <!-- Error state -->
        <AppBanner v-if="stage === 'failed'" variant="error" inline>
          {{ errorMessage || t('pluginInstallFailed') }}
        </AppBanner>

        <!-- Completed / restart required -->
        <AppBanner v-if="stage === 'completed'" variant="success" inline>
          {{ completedBannerText }}
        </AppBanner>

        <!-- Actions -->
        <div class="pip-actions">
          <template v-if="stage === 'completed'">
            <button class="cw-btn cw-btn-cancel" @click="emit('dismiss')">{{ t('pluginLater') }}</button>
            <button class="cw-btn cw-btn-save" @click="emit('restart')">{{ t('pluginRestart') }}</button>
          </template>
          <template v-else-if="stage === 'failed'">
            <button class="cw-btn cw-btn-cancel" @click="emit('dismiss')">{{ t('pluginDismiss') }}</button>
            <button class="cw-btn cw-btn-save" @click="emit('retry')">{{ t('pluginRetry') }}</button>
          </template>
          <template v-else>
            <button
              class="cw-btn cw-btn-cancel"
              :disabled="stage !== 'downloading'"
              @click="emit('dismiss')"
            >
              {{ t('cancel') }}
            </button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pip-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.pip-modal {
  display: flex; flex-direction: column; gap: 14px;
  min-width: 320px; max-width: 400px; width: 90%;
  background: var(--surface-hi); border: 1px solid var(--border-hi);
  border-radius: var(--radius); padding: 20px 22px; box-shadow: var(--shadow);
  backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
}
.pip-title { font-size: 14px; font-weight: 700; color: var(--text-primary); }
.pip-version { font-size: 12px; color: var(--text-muted); }

.pip-progress-track {
  width: 100%; height: 6px; background: var(--toggle-off-bg);
  border-radius: 3px; overflow: hidden;
}
.pip-progress-fill {
  height: 100%; border-radius: 3px;
  transition: width 300ms ease, background 300ms ease;
}

.pip-steps { display: flex; flex-direction: column; gap: 6px; }
.pip-step { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.pip-step-label.done { color: var(--text-dim); }
.pip-step-label.active { color: var(--text-primary); font-weight: 500; }
.pip-step-label.pending { color: var(--text-muted); }

.pip-actions { display: flex; gap: 8px; justify-content: flex-end; }
</style>
