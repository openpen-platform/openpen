<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

defineProps<{
  open: boolean
  pluginId: string
  pluginName: string
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  confirm: []
}>()
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="rc-overlay" @click.self="emit('update:open', false)">
      <div class="rc-modal mp-detail-modal">
        <!-- Header -->
        <div class="rc-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2.5"
            stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6m4-6v6"/>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
          </svg>
          {{ t('pluginRemoveTitle') }}
        </div>

        <!-- Body -->
        <p class="rc-body">
          {{ t('pluginRemoveBody', { name: pluginName }) }}
          (<code class="rc-id">{{ pluginId }}</code>)
          {{ t('pluginRemoveBodySuffix') }}
        </p>

        <!-- Footer -->
        <div class="rc-actions">
          <button class="cw-btn cw-btn-cancel" @click="emit('update:open', false)">{{ t('cancel') }}</button>
          <button class="mp-danger-btn" @click="emit('confirm')">{{ t('pluginRemove') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.rc-overlay {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; align-items: center; justify-content: center;
}
.rc-modal {
  display: flex; flex-direction: column; gap: 14px;
  min-width: 300px; max-width: 400px; width: 90%;
  background: var(--surface-hi); border: 1px solid var(--border-hi);
  border-radius: var(--radius); padding: 20px 22px;
  box-shadow: var(--shadow), 0 0 40px rgba(0,0,0,0.35);
  backdrop-filter: var(--blur); -webkit-backdrop-filter: var(--blur);
}
.rc-title {
  font-size: 15px; font-weight: 700; color: var(--text-primary);
  display: flex; align-items: center; gap: 8px;
}
.rc-body { font-size: 12.5px; color: var(--text-dim); line-height: 1.65; margin: 0; }
.rc-id {
  font-family: 'SF Mono', 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 11px; color: var(--text-dim);
}
.rc-actions { display: flex; gap: 8px; justify-content: flex-end; align-items: center; }
.mp-danger-btn {
  padding: 6px 14px; font-size: 12.5px; font-weight: 600; color: #fff;
  background: #EF4444; border: none; border-radius: 7px; cursor: pointer;
  transition: background var(--t-fast), transform var(--t-fast);
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.35); flex-shrink: 0;
}
.mp-danger-btn:hover { background: #DC2626; }
.mp-danger-btn:active { transform: scale(0.95); }
</style>
