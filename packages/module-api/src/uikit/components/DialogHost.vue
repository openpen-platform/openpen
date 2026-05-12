<script setup lang="ts">
/**
 * DialogHost — private host-internal component.
 *
 * HOST-INTERNAL: Do not export from any public barrel. Plugin authors never
 * interact with this component directly. The host mounts exactly one instance
 * at bootstrap; it renders the currently active imperative dialog request from
 * the useDialog() store.
 *
 * Rendering strategy:
 * - Reads the active request from _activeRequest (module-scoped reactive ref).
 * - Renders an <AppDialog> wired to that request's options.
 * - On ok / cancel / dismiss: resolves the request's Promise and advances queue.
 *
 * Settings window constraint: AppDialog internally injects MODAL_MANAGER_KEY
 * and CONTROL_BAR_ANIMATING_KEY. In the settings window those keys are not
 * provided (ControlBar only exists in the overlay/main window), so the dialog
 * falls back gracefully (no mutual exclusion, no animating-guard) — it still
 * renders and resolves correctly, just without those host integrations.
 */
import { computed, nextTick, provide, ref, watch } from 'vue'
import AppDialog from './AppDialog.vue'
// _activeRequest MUST come from the package barrel — see AppPopover.vue header
// comment. The runtime build externalises '@openpen/module-api/uikit' so host
// + uikit share the same module instance. A relative '../composables/useDialog'
// import bundles a duplicate ref into the host bundle, causing useDialog()
// callers to write to a different ref than DialogHost watches (dialog never
// opens in production).
import { _activeRequest, _resolveActive } from '@openpen/module-api/uikit'
import { DIALOG_PLUGIN_HANDLE_KEY } from '../composables/dialog-internal-keys'
import type { DialogPluginComponentHandle } from '../composables/useDialogPluginComponent'

const MODAL_ID = '__openpen_imperative_dialog__'

// Whether the dialog is open: true when there is an active request.
const isOpen = ref(false)

// Prompt value — bound to the input in prompt dialogs.
const promptValue = ref('')

// Track the prompt input element so we can focus it on open.
const promptInputRef = ref<HTMLInputElement | null>(null)

// Watch the active request: open when a request arrives, close when cleared.
watch(_activeRequest, (req) => {
  if (req) {
    if (req.kind === 'prompt') {
      promptValue.value = req.opts.defaultValue ?? ''
    }
    isOpen.value = true
    if (req.kind === 'prompt') {
      nextTick(() => {
        promptInputRef.value?.focus()
      })
    }
  } else {
    isOpen.value = false
  }
})

// Derived from the active request for convenience.
const req = computed(() => _activeRequest.value)
const opts = computed(() => req.value?.opts)

function handleOk() {
  const r = _activeRequest.value
  if (!r) return
  if (r.kind === 'confirm') {
    r.resolve(true)
  } else if (r.kind === 'alert') {
    r.resolve()
  } else if (r.kind === 'prompt') {
    r.resolve(promptValue.value)
  }
  // custom: custom component handles its own resolution via ok/cancel/dismiss
  _resolveActive()
}

function handleCancel() {
  const r = _activeRequest.value
  if (!r) return
  if (r.kind === 'confirm') {
    r.resolve(false)
  } else if (r.kind === 'prompt') {
    r.resolve(null)
  }
  _resolveActive()
}

function handleUpdateOpen(v: boolean) {
  if (!v) {
    // Dialog closed via ESC / close button (not persistent).
    const r = _activeRequest.value
    if (!r) return
    if (r.kind === 'confirm') {
      r.resolve(false)
    } else if (r.kind === 'alert') {
      r.resolve()
    } else if (r.kind === 'prompt') {
      r.resolve(null)
    } else if (r.kind === 'custom') {
      r.resolve(null)
    }
    _resolveActive()
  }
}

// ── Custom component plugin handle ───────────────────────────────────────────
//
// Provide the handle so custom components can call ok/cancel/dismiss via
// useDialogPluginComponent(). We provide at this component level so only the
// custom component subtree gets it.

function customOk(payload?: unknown) {
  const r = _activeRequest.value
  if (!r || r.kind !== 'custom') return
  r.resolve(payload ?? null)
  _resolveActive()
}

function customCancel() {
  const r = _activeRequest.value
  if (!r || r.kind !== 'custom') return
  r.resolve(null)
  _resolveActive()
}

const pluginHandle: DialogPluginComponentHandle<unknown> = {
  ok: customOk,
  cancel: customCancel,
  dismiss: customCancel,
}

provide(DIALOG_PLUGIN_HANDLE_KEY, pluginHandle)
</script>

<template>
  <!-- DialogHost renders nothing when there is no active request. -->
  <AppDialog
    v-if="req"
    :modal-id="MODAL_ID"
    :title="opts!.title"
    :open="isOpen"
    :persistent="opts!.persistent"
    :danger="opts!.danger"
    @update:open="handleUpdateOpen"
  >
    <!-- Body slot: varies by kind -->
    <template v-if="req.kind === 'confirm' || req.kind === 'alert'">
      <p class="openpen-dialog-host-message">{{ (opts as { message: string }).message }}</p>
    </template>

    <template v-else-if="req.kind === 'prompt'">
      <p class="openpen-dialog-host-message">{{ (opts as { message: string }).message }}</p>
      <input
        ref="promptInputRef"
        v-model="promptValue"
        class="openpen-dialog-host-input"
        :placeholder="(opts as { placeholder?: string }).placeholder"
        type="text"
        @keydown.enter="handleOk"
        @keydown.esc="handleCancel"
      />
    </template>

    <template v-else-if="req.kind === 'custom'">
      <!-- Render the custom component; it gets ok/cancel/dismiss via injection. -->
      <component
        :is="(opts as { component: unknown }).component"
        v-bind="(opts as { componentProps?: Record<string, unknown> }).componentProps ?? {}"
      />
    </template>

    <!-- Footer slot: only for confirm/alert/prompt; custom owns its own buttons. -->
    <template v-if="req.kind !== 'custom'" #footer>
      <button
        v-if="req.kind === 'confirm' || req.kind === 'prompt'"
        class="openpen-btn openpen-btn-secondary"
        @click="handleCancel"
      >
        {{ (opts as { cancelLabel?: string }).cancelLabel ?? 'Cancel' }}
      </button>
      <button
        class="openpen-btn openpen-btn-primary"
        :class="{ 'openpen-btn-danger': opts!.danger }"
        @click="handleOk"
      >
        {{ (opts as { okLabel?: string }).okLabel ?? 'OK' }}
      </button>
    </template>
  </AppDialog>
</template>

<style>
/* ── DialogHost utility styles ───────────────────────────────────────────── */
.openpen-dialog-host-message {
  margin: 0 0 var(--openpen-space-md, 12px) 0;
  color: var(--openpen-color-text-primary, #fff);
  line-height: 1.5;
}

.openpen-dialog-host-input {
  display: block;
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  border: 1px solid var(--openpen-color-border-hi, rgba(255,255,255,0.2));
  border-radius: var(--openpen-radius-sm, 6px);
  background: var(--openpen-color-control, rgba(255,255,255,0.08));
  color: var(--openpen-color-text-primary, #fff);
  font-size: 13px;
  outline: none;
}

.openpen-dialog-host-input:focus {
  border-color: var(--accent, #7c7cff);
  box-shadow: 0 0 0 2px var(--accent-bg, rgba(124,124,255,0.18));
}

/* ── DialogHost button styles ─────────────────────────────────────────────── */
.openpen-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 16px;
  border-radius: var(--openpen-radius-sm, 6px);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background var(--openpen-duration-fast, 120ms), color var(--openpen-duration-fast, 120ms);
}

.openpen-btn-secondary {
  background: var(--openpen-color-control, rgba(255,255,255,0.08));
  color: var(--openpen-color-text-primary, #fff);
}

.openpen-btn-secondary:hover {
  background: var(--openpen-color-control-hover, rgba(255,255,255,0.14));
}

.openpen-btn-primary {
  background: var(--accent, #7c7cff);
  color: #fff;
}

.openpen-btn-primary:hover {
  opacity: 0.9;
}

.openpen-btn-danger {
  background: var(--openpen-color-danger, #e05252);
  color: #fff;
}

.openpen-btn-danger:hover {
  opacity: 0.9;
}
</style>
