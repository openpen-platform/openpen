import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import path from 'node:path'

/**
 * Default Vite config for OpenPen plugins. Bundles `src/index.ts`
 * (the plugin entry) into `dist/renderer.js` as a single ESM file
 * that the host can dynamic-import via `openpen-plugin://`.
 *
 * Externals: Vue (host provides it), @openpen/module-api and
 * @openpen/module-api/uikit (peer deps resolved against the host's
 * bundled copies at runtime via importmap). Plugin code imports from
 * these without bundling them in; bundling uikit would produce a second
 * Reka UI instance and break Symbol-based inject keys.
 *
 * @param {{ cwd?: string, watch?: boolean }} [opts]
 */
export function buildPluginConfig(opts = {}) {
  const cwd = opts.cwd ?? process.cwd()
  return defineConfig({
    plugins: [vue(), cssInjectedByJsPlugin()],
    build: {
      cssCodeSplit: false,
      outDir: path.join(cwd, 'dist'),
      emptyOutDir: true,
      lib: {
        entry: path.join(cwd, 'src/index.ts'),
        formats: ['es'],
        fileName: () => 'renderer.js',
      },
      rollupOptions: {
        external: ['vue', '@openpen/module-api', '@openpen/module-api/uikit'],
      },
      sourcemap: true,
      watch: opts.watch ? {} : null,
    },
  })
}
