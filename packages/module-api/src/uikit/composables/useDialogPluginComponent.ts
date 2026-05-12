/**
 * useDialogPluginComponent — composable for components rendered via useDialog().custom().
 *
 * The custom component calls this to get ok/cancel/dismiss callbacks, which
 * resolve the Promise returned by useDialog().custom().
 */
import { inject } from 'vue'
import { DIALOG_PLUGIN_HANDLE_KEY } from './dialog-internal-keys'

export interface DialogPluginComponentHandle<T = unknown> {
  /** Resolve with a payload value and close the dialog. */
  ok(payload?: T): void
  /** Resolve with null and close the dialog. */
  cancel(): void
  /** Alias for cancel() — resolves with null. */
  dismiss(): void
}

export function useDialogPluginComponent<T = unknown>(): DialogPluginComponentHandle<T> {
  const handle = inject(DIALOG_PLUGIN_HANDLE_KEY)
  if (!handle) {
    throw new Error(
      'useDialogPluginComponent() must be called inside a component rendered via useDialog().custom()'
    )
  }
  return handle as DialogPluginComponentHandle<T>
}
