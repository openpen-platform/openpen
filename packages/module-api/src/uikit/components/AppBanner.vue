<script setup lang="ts">
/**
 * AppBanner — High-level wrapper (Layer 1).
 *
 * Presents info / warning / success / error status messages using the
 * --openpen-color-state-* design tokens. The icon is auto-rendered based on
 * the variant; message content goes in the default slot; optional inline action
 * buttons (e.g. restart / dismiss) go in the `#actions` slot.
 *
 * Inline mode (compact single-line) is enabled via the `inline` prop and is
 * suited for form validation feedback and status lines inside dialogs.
 */

export type BannerVariant = 'info' | 'warning' | 'success' | 'error'

withDefaults(defineProps<{
  variant: BannerVariant
  /** Compact single-line layout: smaller padding, vertically centered. */
  inline?: boolean
}>(), { inline: false })
</script>

<template>
  <div
    :class="['app-banner', `app-banner-${variant}`, { 'app-banner-inline': inline }]"
    :role="variant === 'error' ? 'alert' : 'status'"
  >
    <span class="app-banner-icon" aria-hidden="true">
      <!-- info -->
      <svg v-if="variant === 'info'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <!-- warning -->
      <svg v-else-if="variant === 'warning'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      <!-- success -->
      <svg v-else-if="variant === 'success'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
      </svg>
      <!-- error -->
      <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    </span>

    <span class="app-banner-body"><slot /></span>

    <span v-if="$slots.actions" class="app-banner-actions">
      <slot name="actions" />
    </span>
  </div>
</template>

<style scoped>
.app-banner {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--openpen-radius-md, 10px);
  border: 1px solid;
  font-size: 13px;
  line-height: 1.55;
}

.app-banner-inline {
  padding: 7px 12px;
  align-items: center;
  font-size: 12px;
}

.app-banner-icon {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  margin-top: 1px;
}

.app-banner-inline .app-banner-icon { margin-top: 0; }

.app-banner-body {
  flex: 1;
  min-width: 0;
}

.app-banner-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  margin-left: auto;
}

/* Variants */
.app-banner-info {
  background: var(--openpen-color-state-info-bg);
  border-color: var(--openpen-color-state-info-border);
  color: var(--openpen-color-state-info-text);
}
.app-banner-info .app-banner-icon {
  color: var(--openpen-color-state-info-icon);
}

.app-banner-warning {
  background: var(--openpen-color-state-warning-bg);
  border-color: var(--openpen-color-state-warning-border);
  color: var(--openpen-color-state-warning-text);
}
.app-banner-warning .app-banner-icon {
  color: var(--openpen-color-state-warning-icon);
}

.app-banner-success {
  background: var(--openpen-color-state-success-bg);
  border-color: var(--openpen-color-state-success-border);
  color: var(--openpen-color-state-success-text);
}
.app-banner-success .app-banner-icon {
  color: var(--openpen-color-state-success-icon);
}

.app-banner-error {
  background: var(--openpen-color-state-error-bg);
  border-color: var(--openpen-color-state-error-border);
  color: var(--openpen-color-state-error-text);
}
.app-banner-error .app-banner-icon {
  color: var(--openpen-color-state-error-icon);
}
</style>
