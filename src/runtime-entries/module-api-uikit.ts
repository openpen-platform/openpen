/**
 * openpen-runtime/module-api-uikit.js entry point.
 *
 * Re-exports the complete @openpen/module-api/uikit public surface so
 * plugins that import from '@openpen/module-api/uikit' via the importmap
 * get the same module object (and the same Vue component instances) the
 * host uses.
 */
export * from '@openpen/module-api/uikit'
