<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref } from 'vue';
import ControlBar from './components/ControlBar.vue';
import ModalStack from './components/ModalStack.vue';
import PluginConflictDialog from './components/PluginConflictDialog.vue';
import StatusBar from './components/StatusBar.vue';
import OverlayView from './views/OverlayView.vue';
import SettingsView from './views/SettingsView.vue';
import { setLanguage } from './i18n/index';
import { initModuleRuntime, cleanupModuleRuntime, usePluginConflicts } from './core/runtime/bootstrap';
import { useStrokeStyle } from './composables/useStrokeStyle';
import { usePositioning } from './composables/usePositioning';
import type { AppSettings } from './types/settings';
import { STROKE_STYLE_CONTEXT_KEY, HOST_DIALOG_OPEN_COUNT_KEY } from '@openpen/module-api';
// Host-internal; deliberately absent from the public @openpen/module-api/uikit barrel.
import { DialogHost } from '@openpen/module-api/uikit/internal';

provide(STROKE_STYLE_CONTEXT_KEY, useStrokeStyle());
// Overlay window is transparent — a dim backdrop would render as an opaque patch.
// The count lets the host container show a visual lock state instead.
provide(HOST_DIALOG_OPEN_COUNT_KEY, ref(0));

const pluginConflicts = usePluginConflicts();

const params = new URLSearchParams(window.location.search);
const isSettingsWindow = params.get('window') === 'settings';
const isOverlayWindow = params.get('window') === 'overlay';

/**
 * Display id this renderer instance belongs to, parsed from the URL query string.
 * -1 means "unknown / primary display" (settings window or legacy launch without query param).
 */
const windowDisplayId = Number(params.get('displayId') ?? '-1');

// Active-display visibility (Mechanism A): the main window renderer only shows
// the control bar when this window's displayId matches the engine's activeDisplayId.
// On a single-display system windowDisplayId === activeDisplayId always.
const { activeDisplayId } = usePositioning();
const isActiveDisplay = computed(() =>
  // -1 means displayId not in URL (settings window or legacy); always show.
  windowDisplayId === -1 || activeDisplayId.value === -1 || activeDisplayId.value === windowDisplayId
);

let unsubSettings: (() => void) | null = null;

function applyTheme(theme: string) {
  document.documentElement.setAttribute('data-theme', theme);
}

function applyAccentColor(hexColor: string) {
  if (!hexColor || !hexColor.startsWith('#') || hexColor.length < 7) return;
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const el = document.documentElement;
  el.style.setProperty('--accent', hexColor);
  el.style.setProperty('--accent-glow',   `rgba(${r},${g},${b},0.35)`);
  el.style.setProperty('--accent-bg',     `rgba(${r},${g},${b},0.18)`);
  el.style.setProperty('--ball-color-1',  `rgba(${r},${g},${b},0.85)`);
  el.style.setProperty('--ball-color-2',  `rgba(${r},${g},${b},0.75)`);
  el.style.setProperty('--ball-ring-color', `rgba(${r},${g},${b},0.35)`);
}

function applyBallOpacity(opacity: number) {
  if (typeof opacity === 'number' && !isNaN(opacity)) {
    document.documentElement.style.setProperty('--ball-opacity', String(opacity));
  }
}

type SettingsPayload = AppSettings & { effectiveTheme: 'light' | 'dark' }

function onSettingsUpdated(settings: SettingsPayload) {
  if (settings.effectiveTheme) applyTheme(settings.effectiveTheme);
  if (settings.language) setLanguage(settings.language);
  if (settings.defaultColor) applyAccentColor(settings.defaultColor);
  if (settings.ballOpacity != null) applyBallOpacity(settings.ballOpacity);
  if (settings.reducedMotion != null) {
    // data-reduced-motion="true" → CSS caps animation/transition durations to
    // 0.01ms (selector lives in src/style.css). Mirrors prefers-reduced-motion.
    document.documentElement.setAttribute('data-reduced-motion', settings.reducedMotion ? 'true' : 'false');
  }
}

onMounted(async () => {
  unsubSettings = window.openPenApi?.onSettingsUpdated(onSettingsUpdated) ?? null;

  const settings = await window.openPenApi?.getSettings();
  if (settings) onSettingsUpdated(settings);

  const locale = (await window.openPenApi?.getLocale()) ?? 'en';
  const windowType = isOverlayWindow ? 'overlay' : isSettingsWindow ? 'settings' : 'main';
  await initModuleRuntime({ locale, windowType });

  // Tell the main process the renderer has mounted so the host window can be
  // revealed. Required because windows are created with show:false to avoid a
  // Windows DWM paint-timing issue where transparent frameless windows can
  // render invisibly if shown before the first paint completes.
  window.openPenApi?.signalContentReady();
});

onUnmounted(() => {
  unsubSettings?.();
  cleanupModuleRuntime();
});
</script>

<template>
  <OverlayView v-if="isOverlayWindow" />
  <SettingsView v-else-if="isSettingsWindow" />
  <div v-else class="main-window" :class="{ 'display-inactive': !isActiveDisplay }">
    <ControlBar />
    <StatusBar />
    <ModalStack />
  </div>
  <DialogHost />
  <PluginConflictDialog
    v-if="pluginConflicts.length > 0"
    :conflicts="(pluginConflicts as any)"
  />
</template>

<style scoped>
:global(html),
:global(body) {
  margin: 0;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: transparent;
}

:global(#app) {
  width: 100vw;
  height: 100vh;
}

.main-window {
  position: relative;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* Hidden on non-active displays — only the active display renders bar UI. */
.main-window.display-inactive {
  display: none;
}

.main-window :deep(.control-bar-wrapper) {
  pointer-events: auto;
}
</style>
