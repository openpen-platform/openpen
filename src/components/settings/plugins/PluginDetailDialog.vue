<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useEscapeLayer } from '../../../composables/useEscapeLayer'
import { FocusScope } from 'reka-ui'
import { useDialogFocusReturn } from '../../../composables/useDialogFocusReturn'
import { demoScreenshotIndex, listingDescription, prefersReducedMotion } from '../../../services/marketplace-listing'
import PluginListingIcon from './PluginListingIcon.vue'
import PluginListingShot from './PluginListingShot.vue'

const { t, locale } = useI18n()

const props = defineProps<{
  open: boolean
  entry: CatalogEntry | null
  installedVersion: string | null
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  install: [id: string, version: string]
  update: [id: string, version: string]
  uninstall: [id: string]
}>()

const isInstalled = computed(() => !!props.installedVersion)
const hasUpdate = computed(() =>
  isInstalled.value &&
  props.entry?.latestVersion &&
  props.entry.latestVersion !== props.installedVersion
)

const description = computed(() => (props.entry ? listingDescription(props.entry, locale.value) : ''))
const shotCount = computed(() => props.entry?.screenshots?.length ?? 0)

// The full-width image on top: the demo GIF, so it plays as soon as the dialog
// opens; with reduce motion on, the still cover instead. Other screenshots sit
// below and swap into the top slot when clicked.
const reducedMotion = ref(false)
const heroIndex = ref(0)
watch(
  () => (props.open ? props.entry : null),
  (entry) => {
    if (!entry) return
    reducedMotion.value = prefersReducedMotion()
    heroIndex.value = reducedMotion.value ? 0 : demoScreenshotIndex(entry)
  },
  { immediate: true },
)
const otherShots = computed(() =>
  Array.from({ length: shotCount.value }, (_, i) => i).filter((i) => i !== heroIndex.value),
)

function openReport() {
  if (!props.entry) return
  window.openPenApi?.openPluginReport(props.entry.id, props.installedVersion ?? props.entry.latestVersion)
}

function openRepo() {
  if (!props.entry) return
  window.openPenApi?.openPluginRepo(props.entry.id)
}

useEscapeLayer(() => props.open, () => emit('update:open', false))
const onUnmountAutoFocus = useDialogFocusReturn(() => props.open)
</script>

<template>
  <Teleport to="body">
    <div v-if="open && entry" class="pd-overlay" @click.self="emit('update:open', false)">
      <FocusScope as-child trapped loop @unmount-auto-focus="onUnmountAutoFocus">
        <div role="dialog" aria-modal="true" aria-labelledby="pd-dialog-title" tabindex="-1" class="pd-modal mp-detail-modal" data-testid="plugin-detail-dialog">
        <!-- Header bar -->
        <div class="pd-header">
          <PluginListingIcon :entry="entry" class="pd-icon" />
          <div class="pd-head-text">
            <div class="pd-name" id="pd-dialog-title">{{ entry.name }}</div>
            <div class="pd-scope">{{ entry.id }}</div>
            <div class="pd-author">
              by {{ entry.ownerLogin }}
              <template v-if="entry.repo">
                · <a :href="entry.repo" class="pd-link" data-testid="plugin-detail-repo-link" @click.prevent="openRepo" @auxclick.prevent>
                  {{ entry.repo.replace('https://github.com/', 'github.com/') }}
                </a>
              </template>
            </div>
          </div>
          <button class="pd-close" :aria-label="t('close')" @click="emit('update:open', false)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div class="pd-scroll">
          <!-- Full-width demo -->
          <PluginListingShot
            v-if="shotCount > 0"
            :key="heroIndex"
            :entry="entry"
            :index="heroIndex"
            class="pd-hero"
            data-testid="plugin-detail-hero"
          />

          <div class="pd-below">
            <!-- Update available callout -->
            <div v-if="hasUpdate" class="pd-update-callout">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" style="flex-shrink:0;">
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>
              </svg>
              <div>
                <div class="pd-update-version">{{ entry.latestVersion }} {{ t('pluginUpdateAvailable') }}</div>
                <div class="pd-update-current">{{ t('pluginCurrentVersion', { version: installedVersion }) }}</div>
              </div>
            </div>

            <!-- Description + actions -->
            <div class="pd-act">
              <p class="pd-desc" data-testid="plugin-detail-desc">{{ description }}</p>
              <div class="pd-actions">
                <button v-if="isInstalled" class="cw-btn cw-btn-cancel" @click="entry && emit('uninstall', entry.id)">
                  {{ t('pluginUninstall') }}
                </button>
                <button
                  v-if="hasUpdate"
                  class="cw-btn cw-btn-save"
                  @click="entry && emit('update', entry.id, entry.latestVersion)"
                >
                  {{ t('pluginUpdateTo', { version: entry.latestVersion }) }}
                </button>
                <button
                  v-else-if="isInstalled"
                  class="cw-btn cw-btn-save"
                  disabled
                >
                  {{ t('pluginInstalled') }}
                </button>
                <button
                  v-else
                  class="cw-btn cw-btn-save"
                  @click="entry && emit('install', entry.id, entry.latestVersion)"
                >
                  {{ t('pluginInstall') }}
                </button>
              </div>
            </div>

            <!-- Other screenshots -->
            <div v-if="otherShots.length" class="pd-more" data-testid="plugin-detail-more">
              <span class="pd-more-label">{{ t('pluginOtherScreenshots') }}</span>
              <button
                v-for="i in otherShots"
                :key="i"
                type="button"
                class="pd-thumb"
                data-testid="plugin-detail-thumb"
                :aria-label="`${t('pluginScreenshot')} ${i + 1}`"
                @click="heroIndex = i"
              >
                <PluginListingShot :entry="entry" :index="i" :still="true" class="pd-thumb-img" />
              </button>
            </div>

            <!-- Meta -->
            <div class="pd-meta">
              <span class="pd-meta-chip">{{ t('pluginMinVersion', { version: entry.minAppVersion }) }}</span>
              <span v-if="entry.forkOf" class="pd-meta-chip">Fork of {{ entry.forkOf }}</span>
              <button
                type="button"
                class="pd-report-btn"
                data-testid="plugin-detail-report-btn"
                :title="t('pluginReportHint')"
                @click="openReport"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                  <path d="M4 22V4h12l-1.5 4L16 12H4"/>
                </svg>
                {{ t('pluginReport') }}
              </button>
            </div>
          </div>
        </div>
        </div>
      </FocusScope>
    </div>
  </Teleport>
</template>

<style scoped>
.pd-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.pd-modal {
  display: flex; flex-direction: column;
  width: 526px; max-width: calc(100% - 16px); max-height: min(560px, calc(100% - 16px));
  box-sizing: border-box; overflow: hidden;
  background: var(--surface-popup); border: 1px solid var(--border-hi);
  border-radius: var(--radius);
  box-shadow: var(--shadow), 0 0 40px rgba(0,0,0,0.35);
  backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
}
.pd-header { display: flex; align-items: center; gap: 10px; padding: 14px 16px 12px 20px; flex-shrink: 0; }
.pd-icon { width: 32px; height: 32px; border-radius: 8px; }
.pd-head-text { min-width: 0; flex: 1; }
.pd-name { font-size: 16px; font-weight: 700; color: var(--text-primary); }
.pd-scope {
  font-family: 'SF Mono', 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px; color: var(--text-dim);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pd-author { font-size: 12px; color: var(--text-dim); margin-top: 2px; overflow-wrap: anywhere; }
.pd-link { color: var(--text-dim); text-decoration: underline; text-underline-offset: 2px; }
.pd-link:hover { color: var(--accent); }
.pd-close {
  width: 26px; height: 26px; border-radius: 6px; border: none;
  background: transparent; cursor: pointer; display: flex; align-items: center;
  justify-content: center; color: var(--text-dim); flex-shrink: 0;
  transition: background var(--t-fast);
}
.pd-close:hover { background: var(--row-bg); }

.pd-scroll { overflow-y: auto; min-height: 0; }
.pd-hero {
  width: 100%; height: auto; aspect-ratio: 960 / 675;
  border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);
  box-sizing: border-box;
}
.pd-below { display: flex; flex-direction: column; gap: 12px; padding: 16px 22px 20px; }

.pd-update-callout {
  display: flex; align-items: center; gap: 8px; padding: 8px 12px;
  background: rgba(251, 191, 36, 0.10); border: 1px solid rgba(251, 191, 36, 0.30);
  border-radius: var(--radius-sm);
}
.pd-update-version { font-size: 12px; font-weight: 600; color: #b45309; }
.pd-update-current { font-size: 11px; color: #b45309; opacity: 0.85; }

.pd-act { display: flex; align-items: flex-start; gap: 14px; }
.pd-desc { flex: 1; min-width: 0; font-size: 13px; color: var(--text-primary); line-height: 1.65; margin: 0; overflow-wrap: anywhere; }
.pd-actions { display: flex; gap: 8px; flex-shrink: 0; }

.pd-more { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.pd-more-label { font-size: 11px; color: var(--text-dim); }
.pd-thumb {
  width: 96px; padding: 0; border: 1px solid var(--border); border-radius: 6px;
  overflow: hidden; background: none; cursor: pointer;
}
.pd-thumb:hover { border-color: var(--border-hi); }
.pd-thumb:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.pd-thumb-img { width: 100%; height: auto; aspect-ratio: 960 / 675; }

.pd-meta { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.pd-report-btn {
  margin-left: auto; display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; color: var(--text-muted); background: transparent;
  border: none; padding: 3px 4px; cursor: pointer;
  transition: color var(--t-fast);
}
.pd-report-btn:hover { color: var(--danger); text-decoration: underline; }
.pd-meta-chip {
  font-size: 11px; color: var(--text-muted); background: var(--row-bg);
  border: 1px solid var(--border); padding: 3px 9px; border-radius: 999px;
}
</style>
