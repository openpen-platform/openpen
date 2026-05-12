<script setup lang="ts">
/**
 * PluginConflictDialog — shown when two or more plugins claim the same id.
 *
 * Rendered directly by App.vue (not via ModalStack/contribution-store) because
 * it must appear before the module runtime finishes loading. The user must pick
 * one plugin per conflict; clicking "Resolve and restart" persists the choices
 * to settings and triggers app.relaunch() via IPC.
 *
 * The dialog is `persistent` — it cannot be dismissed without resolving or
 * quitting. This matches the behaviour of VS Code's workspace trust gate:
 * conflicts are a hard boot blocker, not a soft warning.
 */
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { PluginConflict } from '../core/runtime/module-validator'

interface Props {
  conflicts: readonly PluginConflict[]
}

const props = defineProps<Props>()

const { t } = useI18n()

/** Map: conflicting plugin id → chosen candidate index within its group. */
const selections = ref<Record<string, number>>({})

/** True when every conflict has a selection. */
const allResolved = computed(() =>
  props.conflicts.every((c) => c.id in selections.value)
)

function select(conflictId: string, idx: number) {
  selections.value = { ...selections.value, [conflictId]: idx }
}

async function resolveAndRestart() {
  if (!allResolved.value) return
  const resolutions: Record<string, string> = {}
  for (const conflict of props.conflicts) {
    const idx = selections.value[conflict.id]
    const candidate = conflict.candidates[idx]
    const dir = (candidate as unknown as Record<string, unknown>)['dir']
    if (typeof dir === 'string') {
      resolutions[conflict.id] = dir
    }
  }
  await window.openPenApi?.setPluginConflictResolutions(resolutions)
}

function quit() {
  // Trigger a clean quit without relaunching.
  window.openPenApi?.relaunchApp()
}
</script>

<template>
  <Teleport to="body">
    <div class="pcd-overlay" role="dialog" aria-modal="true" :aria-label="t('pluginConflictDialogTitle')">
      <div class="pcd-panel openpen-interactive">
        <h2 class="pcd-title">{{ t('pluginConflictDialogTitle') }}</h2>
        <p class="pcd-description">{{ t('pluginConflictDialogDescription') }}</p>

        <div class="pcd-conflicts">
          <div
            v-for="(conflict, ci) in conflicts"
            :key="conflict.id"
            class="pcd-conflict"
          >
            <h3 class="pcd-conflict-label">
              {{ t('pluginConflictDialogConflict', { n: ci + 1, total: conflicts.length, id: conflict.id }) }}
            </h3>

            <div class="pcd-candidates">
              <label
                v-for="(candidate, idx) in conflict.candidates"
                :key="idx"
                class="pcd-candidate"
                :class="{ 'pcd-candidate--selected': selections[conflict.id] === idx }"
              >
                <input
                  type="radio"
                  class="pcd-radio"
                  :name="conflict.id"
                  :value="idx"
                  :checked="selections[conflict.id] === idx"
                  @change="select(conflict.id, idx)"
                />
                <div class="pcd-candidate-body">
                  <span class="pcd-candidate-name">{{ (candidate as any).name ?? candidate.id }}</span>
                  <span v-if="(candidate as any).description" class="pcd-candidate-desc">
                    {{ (candidate as any).description }}
                  </span>
                  <span class="pcd-candidate-version">v{{ (candidate as any).version ?? '—' }}</span>
                  <span class="pcd-candidate-dir">
                    {{ t('pluginConflictDialogCandidateDir', { dir: (candidate as any).dir ?? '—' }) }}
                  </span>
                </div>
              </label>
            </div>
          </div>
        </div>

        <p v-if="!allResolved" class="pcd-pending-note">
          {{ t('pluginConflictDialogPendingNote') }}
        </p>

        <div class="pcd-footer">
          <button class="pcd-btn pcd-btn-secondary" @click="quit">
            {{ t('pluginConflictDialogQuitAction') }}
          </button>
          <button
            class="pcd-btn pcd-btn-primary"
            :disabled="!allResolved"
            @click="resolveAndRestart"
          >
            {{ t('pluginConflictDialogResolveAction') }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.pcd-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  pointer-events: auto;
}

.pcd-panel {
  background: var(--openpen-color-surface-popup, rgba(28, 28, 36, 0.97));
  border: 1px solid var(--openpen-color-border-hi, rgba(255, 255, 255, 0.2));
  border-radius: var(--openpen-radius-lg, 12px);
  box-shadow: var(--openpen-shadow, 0 8px 32px rgba(0, 0, 0, 0.5));
  backdrop-filter: var(--openpen-blur, blur(20px));
  -webkit-backdrop-filter: var(--openpen-blur, blur(20px));
  width: min(520px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  overflow-y: auto;
  padding: 24px;
  color: var(--openpen-color-text-primary, #fff);
  font-size: 13px;
}

.pcd-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0 0 8px 0;
  line-height: 1.4;
}

.pcd-description {
  margin: 0 0 20px 0;
  color: var(--openpen-color-text-secondary, rgba(255, 255, 255, 0.6));
  line-height: 1.5;
}

.pcd-conflicts {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.pcd-conflict {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pcd-conflict-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--openpen-color-text-dim, rgba(255, 255, 255, 0.45));
  margin: 0;
}

.pcd-candidates {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pcd-candidate {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--openpen-color-border, rgba(255, 255, 255, 0.1));
  border-radius: var(--openpen-radius-md, 8px);
  cursor: pointer;
  transition: border-color 120ms, background 120ms;
  background: transparent;
}

.pcd-candidate:hover {
  border-color: var(--openpen-color-border-hi, rgba(255, 255, 255, 0.25));
  background: var(--openpen-color-control-hover, rgba(255, 255, 255, 0.06));
}

.pcd-candidate--selected {
  border-color: var(--accent, #818cf8);
  background: var(--accent-bg, rgba(129, 140, 248, 0.1));
}

.pcd-radio {
  margin-top: 2px;
  flex-shrink: 0;
  accent-color: var(--accent, #818cf8);
}

.pcd-candidate-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.pcd-candidate-name {
  font-weight: 500;
  font-size: 13px;
}

.pcd-candidate-desc {
  color: var(--openpen-color-text-secondary, rgba(255, 255, 255, 0.6));
  font-size: 12px;
  line-height: 1.4;
}

.pcd-candidate-version {
  font-size: 11px;
  color: var(--openpen-color-text-dim, rgba(255, 255, 255, 0.45));
}

.pcd-candidate-dir {
  font-size: 11px;
  color: var(--openpen-color-text-dim, rgba(255, 255, 255, 0.45));
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  word-break: break-all;
}

.pcd-pending-note {
  margin: 16px 0 0 0;
  font-size: 12px;
  color: var(--openpen-color-warning, #f59e0b);
}

.pcd-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--openpen-color-border, rgba(255, 255, 255, 0.1));
}

.pcd-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 16px;
  border-radius: var(--openpen-radius-sm, 6px);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background 120ms, opacity 120ms;
}

.pcd-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.pcd-btn-secondary {
  background: var(--openpen-color-control, rgba(255, 255, 255, 0.08));
  color: var(--openpen-color-text-primary, #fff);
}

.pcd-btn-secondary:not(:disabled):hover {
  background: var(--openpen-color-control-hover, rgba(255, 255, 255, 0.14));
}

.pcd-btn-primary {
  background: var(--accent, #818cf8);
  color: #fff;
}

.pcd-btn-primary:not(:disabled):hover {
  opacity: 0.9;
}
</style>
