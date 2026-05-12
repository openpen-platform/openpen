<script setup lang="ts">
import { computed } from 'vue';
import type { ComputedRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { AppToggle, AppSegmented } from '@openpen/module-api/uikit';
import type { AppSettings } from '../../types/settings';
import PositionPicker from './PositionPicker.vue';

const { t } = useI18n();

const props = defineProps<{
  /** Settings draft owned by the parent; this tab mutates it directly. */
  draft: AppSettings
}>();

const DELAY_OPTIONS: { label: ComputedRef<string>; value: number }[] = [
  { label: computed(() => t('delay1s')),  value: 1000 },
  { label: computed(() => t('delay3s')),  value: 3000 },
  { label: computed(() => t('delay5s')),  value: 5000 },
  { label: computed(() => t('delay10s')), value: 10000 },
];

function setDelay(v: number) {
  props.draft.autoCollapseDelay = v;
}

const barLayoutOptions = computed(() => [
  { value: 'horizontal', label: t('barLayoutHorizontal') },
  { value: 'vertical',   label: t('barLayoutVertical') },
]);
</script>

<template>
  <div class="cw-section">
    <div class="cw-section-title">{{ t('sectionInteraction') }}</div>

    <div class="cw-row">
      <div>
        <div class="cw-row-label">{{ t('dragAutoSnap') }}</div>
        <div class="cw-row-sub">{{ t('dragAutoSnapSub') }}</div>
      </div>
      <AppToggle
        :model-value="draft.enableDragAutoSnap"
        :aria-label="t('dragAutoSnap')"
        @update:model-value="draft.enableDragAutoSnap = $event"
      />
    </div>

    <div class="cw-row" :class="{ 'cw-row--disabled': draft.enableDragAutoSnap }">
      <div>
        <div class="cw-row-label">{{ t('barLayout') }}</div>
        <div class="cw-row-sub">{{ t('barLayoutSub') }}</div>
      </div>
      <AppSegmented
        :model-value="draft.barLayout"
        :options="barLayoutOptions"
        :disabled="draft.enableDragAutoSnap"
        :aria-label="t('barLayout')"
        @update:model-value="draft.barLayout = $event as AppSettings['barLayout']"
      />
    </div>

    <div class="cw-row">
      <div>
        <div class="cw-row-label">{{ t('autoCollapseDelay') }}</div>
        <div class="cw-row-sub">{{ t('autoCollapseDelaySub') }}</div>
      </div>
      <select
        class="cw-select"
        :value="draft.autoCollapseDelay"
        :aria-label="t('autoCollapseDelay')"
        @change="setDelay(Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="opt in DELAY_OPTIONS" :key="opt.value" :value="opt.value">
          {{ opt.label.value }}
        </option>
      </select>
    </div>

    <div class="cw-row">
      <div>
        <div class="cw-row-label">{{ t('reducedMotion') }}</div>
        <div class="cw-row-sub">{{ t('reducedMotionSub') }}</div>
      </div>
      <AppToggle
        :model-value="draft.reducedMotion"
        :aria-label="t('reducedMotion')"
        @update:model-value="draft.reducedMotion = $event"
      />
    </div>

    <div class="cw-row">
      <div>
        <div class="cw-row-label">{{ t('confirmBeforeClearCanvas') }}</div>
        <div class="cw-row-sub">{{ t('confirmBeforeClearCanvasSub') }}</div>
      </div>
      <AppToggle
        :model-value="draft.confirmBeforeClearCanvas"
        :aria-label="t('confirmBeforeClearCanvas')"
        @update:model-value="draft.confirmBeforeClearCanvas = $event"
      />
    </div>
  </div>

  <div class="cw-section">
    <div class="cw-section-title">{{ t('sectionNotifications') }}</div>

    <div class="cw-row">
      <div>
        <div class="cw-row-label">{{ t('notifyOnDrawingMode') }}</div>
        <div class="cw-row-sub">{{ t('notifyOnDrawingModeSub') }}</div>
      </div>
      <AppToggle
        :model-value="draft.notifyOnDrawingMode"
        :aria-label="t('notifyOnDrawingMode')"
        @update:model-value="draft.notifyOnDrawingMode = $event"
      />
    </div>

    <div class="cw-row">
      <div>
        <div class="cw-row-label">{{ t('notificationPosition') }}</div>
        <div class="cw-row-sub">{{ t('notificationPositionSub') }}</div>
      </div>
      <PositionPicker
        :model-value="draft.notificationPosition"
        @update:model-value="draft.notificationPosition = $event"
      />
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

/* Whole-row disabled state: fade label + sub + control uniformly. AppSegmented
   has its own --disabled visual at opacity 0.45; reset to 1 inside this scope so
   the row's 0.5 opacity is the sole fade applied (no compounding). */
.cw-row--disabled { opacity: 0.5; pointer-events: none; }
.cw-row--disabled :deep(.app-seg) { opacity: 1; }

.cw-select {
  background: var(--input-bg);
  border: 1px solid var(--border-hi);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 13px;
  padding: 5px 28px 5px 10px;
  cursor: pointer;
  outline: none;
  appearance: none;
  -webkit-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  flex-shrink: 0;
}
.cw-select:hover { border-color: var(--accent); }
.cw-select option { background: var(--select-option-bg); }
</style>
