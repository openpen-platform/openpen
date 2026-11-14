<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useCanvas } from '../composables/useCanvas';
import HtmlOverlayLayer from '../components/HtmlOverlayLayer.vue';
import NotificationLayer from '../components/NotificationLayer.vue';
import CustomCursor from '../components/CustomCursor.vue';
import { notifyDrawingMode } from '../services/drawing-mode-notify';
import {
  initNotificationService,
  cleanupNotificationService,
  pushNotification,
} from '../services/notification-service';

// Inline SVG icon (stroke uses currentColor).
const WARN_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'

const isDrawingMode = ref(false);
const { canvasRef } = useCanvas();
let unsubDrawingMode: (() => void) | null = null;
let unsubRenderBroken: (() => void) | null = null;

// Where the control bar lives in its own window, that window shows the
// drawing-mode toast above the bar. Only when the bar rides inside this overlay
// (Wayland) does the overlay show it.
const showsDrawingModeToast = new URLSearchParams(window.location.search).get('role') === 'overlay-bar';

onMounted(() => {
  // Initialise notification service (reads settings and subscribes to updates).
  initNotificationService();

  unsubDrawingMode = window.openPenApi?.onDrawingModeChanged((enabled) => {
    isDrawingMode.value = enabled;
    if (showsDrawingModeToast) notifyDrawingMode(enabled);
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
  <NotificationLayer data-capture-exclude />
  <CustomCursor data-capture-exclude />
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
