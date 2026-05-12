/**
 * useDialog — imperative dialog API for OpenPen modules.
 *
 * Returns a DialogApi with confirm/alert/prompt/custom methods that each
 * return a Promise. At most one imperative dialog is open at a time; extra
 * calls are queued and executed sequentially.
 *
 * The active request is stored in a module-scoped reactive store. DialogHost
 * (mounted by the host at bootstrap) reads this store and renders the dialog.
 *
 * Usage:
 *   const dialog = useDialog()
 *   const ok = await dialog.confirm({ title: 'Delete?', message: '...' })
 */
import type { Component } from 'vue'
import { ref } from 'vue'

// ── Public option types ───────────────────────────────────────────────────────

interface BaseDialogOptions {
  title: string
  persistent?: boolean
  danger?: boolean
}

export interface DialogConfirmOptions extends BaseDialogOptions {
  message: string
  okLabel?: string
  cancelLabel?: string
}

export interface DialogAlertOptions extends BaseDialogOptions {
  message: string
  okLabel?: string
}

export interface DialogPromptOptions extends BaseDialogOptions {
  message: string
  defaultValue?: string
  placeholder?: string
  okLabel?: string
  cancelLabel?: string
}

export interface DialogCustomOptions<T = unknown> extends BaseDialogOptions {
  component: Component
  componentProps?: Record<string, unknown>
  /** Phantom type field for TypeScript to infer the resolution payload type. */
  __payloadType?: T
}

// ── Internal request types (tagged union) ─────────────────────────────────────

type DialogRequest =
  | { kind: 'confirm'; opts: DialogConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'alert';   opts: DialogAlertOptions;   resolve: () => void }
  | { kind: 'prompt';  opts: DialogPromptOptions;  resolve: (v: string | null) => void }
  | { kind: 'custom';  opts: DialogCustomOptions<unknown>; resolve: (v: unknown) => void }

// ── Module-scoped store ───────────────────────────────────────────────────────
//
// Single reactive ref holds the currently rendered request. DialogHost watches
// this and renders the appropriate dialog. When DialogHost resolves a request,
// it calls resolveActive() which drains the queue.

export const _activeRequest = ref<DialogRequest | null>(null)

const _queue: (() => void)[] = []
let _processing = false

function _enqueue(run: () => void): void {
  if (_processing) {
    _queue.push(run)
  } else {
    _processing = true
    run()
  }
}

/**
 * Called by DialogHost when the dialog is resolved (ok/cancel/dismiss).
 * Advances the queue if there are pending requests.
 */
export function _resolveActive(): void {
  _activeRequest.value = null
  const next = _queue.shift()
  if (next) {
    next()
  } else {
    _processing = false
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface DialogApi {
  confirm(opts: DialogConfirmOptions): Promise<boolean>
  alert(opts: DialogAlertOptions): Promise<void>
  prompt(opts: DialogPromptOptions): Promise<string | null>
  custom<T = unknown>(opts: DialogCustomOptions<T>): Promise<T | null>
}

export function useDialog(): DialogApi {
  return {
    confirm(opts: DialogConfirmOptions): Promise<boolean> {
      return new Promise<boolean>((resolve) => {
        _enqueue(() => {
          _activeRequest.value = { kind: 'confirm', opts, resolve }
        })
      })
    },

    alert(opts: DialogAlertOptions): Promise<void> {
      return new Promise<void>((resolve) => {
        _enqueue(() => {
          _activeRequest.value = { kind: 'alert', opts, resolve }
        })
      })
    },

    prompt(opts: DialogPromptOptions): Promise<string | null> {
      return new Promise<string | null>((resolve) => {
        _enqueue(() => {
          _activeRequest.value = { kind: 'prompt', opts, resolve }
        })
      })
    },

    custom<T = unknown>(opts: DialogCustomOptions<T>): Promise<T | null> {
      return new Promise<T | null>((resolve) => {
        _enqueue(() => {
          _activeRequest.value = {
            kind: 'custom',
            opts: opts as DialogCustomOptions<unknown>,
            resolve: resolve as (v: unknown) => void,
          }
        })
      })
    },
  }
}
