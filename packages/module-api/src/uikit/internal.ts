/**
 * @openpen/module-api/uikit/internal — host-only internal exports.
 *
 * HOST-INTERNAL: This sub-path is for the OpenPen host application only.
 * Do NOT import from this path in module code, plugin code, or any public
 * documentation. The API surface here may change without notice.
 *
 * Currently exports:
 *   DialogHost — the imperative dialog renderer mounted by App.vue at bootstrap.
 *                DialogHost is NOT part of the plugin-facing uikit API.
 */
export { default as DialogHost } from './components/DialogHost.vue'
