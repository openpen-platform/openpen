/**
 * dialog-internal-keys.ts — Internal injection keys for the imperative dialog system.
 *
 * HOST-INTERNAL: Do not export from any public barrel. Plugin authors must
 * never see or depend on these keys; they exist only so DialogHost can
 * provide the handle that useDialogPluginComponent() reads.
 */
import type { InjectionKey } from 'vue'
import type { DialogPluginComponentHandle } from './useDialogPluginComponent'

/**
 * Injection key that DialogHost provides to custom dialog components.
 * Components rendered via useDialog().custom() use useDialogPluginComponent()
 * which injects this key to get ok/cancel/dismiss callbacks.
 */
export const DIALOG_PLUGIN_HANDLE_KEY: InjectionKey<DialogPluginComponentHandle<unknown>> =
  Symbol('openpen:dialog-plugin-handle')
