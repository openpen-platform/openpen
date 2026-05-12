/**
 * openpen-runtime/vue.js entry point.
 *
 * Re-exports the complete Vue public API so plugins that import
 *   `import { ref, computed, … } from 'vue'`
 * via the importmap receive the SAME module object the host uses.
 *
 * This file is an explicit Rollup entry (build.rollupOptions.input),
 * not a manualChunks target. Explicit entries generate real ESM
 * modules with stable named exports, whereas manualChunks generates
 * internal bundle chunks whose export names are Rollup-mangled.
 */
export * from 'vue'
