<script setup lang="ts">
/**
 * NotificationLayer — overlay layer that renders the toast notification queue.
 *
 * Mounted at the top level of OverlayView, alongside HtmlOverlayLayer.
 * pointer-events: none ensures it does not block drawing interactions.
 * Position is driven by the notificationPosition setting (9-cell token grid).
 */
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { notificationQueue, getNotificationPosition } from '../services/notification-service'
import type { NotificationPosition } from '../services/notification-service'

// Reactive position (updates when settings change).
const position = ref<NotificationPosition>(getNotificationPosition())
let unsubSettings: (() => void) | null = null

onMounted(() => {
  unsubSettings = window.openPenApi?.onSettingsUpdated((s) => {
    if (typeof s.notificationPosition === 'string') {
      position.value = s.notificationPosition as NotificationPosition
    }
  }) ?? null
})

onUnmounted(() => {
  unsubSettings?.()
})

// Position token → CSS style map.
const positionStyle = computed(() => {
  const pos = position.value
  const base: Record<string, string> = { position: 'fixed' }
  switch (pos) {
    case 'top-left':
      return { ...base, top: '8%', left: '8%' }
    case 'top-center':
      return { ...base, top: '8%', left: '50%', transform: 'translateX(-50%)' }
    case 'top-right':
      return { ...base, top: '8%', right: '8%' }
    case 'middle-left':
      return { ...base, top: '40%', left: '8%', transform: 'translateY(-50%)' }
    case 'center':
      return { ...base, top: '40%', left: '50%', transform: 'translate(-50%, -50%)' }
    case 'middle-right':
      return { ...base, top: '40%', right: '8%', transform: 'translateY(-50%)' }
    case 'bottom-left':
      return { ...base, bottom: '8%', left: '8%' }
    case 'bottom-center':
      return { ...base, bottom: '8%', left: '50%', transform: 'translateX(-50%)' }
    case 'bottom-right':
      return { ...base, bottom: '8%', right: '8%' }
    default:
      return { ...base, top: '8%', left: '50%', transform: 'translateX(-50%)' }
  }
})

// Variant → border colour map.
function variantBorderColor(variant: string): string {
  switch (variant) {
    case 'success': return 'rgba(34,197,94,0.40)'
    case 'warning': return 'rgba(249,115,22,0.40)'
    case 'danger':  return 'rgba(239,68,68,0.40)'
    default:        return 'rgba(100,116,139,0.30)'
  }
}

// Variant → default icon stroke colour.
function variantIconColor(variant: string): string {
  switch (variant) {
    case 'success': return '#4ADE80'
    case 'warning': return '#FB923C'
    case 'danger':  return '#F87171'
    default:        return '#94A3B8'
  }
}

</script>

<template>
  <div class="notification-layer" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="notif" tag="div" class="notification-stack" :style="positionStyle">
      <div
        v-for="item in notificationQueue"
        :key="item.id"
        class="notification-toast"
        :class="[`notif-${item.variant}`]"
        :style="{
          borderColor: variantBorderColor(item.variant),
        }"
        role="status"
        :aria-label="item.message"
      >
        <!-- Icon -->
        <span
          v-if="item.icon"
          class="notif-icon"
          :style="{ color: variantIconColor(item.variant) }"
          v-html="item.icon"
        />
        <!-- Text -->
        <div class="notif-text">
          <div class="notif-message">{{ item.message }}</div>
          <div v-if="item.description" class="notif-description">{{ item.description }}</div>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.notification-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1000;
}

.notification-stack {
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.notification-toast {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 18px;
  background: rgba(18, 26, 48, 0.96);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.65);
  pointer-events: none;
  white-space: nowrap;
  min-width: 160px;
  max-width: 320px;
}

.notif-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-top: 1px;
}

.notif-icon :deep(svg) {
  width: 16px;
  height: 16px;
}

.notif-text {
  flex: 1;
  min-width: 0;
}

.notif-message {
  font-size: 13.5px;
  font-weight: 600;
  color: #F1F5F9;
  line-height: 1.4;
}

.notif-description {
  font-size: 11px;
  font-weight: 400;
  color: #64748B;
  margin-top: 2px;
  line-height: 1.4;
}

/* TransitionGroup animation */
.notif-enter-active {
  transition: opacity 250ms ease-out, transform 250ms ease-out;
}
.notif-leave-active {
  transition: opacity 200ms ease-in;
}
.notif-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.notif-enter-to {
  opacity: 1;
  transform: translateY(0);
}
.notif-leave-from {
  opacity: 1;
}
.notif-leave-to {
  opacity: 0;
}
</style>
