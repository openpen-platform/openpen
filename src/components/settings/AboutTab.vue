<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const appVersion = __APP_VERSION__;

// Authoritative update state lives in the main process; this tab only mirrors
// the snapshot it pulls + the broadcasts it subscribes to.
const update = ref<UpdateState | null>(null);
let unsubscribe: (() => void) | undefined;

onMounted(async () => {
  update.value = (await window.openPenApi?.getUpdateState()) ?? null;
  unsubscribe = window.openPenApi?.onUpdateStateChanged((state) => {
    update.value = state;
  });
});

onBeforeUnmount(() => unsubscribe?.());

const status = computed(() => update.value?.status ?? 'idle');
const isChecking = computed(() => status.value === 'checking' || status.value === 'downloading');
// Portable builds carry no installer, so the main process reports supported:false
// and never wires the updater. Hide the update controls entirely in that case.
const updatesSupported = computed(() => update.value?.supported !== false);
// Notify-only platforms (unsigned macOS) never download/install in-place;
// "available" is the terminal state there and resolves to a download-page link.
const notifyOnly = computed(() => update.value?.notifyOnly === true);

// "Later" hides the banner for this settings session, keyed to the offered
// version so a newer release re-surfaces it.
const dismissedVersion = ref<string | null>(null);

const showBanner = computed(() => {
  if (!updatesSupported.value) return false;
  if (!['available', 'downloading', 'downloaded'].includes(status.value)) return false;
  return update.value?.version !== dismissedVersion.value;
});

// The banner is dismissible only in its actionable terminal states; an active
// download just runs to completion.
const bannerDismissible = computed(() =>
  status.value === 'downloaded' || (status.value === 'available' && notifyOnly.value),
);

const bannerTitle = computed(() => {
  const s = update.value;
  if (!s) return '';
  switch (s.status) {
    // Notify-only never downloads, so the full-flow "downloading…" phrasing
    // would announce something that is not happening.
    case 'available':
      return s.notifyOnly
        ? t('updateAvailableNotifyOnly', { version: s.version ?? '' })
        : t('updateAvailable', { version: s.version ?? '' });
    case 'downloading': return t('updateDownloading', { percent: s.percent });
    case 'downloaded': return t('updateReady', { version: s.version ?? '' });
    default: return '';
  }
});

// Quiet states (and a dismissed banner) report through the version row instead.
const rowStatusLabel = computed(() => {
  const s = update.value;
  if (!s || showBanner.value) return '';
  switch (s.status) {
    case 'checking': return t('updateChecking');
    case 'not-available': return t('updateUpToDate');
    case 'error': return t('updateError', { error: s.error ?? '' });
    case 'available':
      return s.notifyOnly ? t('updateAvailableNotifyOnly', { version: s.version ?? '' }) : '';
    case 'downloaded': return t('updateReady', { version: s.version ?? '' });
    default: return '';
  }
});

function checkForUpdate() {
  window.openPenApi?.checkForUpdate();
}

function installUpdate() {
  window.openPenApi?.quitAndInstallUpdate();
}

function openDownloadPage() {
  window.openPenApi?.openUpdateDownloadPage();
}

function dismissBanner() {
  dismissedVersion.value = update.value?.version ?? null;
}
</script>

<template>
  <div class="cw-section">
    <div class="cw-section-title">{{ t('sectionAbout') }}</div>

    <div v-if="showBanner" class="update-banner" data-testid="update-banner">
      <div class="update-banner-title">{{ bannerTitle }}</div>
      <div v-if="status === 'downloading'" class="update-progress">
        <div class="update-progress-fill" :style="{ width: `${update?.percent ?? 0}%` }" />
      </div>
      <div v-else class="update-banner-actions">
        <button
          v-if="status === 'downloaded'"
          class="upd-btn upd-btn-install"
          data-testid="update-install-btn"
          @click="installUpdate"
        >
          {{ t('updateRestartInstall') }}
        </button>
        <button
          v-else-if="notifyOnly && status === 'available'"
          class="upd-btn upd-btn-install"
          data-testid="update-download-page-btn"
          @click="openDownloadPage"
        >
          {{ t('updateOpenDownloadPage') }}
        </button>
        <button
          v-if="bannerDismissible"
          class="upd-btn"
          data-testid="update-later-btn"
          @click="dismissBanner"
        >
          {{ t('updateLater') }}
        </button>
      </div>
    </div>

    <div class="cw-row">
      <div>
        <div class="cw-row-label">{{ t('version') }}</div>
        <div v-if="rowStatusLabel" class="cw-row-sub" data-testid="update-status">{{ rowStatusLabel }}</div>
      </div>
      <div class="version-cell">
        <span class="about-val" data-testid="about-version">{{ appVersion }}</span>
        <template v-if="updatesSupported">
          <button
            v-if="!showBanner && status === 'downloaded'"
            class="upd-btn upd-btn-install"
            data-testid="update-install-btn"
            @click="installUpdate"
          >
            {{ t('updateRestartInstall') }}
          </button>
          <button
            v-else-if="!showBanner && notifyOnly && status === 'available'"
            class="upd-btn upd-btn-install"
            data-testid="update-download-page-btn"
            @click="openDownloadPage"
          >
            {{ t('updateOpenDownloadPage') }}
          </button>
          <button
            v-else
            class="upd-btn"
            data-testid="update-check-btn"
            :disabled="isChecking"
            @click="checkForUpdate"
          >
            {{ isChecking ? t('updateChecking') : t('checkForUpdate') }}
          </button>
        </template>
      </div>
    </div>

    <div class="cw-row">
      <div class="cw-row-label">{{ t('license') }}</div>
      <span class="about-val" data-testid="about-license">{{ t('licenseValue') }}</span>
    </div>

    <div class="cw-row">
      <div class="cw-row-label">{{ t('author') }}</div>
      <span class="about-val" data-testid="about-author">openpen/navishachiku</span>
    </div>

    <div class="desc-row">
      <p class="about-desc">{{ t('description') }}</p>
    </div>
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
.cw-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 8px;
  background: var(--row-bg);
  border: 1px solid var(--border);
  margin-bottom: 6px;
  gap: 12px;
}
.cw-row-label { font-size: 13.5px; font-weight: 500; }
.cw-row-sub   { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; }
.about-val { font-size: 13px; color: var(--text-muted); }

.version-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.update-banner {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  border-radius: 8px;
  margin-bottom: 6px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
}
.update-banner-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}
.update-banner-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.update-progress {
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  overflow: hidden;
}
.update-progress-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  transition: width 300ms ease;
}

.upd-btn {
  flex-shrink: 0;
  padding: 6px 14px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--border-hi);
  background: var(--input-bg);
  color: var(--text-primary);
  transition: background 150ms, border-color 150ms, opacity 150ms;
}
.upd-btn:hover:not(:disabled) { border-color: var(--accent); }
.upd-btn:disabled { opacity: 0.5; cursor: default; }
.upd-btn-install {
  background: var(--accent);
  color: #fff;
  border-color: transparent;
  box-shadow: 0 4px 14px var(--accent-glow);
}
.upd-btn-install:hover { background: #6366f1; }

.desc-row {
  margin-top: 14px;
  padding: 14px;
  border-radius: 8px;
  background: var(--row-bg);
  border: 1px solid var(--border);
}
.about-desc {
  font-size: 12.5px;
  color: var(--text-dim);
  line-height: 1.7;
  margin: 0;
}
</style>
