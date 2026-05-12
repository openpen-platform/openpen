<script setup lang="ts">
import { ref, reactive, watch, onMounted, computed, nextTick } from 'vue';
import type { Component } from 'vue';
import { useI18n } from 'vue-i18n';
import AppearanceTab from '../components/settings/AppearanceTab.vue';
import BehaviorTab from '../components/settings/BehaviorTab.vue';
import FeaturesTab from '../components/settings/FeaturesTab.vue';
import ModulesTab from '../components/settings/ModulesTab.vue';
import ShortcutsTab from '../components/settings/ShortcutsTab.vue';
import AboutTab from '../components/settings/AboutTab.vue';
import DiagnosticsTab from '../components/settings/DiagnosticsTab.vue';
import { pluginSettingsTabs } from '../services/plugin-registry';
import { resolveLabel } from '../services/i18n-utils';
import { getAppConfig } from '../services/config-bridge';
import { DEFAULT_SETTINGS } from '../../shared/settings-defaults.js';
import type { AppSettings } from '../types/settings';

const { t, locale } = useI18n();
const bgAlpha = getAppConfig().ui.settingsWindow.opacity;

const activeTab = ref<string>('appearance');
const tabsEl = ref<HTMLElement | null>(null);
const showLeftFade = ref(false);
const showRightFade = ref(false);

function updateFades() {
  const el = tabsEl.value;
  if (!el) return;
  showLeftFade.value = el.scrollLeft > 0;
  showRightFade.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}

function scrollTabs(dir: 'left' | 'right') {
  tabsEl.value?.scrollBy({ left: dir === 'right' ? 120 : -120, behavior: 'smooth' });
}

// Pre-fill draft with defaults so child :model-value bindings see defined
// values from first render. Empty {} forces the tabs into a `?? <fallback>`
// pattern where the UI shows a value the draft does not actually hold, and
// any wrapper emit before loadSettings() resolves writes the fallback back
// into the live cache via the previewSettings IPC.
const draft = reactive<AppSettings>({ ...DEFAULT_SETTINGS });

/** Gates the draft watcher so it only fires for user edits, not programmatic assigns. */
let isWatcherArmed = false;

/** Load the settings snapshot from main. */
async function loadSettings() {
  const settings = await window.openPenApi?.getSettings();
  if (settings) {
    isWatcherArmed = false;
    const { disabledModules: _, ...rest } = settings;
    Object.assign(draft, rest);
    // Defer live-preview until after Vue processes the Object.assign reactive update.
    // nextTick() resolves in the same microtask batch as Vue's re-render, so the
    // watcher is guaranteed armed before any subsequent macrotask runs.
    await nextTick();
    isWatcherArmed = true;
  }
}

/**
 * Any draft mutation triggers a live preview (no disk write).
 * Uses ipcRenderer.send (fire-and-forget) via previewSettings so the
 * broadcast doesn't interfere with the IPC reply channel.
 */
watch(
  () => ({ ...draft }),
  (snapshot) => {
    if (!isWatcherArmed) return;
    // Use JSON round-trip to strip any Vue reactive Proxies before IPC send.
    window.openPenApi?.previewSettings(JSON.parse(JSON.stringify(snapshot)));
  },
);

/** Cancel — revert any unsaved preview changes. */
async function handleCancel() {
  // Disarm the watcher before the async revert so no stale preview can fire
  // during the await window and overwrite the reverted cache.
  isWatcherArmed = false;
  await window.openPenApi?.revertSettings();
  window.openPenApi?.closeSettingsWindow();
}

/** Save — persist to disk (preview is already live in memory) and close. */
async function handleSave() {
  const { disabledModules: _, ...rest } = draft;
  try {
    await window.openPenApi?.updateSettings({ ...rest });
  } catch (err) {
    console.error('[SettingsView] updateSettings failed:', err);
  }
  window.openPenApi?.closeSettingsWindow();
}

// Deep-link to a specific tab on mount if requested (e.g. from the diagnostics badge).
// Using localStorage is the cleanest mechanism given the settings window is a separate
// Electron BrowserWindow instance that cannot share Vue state with the control bar.
const INITIAL_TAB_KEY = 'openpen.settings-initial-tab'

onMounted(async () => {
  const el = tabsEl.value;
  if (el) {
    // Convert vertical wheel to horizontal scroll. Needs { passive: false } to preventDefault().
    el.addEventListener('wheel', (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    }, { passive: false });
    el.addEventListener('scroll', updateFades, { passive: true });
    updateFades();
  }

  // Hydrate the form before revealing the window so callers waiting on the
  // window root cannot interact with controls bound to an empty draft. The
  // IPC round-trip is fast (~5–20 ms) and avoids a race where a click could
  // fire before initial settings populate `draft`.
  await loadSettings();

  // Signal main that Vue has mounted, so the window can show without a blank flash.
  window.openPenApi?.signalContentReady();

  const deepLink = localStorage.getItem(INITIAL_TAB_KEY);
  if (deepLink) {
    activeTab.value = deepLink;
    localStorage.removeItem(INITIAL_TAB_KEY);
  }
});

type TabEntry = { id: string; label: string; component: Component; props: Record<string, unknown> };

const TABS = computed<TabEntry[]>(() => [
  { id: 'appearance',  label: t('tabAppearance'),  component: AppearanceTab,  props: { draft } },
  { id: 'behavior',    label: t('tabBehavior'),    component: BehaviorTab,    props: { draft } },
  { id: 'features',    label: t('tabFeatures'),    component: FeaturesTab,    props: {} },
  { id: 'modules',     label: t('tabModules'),     component: ModulesTab,     props: {} },
  { id: 'shortcuts',   label: t('tabShortcuts'),   component: ShortcutsTab,   props: {} },
  { id: 'about',       label: t('tabAbout'),       component: AboutTab,       props: {} },
  { id: 'diagnostics', label: t('tabDiagnostics'), component: DiagnosticsTab, props: {} },
  ...pluginSettingsTabs.value.map((tab) => ({
    id: tab.id,
    label: resolveLabel(tab.label, locale.value),
    component: tab.component as Component,
    props: {} as Record<string, unknown>,
  })),
]);

const activeTabEntry = computed(() => TABS.value.find((tab) => tab.id === activeTab.value));
</script>

<template>
  <div class="settings-window" data-testid="settings-window" :style="{ '--sw-bg-alpha': bgAlpha }">
    <!-- Title bar (draggable region) -->
    <div class="stg-titlebar">
      <div class="stg-title">{{ t('preferences') }}</div>
      <button class="stg-close" :aria-label="t('close')" @click="handleCancel">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M18 6 6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>

    <!-- Tabs -->
    <div class="stg-tabs-wrap">
      <button
        v-if="showLeftFade"
        class="stg-tabs-arrow stg-tabs-arrow-left"
        aria-label="Scroll tabs left"
        @click="scrollTabs('left')"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M15 18l-6-6 6-6"/>
        </svg>
      </button>

      <div
        class="stg-tabs"
        ref="tabsEl"
        :class="{
          'fade-right': showRightFade && !showLeftFade,
          'fade-left': showLeftFade && !showRightFade,
          'fade-both': showLeftFade && showRightFade,
        }"
      >
        <button
          v-for="tab in TABS"
          :key="tab.id"
          class="stg-tab"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <button
        v-if="showRightFade"
        class="stg-tabs-arrow stg-tabs-arrow-right"
        aria-label="Scroll tabs right"
        @click="scrollTabs('right')"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </button>
    </div>

    <!-- Tab body. Tab change fade-in is the CSS keyframe `tab-appear` below;
         the v-auto-animate JS directive was removed because (a) it bypasses the
         data-reduced-motion CSS cap (JS animations don't honour CSS selectors)
         and (b) the keyframe alone produces the same fade. -->
    <div class="stg-body">
      <component :is="activeTabEntry?.component" v-bind="activeTabEntry?.props" />
    </div>

    <!-- Footer -->
    <div class="stg-footer">
      <button class="stg-btn stg-btn-cancel" @click="handleCancel">{{ t('cancel') }}</button>
      <button class="stg-btn stg-btn-save" data-testid="save-btn" @click="handleSave">{{ t('save') }}</button>
    </div>
  </div>
</template>

<style scoped>
:global(html), :global(body) {
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', 'Segoe UI', sans-serif;
}

:global(#app) {
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
}

/* Settings Window Panel */
/* Dark (default): R/G/B are fixed; only alpha is driven by app.config.js. */
.settings-window {
  width: 540px;
  max-height: 580px;
  border: 1px solid var(--border-hi);
  border-radius: 22px;
  backdrop-filter: var(--blur);
  -webkit-backdrop-filter: var(--blur);
  box-shadow: var(--shadow), 0 0 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  color: var(--text-primary);
}

/* Title bar */
.stg-titlebar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 0;
  -webkit-app-region: drag;
  flex-shrink: 0;
}
.stg-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.stg-close {
  width: 26px;
  height: 26px;
  border: none;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-muted);
  transition: background 150ms, color 150ms;
  -webkit-app-region: no-drag;
  flex-shrink: 0;
}
.stg-close:hover { background: rgba(248, 113, 113, 0.15); color: #F87171; }

/* Tabs */
.stg-tabs-wrap {
  position: relative;
  margin-top: 8px;
  flex-shrink: 0;
}
.stg-tabs {
  display: flex;
  gap: 2px;
  padding: 10px 18px 0;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
  scrollbar-width: none;
}
.stg-tabs::-webkit-scrollbar { display: none; }
.stg-tabs.fade-right {
  mask-image: linear-gradient(to right, black calc(100% - 64px), transparent 100%);
  -webkit-mask-image: linear-gradient(to right, black calc(100% - 64px), transparent 100%);
}
.stg-tabs.fade-left {
  mask-image: linear-gradient(to left, black calc(100% - 64px), transparent 100%);
  -webkit-mask-image: linear-gradient(to left, black calc(100% - 64px), transparent 100%);
}
.stg-tabs.fade-both {
  mask-image: linear-gradient(to right, transparent 0, black 56px, black calc(100% - 64px), transparent 100%);
  -webkit-mask-image: linear-gradient(to right, transparent 0, black 56px, black calc(100% - 64px), transparent 100%);
}

.stg-tabs-arrow {
  position: absolute;
  top: 10px;
  bottom: 1px;
  width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  cursor: pointer;
  z-index: 2;
  color: var(--text-muted);
  padding: 0;
  transition: color 150ms;
}
.stg-tabs-arrow:hover { color: var(--text-primary); }
.stg-tabs-arrow-left { left: 0; }
.stg-tabs-arrow-right { right: 0; }
.stg-tab {
  flex-shrink: 0;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 9px 9px 0 0;
  transition: color 150ms, box-shadow 150ms, background 150ms;
}
.stg-tab:hover { color: var(--text-dim); background: rgba(255, 255, 255, 0.04); }
.stg-tab.active {
  color: var(--accent);
  box-shadow: inset 0 -2px 0 var(--accent);
}

/* Tab body */
.stg-body {
  padding: 22px 20px 16px;
  flex: 1;
  overflow-y: auto;
  min-height: 260px;
}
.stg-body::-webkit-scrollbar { width: 5px; }
.stg-body::-webkit-scrollbar-track { background: transparent; }
.stg-body::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.10); border-radius: 3px; }

/* Footer */
.stg-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 14px 20px;
  border-top: 1px solid var(--border);
  background: var(--footer-bg);
  flex-shrink: 0;
}
.stg-btn {
  padding: 8px 20px;
  border-radius: 10px;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 150ms, transform 150ms;
}
.stg-btn:active { transform: scale(0.95); }
.stg-btn-cancel {
  background: var(--cancel-btn-bg);
  color: var(--text-dim);
  border: 1px solid var(--border);
}
.stg-btn-cancel:hover { background: var(--cancel-btn-hover-bg); color: var(--text-primary); }
.stg-btn-save {
  background: var(--accent);
  color: #fff;
  box-shadow: 0 4px 14px var(--accent-glow);
}
.stg-btn-save:hover { background: #6366f1; }

/* Tab content fade-in via CSS. `:deep()` is required because child tab
   components (AppearanceTab, BehaviorTab, FeaturesTab, ...) have their own
   scoped-CSS data attribute; without :deep, the rule only matches elements
   that share SettingsView's scope ID and the keyframe never fires. */
.stg-body > :deep(*) {
  animation: tab-appear 280ms ease-out both;
}
@keyframes tab-appear {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
</style>
