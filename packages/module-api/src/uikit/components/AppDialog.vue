<script setup lang="ts">
/**
 * AppDialog — High-level wrapper (Layer 1).
 *
 * Plugin authors use this component without needing to know about inject
 * keys, Reka UI, modal manager mutual exclusion, or the animating guard.
 *
 * Public API is stable: switching the underlying headless library in the
 * future does not break the plugin author's code.
 *
 * Implementation notes:
 * - `open` prop is the single source of truth (controlled mode). The
 *   component emits `update:open` for two-way binding. Internally it also
 *   registers with the modal manager for mutual exclusion (same pattern as
 *   AppPopover): when `open` turns true we call manager.open(); when
 *   another panel causes the manager to close us we emit update:open(false).
 * - `persistent`: when true, ESC and backdrop clicks are suppressed via
 *   @interact-outside.prevent and @escape-key-down.prevent on DialogContent.
 * - `danger`: adds class `openpen-modal-danger` on the content element as a
 *   styling hook for destructive-action dialogs (no default style yet).
 * - animating guard: auto-close during ControlBar scaleY animation.
 * - usePassthroughGuard: registered on the dialog content element so the
 *   transparent Electron window remains clickable when dialog is open.
 * - Styles are unscoped because DialogContent is teleported outside the
 *   component's DOM subtree (same reason as AppPopover).
 *
 * CSS class names (.openpen-modal-*) are intentionally kept as the carried-over
 * internal styling tokens — renaming carries no DX benefit and risks accidental
 * style breakage in any code path still referencing them.
 */
import { computed, inject, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import {
  DialogRoot,
  DialogTrigger,
  DialogPortal,
  DialogContent,
  DialogOverlay,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from '../primitives'
// Inject keys MUST come from the package barrel — see AppPopover.vue
// header comment for why relative imports break Symbol identity in prod.
import {
  MODAL_MANAGER_KEY,
  CONTROL_BAR_ANIMATING_KEY,
  HOST_DIALOG_OPEN_COUNT_KEY,
} from '@openpen/module-api'
import { usePassthroughGuard } from '../../host/passthrough'

// ── OpenPen-owned types (MUST NOT reference reka-ui types) ───────────────────

export interface AppDialogProps {
  /** Globally unique modal id; used for modal-stack mutual exclusion. */
  modalId: string
  /** Dialog title displayed in the dialog header. */
  title: string
  /** Controlled open state. The parent must handle update:open to toggle. */
  open: boolean
  /**
   * When true, ESC key and backdrop clicks do not close the dialog.
   * Use for confirmations that require an explicit button press.
   */
  persistent?: boolean
  /**
   * When true, adds the `openpen-modal-danger` CSS class on the content
   * element — a hook for styling destructive-action dialogs.
   */
  danger?: boolean
}

export interface AppDialogSlots {
  /**
   * Trigger slot; scope exposes active state + toggle / open / close actions.
   * MUST NOT write @click="toggle" on the trigger — DialogTrigger's as-child
   * handles activation automatically; toggle/open/close are escape hatches for
   * programmatic control only.
   */
  trigger: (scope: {
    active: boolean
    toggle: () => void
    open: () => void
    close: () => void
  }) => unknown
  /** Dialog body content slot. */
  default: () => unknown
  /** Optional footer slot (action buttons etc.). */
  footer?: () => unknown
}

const props = withDefaults(defineProps<AppDialogProps>(), {
  persistent: false,
  danger: false,
})

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

defineSlots<AppDialogSlots>()

// ── 1. Inject host context (plugin author never sees these) ───────────────────

const modalManager = inject(MODAL_MANAGER_KEY)
const animating = inject(CONTROL_BAR_ANIMATING_KEY)
const dialogOpenCount = inject(HOST_DIALOG_OPEN_COUNT_KEY, null)

// Track whether THIS instance currently holds a count, so we never double
// increment / decrement (e.g. on rapid open / close cycles or unmount-while-open).
let counted = false

function acquireCount() {
  if (counted || !dialogOpenCount) return
  dialogOpenCount.value += 1
  counted = true
}

function releaseCount() {
  if (!counted || !dialogOpenCount) return
  dialogOpenCount.value -= 1
  counted = false
}

onBeforeUnmount(releaseCount)

// ── 2. Modal manager mutual exclusion + controlled open prop ─────────────────
//
// The `open` prop is the canonical state. We watch it and push changes into
// the modal manager. When the manager closes us (e.g. another panel opens),
// we detect that via the computed isManagerOpen and emit update:open(false).

function openDialog() {
  modalManager?.open(props.modalId)
  emit('update:open', true)
}

function closeDialog() {
  modalManager?.close(props.modalId)
  emit('update:open', false)
}

function toggleDialog() {
  if (props.open) {
    closeDialog()
  } else {
    openDialog()
  }
}

// When the prop turns true: register with the manager + bump host dialog count.
// When it turns false: unregister + release count. Keeps everything in sync.
watch(
  () => props.open,
  (newOpen) => {
    if (newOpen) {
      modalManager?.open(props.modalId)
      acquireCount()
    } else {
      modalManager?.close(props.modalId)
      releaseCount()
    }
  },
  { immediate: true }
)

// When the manager closes us (another panel opened), emit update:open(false)
// so the parent's v-model updates.
const isManagerOpen = computed(() => modalManager?.isOpen(props.modalId) ?? props.open)

watch(isManagerOpen, (managerOpen) => {
  if (!managerOpen && props.open) {
    emit('update:open', false)
  }
})

// Effective open state passed to Reka UI's DialogRoot.
const isOpen = computed(() => props.open && isManagerOpen.value)

// Sync Reka UI's internal close events (ESC, overlay click) back to caller
// unless `persistent` suppresses them.
function onUpdateOpen(v: boolean) {
  if (!v && props.persistent) {
    // Persistent mode: ignore Reka UI close attempts; stay open.
    return
  }
  if (v) {
    openDialog()
  } else {
    closeDialog()
  }
}

// ── 3. ControlBar animation guard — auto-close during transitions ─────────────

watch(
  () => animating?.value,
  (isAnimating) => {
    if (isAnimating && props.open) {
      closeDialog()
    }
  }
)

// ── 4. Passthrough guard integration ─────────────────────────────────────────
//
// DialogContent is a Vue component; normalize to HTMLElement via watcher.

const contentInstance = useTemplateRef<HTMLElement | { $el?: HTMLElement } | null>('content')
const contentEl = ref<HTMLElement | null>(null)

watch(contentInstance, (instance) => {
  if (!instance) {
    contentEl.value = null
  } else if (instance instanceof HTMLElement) {
    contentEl.value = instance
  } else if (typeof instance === 'object' && '$el' in instance && instance.$el instanceof HTMLElement) {
    contentEl.value = instance.$el
  } else {
    contentEl.value = null
  }
})

usePassthroughGuard(contentEl)
</script>

<template>
  <DialogRoot :open="isOpen" @update:open="onUpdateOpen">
    <DialogTrigger as-child>
      <slot
        name="trigger"
        :active="isOpen"
        :toggle="toggleDialog"
        :open="openDialog"
        :close="closeDialog"
      />
    </DialogTrigger>
    <DialogPortal>
      <DialogOverlay class="openpen-modal-overlay" />
      <DialogContent
        ref="content"
        class="openpen-modal-content openpen-interactive"
        :class="{ 'openpen-modal-danger': danger }"
        @interact-outside="(e: Event) => persistent && e.preventDefault()"
        @escape-key-down="(e: KeyboardEvent) => persistent && e.preventDefault()"
      >
        <DialogTitle class="openpen-modal-title">{{ title }}</DialogTitle>
        <DialogDescription class="openpen-modal-description sr-only" />
        <div class="openpen-modal-body">
          <slot />
        </div>
        <div v-if="$slots.footer" class="openpen-modal-footer">
          <slot name="footer" />
        </div>
        <DialogClose class="openpen-modal-close" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </DialogClose>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<!-- Styles MUST be unscoped — Vue scoped CSS does not follow Teleport targets,
     so .openpen-modal-* classes would not receive the scoped data-v-* attribute
     when rendered inside the portal. -->
<style>
/* ── Overlay (transparent click absorber, NOT a dim backdrop) ─────────────────
   OpenPen's overlay window is transparent + frameless. A traditional dim/blur
   backdrop renders as a small dark patch only over the visible chrome — visually
   jarring. The overlay is therefore kept fully transparent here; its only job
   is to absorb outside clicks (so Reka can dispatch interact-outside → close
   when not persistent) and to protect the canvas from stray clicks while the
   dialog is open. Host containers (e.g. ControlBar) render their own "locked"
   visual state via HOST_DIALOG_OPEN_COUNT_KEY. */
.openpen-modal-overlay {
  position: fixed;
  inset: 0;
  background: transparent;
  z-index: 200;
  pointer-events: auto;
}

/* ── Dialog content panel ────────────────────────────────────────────────── */
.openpen-modal-content {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 201;
  min-width: 320px;
  max-width: min(480px, calc(100vw - 48px));
  max-height: calc(100vh - 96px);
  overflow-y: auto;

  background: var(--openpen-color-surface-popup);
  border: 1px solid var(--openpen-color-border-hi);
  border-radius: var(--openpen-radius-lg);
  box-shadow: var(--openpen-shadow);
  backdrop-filter: var(--openpen-blur);
  -webkit-backdrop-filter: var(--openpen-blur);

  color: var(--openpen-color-text-primary);
  font-size: 13px;
  padding: var(--openpen-space-lg);
  pointer-events: auto;
}

/* ── Title ───────────────────────────────────────────────────────────────── */
.openpen-modal-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--openpen-color-text-primary);
  margin: 0 0 var(--openpen-space-md) 0;
  padding-right: 28px; /* leave room for close button */
  line-height: 1.4;
}

/* ── Visually hidden description (a11y) ──────────────────────────────────── */
.openpen-modal-description.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

/* ── Body ────────────────────────────────────────────────────────────────── */
.openpen-modal-body {
  color: var(--openpen-color-text-primary);
}

/* ── Footer ──────────────────────────────────────────────────────────────── */
.openpen-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--openpen-space-sm);
  margin-top: var(--openpen-space-lg);
  padding-top: var(--openpen-space-md);
  border-top: 1px solid var(--openpen-color-border);
}

/* ── Close button ────────────────────────────────────────────────────────── */
.openpen-modal-close {
  position: absolute;
  top: var(--openpen-space-md);
  right: var(--openpen-space-md);
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--openpen-color-text-dim);
  border-radius: var(--openpen-radius-sm);
  cursor: pointer;
  transition: background var(--openpen-duration-fast), color var(--openpen-duration-fast);
}

.openpen-modal-close:hover {
  background: var(--openpen-color-control-hover);
  color: var(--openpen-color-text-primary);
}

/* ── Open / close animations ─────────────────────────────────────────────────
   Reka UI's Presence keeps the element in the DOM until the CSS animation
   ends, so [data-state="closed"] animations DO play on close.
   Pattern matches AppPopover keyframes (200ms bounce enter, 150ms ease leave). */

/* Overlay is always transparent — no fade-in/out animation needed.
   Only the dialog content panel animates. */

.openpen-modal-content[data-state='open'] {
  animation: openpen-modal-in 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.openpen-modal-content[data-state='closed'] {
  animation: openpen-modal-out 150ms ease forwards;
}

@keyframes openpen-modal-in {
  from { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
  to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
}
@keyframes openpen-modal-out {
  from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  to   { opacity: 0; transform: translate(-50%, -50%) scale(0.92); }
}
</style>
