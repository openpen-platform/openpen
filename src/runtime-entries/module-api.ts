/**
 * openpen-runtime/module-api.js entry point.
 *
 * Re-exports the complete @openpen/module-api public surface so plugins
 * that import from '@openpen/module-api' via the importmap get the same
 * module object the host uses.
 */
export * from '@openpen/module-api'
