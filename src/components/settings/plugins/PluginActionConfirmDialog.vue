<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  open: boolean
  severity: 'neutral' | 'danger'
  title: string
  body: string
  confirmLabel: string
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  confirm: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ac-overlay" @click.self="emit('update:open', false)">
      <div class="ac-modal mp-detail-modal">
        <!-- Header -->
        <div class="ac-title">
          <!-- Warning triangle: amber for neutral (reinstall), red for danger (downgrade) -->
          <svg
            width="16" height="16" viewBox="0 0 24 24" fill="none"
            :stroke="severity === 'danger' ? 'var(--danger)' : '#d97706'"
            stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"
            style="flex-shrink:0;"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          {{ title }}
        </div>

        <!-- Body -->
        <p class="ac-body">{{ body }}</p>

        <!-- Footer -->
        <div class="ac-actions">
          <button class="cw-btn cw-btn-cancel" @click="emit('update:open', false)">{{ t('cancel') }}</button>
          <button
            :class="severity === 'danger' ? 'mp-danger-btn' : 'cw-btn cw-btn-save'"
            @click="emit('confirm')"
          >{{ confirmLabel }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ac-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.ac-modal {
  display: flex; flex-direction: column; gap: 14px;
  min-width: 300px; max-width: 400px; width: 90%;
  background: var(--surface-hi); border: 1px solid var(--border-hi);
  border-radius: var(--radius); padding: 20px 22px;
  box-shadow: var(--shadow), 0 0 40px rgba(0,0,0,0.35);
  backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
}
.ac-title {
  font-size: 15px; font-weight: 700; color: var(--text-primary);
  display: flex; align-items: center; gap: 8px;
}
.ac-body { font-size: 12.5px; color: var(--text-dim); line-height: 1.65; margin: 0; }
.ac-actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }
.mp-danger-btn {
  padding: 6px 14px; font-size: 12.5px; font-weight: 600; color: #fff;
  background: #EF4444; border: none; border-radius: 7px; cursor: pointer;
  transition: background var(--t-fast), transform var(--t-fast);
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.35); flex-shrink: 0;
}
.mp-danger-btn:hover { background: #DC2626; }
.mp-danger-btn:active { transform: scale(0.95); }
</style>
