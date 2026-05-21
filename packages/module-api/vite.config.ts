import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [vue()],
  // Self-references (`import { ... } from '@openpen/module-api'`) inside the
  // package's own source must resolve back to src/ during the package's build;
  // otherwise Vite tries to look up the package via its own package.json
  // exports (which point at dist/, the very thing this build produces).
  resolve: {
    alias: [
      { find: /^@openpen\/module-api\/uikit\/internal$/, replacement: resolve(__dirname, 'src/uikit/internal.ts') },
      { find: /^@openpen\/module-api\/uikit$/,           replacement: resolve(__dirname, 'src/uikit/index.ts') },
      { find: /^@openpen\/module-api\/host\/registry$/,  replacement: resolve(__dirname, 'src/host/registry.ts') },
      { find: /^@openpen\/module-api\/host$/,            replacement: resolve(__dirname, 'src/host/index.ts') },
      { find: /^@openpen\/module-api$/,                  replacement: resolve(__dirname, 'src/index.ts') },
    ],
  },
  build: {
    lib: {
      entry: {
        'index': resolve(__dirname, 'src/index.ts'),
        'uikit/index': resolve(__dirname, 'src/uikit/index.ts'),
        'uikit/internal': resolve(__dirname, 'src/uikit/internal.ts'),
        'host/index': resolve(__dirname, 'src/host/index.ts'),
        'host/registry': resolve(__dirname, 'src/host/registry.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        'vue',
        'zod',
        'reka-ui',
        'dompurify',
        '@vueuse/core',
        /^vue\//,
        /^reka-ui\//,
      ],
      output: {
        preserveModules: false,
        entryFileNames: '[name].js',
        chunkFileNames: '_chunks/[name]-[hash].js',
        assetFileNames: (info) => {
          if (info.name?.endsWith('.css')) return 'uikit/[name][extname]'
          return '[name][extname]'
        },
      },
    },
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: true,
  },
})
