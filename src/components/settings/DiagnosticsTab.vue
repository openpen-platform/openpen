<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useDiagnostics } from '../../composables/useDiagnostics'

const { t, locale } = useI18n()
const { events, acknowledge, openBackupDir } = useDiagnostics()

// Per-row "Copied" flash state keyed by event id.
const copiedId = ref<string | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

function copyPath(id: string, path: string) {
  navigator.clipboard.writeText(path).then(() => {
    copiedId.value = id
    if (copiedTimer !== null) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => {
      copiedId.value = null
      copiedTimer = null
    }, 1000)
  })
}

/** Minimal relative-time formatter — uses Intl.RelativeTimeFormat when available. */
function formatRelative(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime()
  const diffSec = Math.round(diffMs / 1000)
  const diffMin = Math.round(diffSec / 60)
  const diffHour = Math.round(diffMin / 60)
  const diffDay = Math.round(diffHour / 24)

  const rtf = new Intl.RelativeTimeFormat(locale.value, { numeric: 'auto' })

  if (Math.abs(diffDay) >= 1) return rtf.format(-diffDay, 'day')
  if (Math.abs(diffHour) >= 1) return rtf.format(-diffHour, 'hour')
  if (Math.abs(diffMin) >= 1) return rtf.format(-diffMin, 'minute')
  return rtf.format(-diffSec, 'second')
}

/** Resolve i18n key for a given recovery layer. */
function layerLabel(layer: DiagnosticsEvent['layer']): string {
  const map: Record<DiagnosticsEvent['layer'], string> = {
    L1: 'diagnosticsLayerL1',
    L2: 'diagnosticsLayerL2',
    L3b: 'diagnosticsLayerL3b',
  }
  return t(map[layer])
}

function handleOpenBackupDir() {
  if (events.value.length === 0) return
  openBackupDir(events.value[0].backupPath)
}
</script>

<template>
  <div class="cw-section">
    <div class="cw-section-title">{{ t('diagnostics') }}</div>

    <div class="diag-header-row">
      <p class="diag-desc">{{ t('diagnosticsDescription') }}</p>
      <button
        class="diag-open-btn"
        data-testid="diag-open-btn"
        :disabled="events.length === 0"
        @click="handleOpenBackupDir"
      >
        {{ t('diagnosticsOpenBackupDir') }}
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="events.length === 0" class="diag-empty" data-testid="diag-empty">
      {{ t('diagnosticsEmpty') }}
    </div>

    <!-- Event list -->
    <ul v-else class="diag-list" data-testid="diag-list">
      <li
        v-for="event in events"
        :key="event.id"
        class="diag-row"
        data-testid="diag-row"
      >
        <!-- Timestamp row -->
        <div class="diag-meta">
          <span class="diag-timestamp">
            {{ t('diagnosticsDetectedAt', { time: formatRelative(event.detectedAt) }) }}
          </span>
          <!-- Layer chip -->
          <span class="diag-layer-chip" data-testid="diag-layer-chip" :class="`diag-layer-${event.layer.toLowerCase()}`">
            {{ layerLabel(event.layer) }}
          </span>
        </div>

        <!-- Backup path + copy button -->
        <div class="diag-path-row">
          <code class="diag-path">{{ event.backupPath }}</code>
          <button
            class="diag-copy-btn"
            @click="copyPath(event.id, event.backupPath)"
          >
            {{ copiedId === event.id ? t('diagnosticsCopied') : t('diagnosticsCopyPath') }}
          </button>
        </div>

        <!-- Acknowledge area -->
        <div class="diag-action-row">
          <button
            v-if="event.acknowledgedAt === null"
            class="diag-ack-btn"
            data-testid="diag-ack-btn"
            @click="acknowledge(event.id)"
          >
            {{ t('diagnosticsAcknowledge') }}
          </button>
          <span v-else class="diag-acked-label" data-testid="diag-acked-label">
            {{ t('diagnosticsAcknowledged', { time: formatRelative(event.acknowledgedAt) }) }}
          </span>
        </div>
      </li>
    </ul>
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

.diag-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.diag-desc {
  font-size: 12.5px;
  color: var(--text-dim);
  margin: 0;
  line-height: 1.5;
  flex: 1;
}

.diag-open-btn {
  flex-shrink: 0;
  padding: 5px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-hi);
  background: var(--cancel-btn-bg);
  color: var(--text-dim);
  transition: background 150ms, color 150ms;
}
.diag-open-btn:hover:not(:disabled) {
  background: var(--cancel-btn-hover-bg);
  color: var(--text-primary);
}
.diag-open-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* Empty state */
.diag-empty {
  padding: 28px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-muted);
}

/* Event list */
.diag-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.diag-row {
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--row-bg);
  border: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Meta row: timestamp + layer chip */
.diag-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.diag-timestamp {
  font-size: 12px;
  color: var(--text-muted);
}

.diag-layer-chip {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 99px;
  font-size: 11px;
  font-weight: 600;
  background: rgba(99, 102, 241, 0.12);
  color: var(--accent);
  border: 1px solid rgba(99, 102, 241, 0.22);
  line-height: 1.5;
}

/* Path row */
.diag-path-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.diag-path {
  flex: 1;
  font-size: 11px;
  font-family: 'SF Mono', 'JetBrains Mono', 'Fira Code', monospace;
  color: var(--text-dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.diag-copy-btn {
  flex-shrink: 0;
  padding: 3px 10px;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  transition: background 150ms, color 150ms, border-color 150ms;
}
.diag-copy-btn:hover {
  background: var(--row-bg);
  border-color: var(--border-hi);
  color: var(--text-primary);
}

/* Action row */
.diag-action-row {
  display: flex;
  align-items: center;
}

.diag-ack-btn {
  padding: 5px 14px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border-hi);
  background: var(--cancel-btn-bg);
  color: var(--text-dim);
  transition: background 150ms, color 150ms;
}
.diag-ack-btn:hover {
  background: var(--cancel-btn-hover-bg);
  color: var(--text-primary);
}

.diag-acked-label {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}
</style>
