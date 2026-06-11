<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useCanvas } from '../composables/useCanvas';
import HtmlOverlayLayer from '../components/HtmlOverlayLayer.vue';
import NotificationLayer from '../components/NotificationLayer.vue';
import CustomCursor from '../components/CustomCursor.vue';
import { i18n } from '../i18n/index';
import {
  initNotificationService,
  cleanupNotificationService,
  pushNotification,
  isHostNotifyEnabled,
} from '../services/notification-service';

// Inline SVG icons (stroke uses currentColor).
const PEN_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>'
const STOP_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>'
const WARN_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'

const isDrawingMode = ref(false);
const { canvasRef } = useCanvas();
let unsubDrawingMode: (() => void) | null = null;
let unsubRenderBroken: (() => void) | null = null;

function notifyDrawingMode(enabled: boolean): void {
  if (!isHostNotifyEnabled()) return

  const t = i18n.global.t

  if (enabled) {
    pushNotification(
      {
        message: t('drawingModeOn'),
        description: t('drawingModeOnSub'),
        icon: PEN_ICON_SVG,
        variant: 'warning',
      },
      { source: 'host' },
    )
  } else {
    pushNotification(
      {
        message: t('drawingModeOff'),
        description: t('drawingModeOffSub'),
        icon: STOP_ICON_SVG,
        variant: 'default',
      },
      { source: 'host' },
    )
  }
}

onMounted(() => {
  // Initialise notification service (reads settings and subscribes to updates).
  initNotificationService();

  unsubDrawingMode = window.openPenApi?.onDrawingModeChanged((enabled) => {
    isDrawingMode.value = enabled;
    notifyDrawingMode(enabled);
  }) ?? null;

  unsubRenderBroken = window.openPenApi?.onTransparentRenderingBroken(() => {
    pushNotification(
      {
        message: 'Transparent overlay rendering issue detected',
        description: 'Your graphics driver may not support transparent windows. See troubleshooting guide.',
        icon: WARN_ICON_SVG,
        variant: 'warning',
        // Long duration so users have time to read it; still dismissable.
        duration: 12000,
      },
      { source: 'host' },
    )
  }) ?? null
});

onUnmounted(() => {
  unsubDrawingMode?.();
  unsubRenderBroken?.();
  cleanupNotificationService();
});
</script>

<template>
  <canvas
    ref="canvasRef"
    class="overlay-canvas"
    data-testid="canvas-overlay"
    :class="{ 'drawing-mode': isDrawingMode }"
    aria-hidden="true"
  />
  <HtmlOverlayLayer />
  <NotificationLayer />
  <CustomCursor />
</template>

<style scoped>
.overlay-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  display: block;
  cursor: default;
  pointer-events: none;
  opacity: 0; /* Hide strokes outside drawing mode; canvas contents are kept. */
}

.overlay-canvas.drawing-mode {
  opacity: 1;
  /* OS cursor is hidden so the DOM CustomCursor element is the only
     visible cursor; useCanvas.applyCursor also writes this inline to
     beat any cascade order surprises on first paint. */
  cursor: none;
  pointer-events: auto;
}
</style>
