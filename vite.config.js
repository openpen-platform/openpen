/// <reference types="vitest" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

/**
 * Dev-mode middleware that serves `/openpen-runtime/*.js` requests.
 *
 * In production, these are stable chunks emitted by Rollup's manualChunks
 * and referenced from the importmap in index.html. In dev mode, Vite does
 * not run Rollup, so those paths don't exist. The middleware intercepts the
 * three importmap targets and returns a re-export ESM that delegates to the
 * real resolved module — keeping the importmap working without a real build.
 *
 *   /openpen-runtime/vue.js           → re-export * from 'vue'
 *   /openpen-runtime/module-api.js    → re-export * from '@openpen/module-api'
 *   /openpen-runtime/module-api-uikit.js → re-export * from '@openpen/module-api/uikit'
 *
 * Vite resolves the bare specifiers inside the re-export through its own
 * module graph, so plugins get the same live module objects as the host.
 */
function openpenRuntimeDevMiddlewarePlugin() {
  // Each runtime URL maps to a virtual module id. Vite resolves the bare
  // specifier inside the virtual source through its own dep-rewriter, so the
  // emitted JS contains `/node_modules/.vite/deps/vue.js?v=...` (NOT the bare
  // 'vue'). Returning the bare specifier directly would cause the browser to
  // re-apply the importmap and recurse indefinitely
  // (SyntaxError: Detected cycle while resolving name 'default' in 'vue').
  const urlToVirtual = {
    '/openpen-runtime/vue.js': '\0virtual:openpen-runtime-vue',
    '/openpen-runtime/module-api.js': '\0virtual:openpen-runtime-module-api',
    '/openpen-runtime/module-api-uikit.js': '\0virtual:openpen-runtime-module-api-uikit',
  };
  const virtualSource = {
    // Vue is a namespace-only ESM (no default export); only re-export named.
    '\0virtual:openpen-runtime-vue': `export * from 'vue';\n`,
    '\0virtual:openpen-runtime-module-api': `export * from '@openpen/module-api';\n`,
    '\0virtual:openpen-runtime-module-api-uikit': `export * from '@openpen/module-api/uikit';\n`,
  };
  return {
    name: 'openpen-runtime-dev-middleware',
    resolveId(id) {
      if (Object.prototype.hasOwnProperty.call(virtualSource, id)) return id;
      return null;
    },
    load(id) {
      return virtualSource[id];
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const virtualId = urlToVirtual[req.url ?? ''];
        if (virtualId === undefined) return next();
        try {
          const result = await server.transformRequest(virtualId);
          if (!result) return next();
          res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
          res.end(result.code);
        } catch (e) {
          next(e);
        }
      });
    },
  };
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [vue(), openpenRuntimeDevMiddlewarePlugin()],
  // base './' ensures all asset paths in dist/index.html are relative, which
  // is required for Electron's file:// protocol. With base '/' (Vite default)
  // paths become absolute and fail when loaded via file://.
  base: './',
  build: {
    rollupOptions: {
      /**
       * Externalize vue and @openpen/module-api from the main app so they are
       * NOT inlined into assets/index-[hash].js. Instead, they are loaded at
       * runtime via the importmap in index.html, pointing to the self-contained
       * openpen-runtime/*.js files built by `npm run build:runtime`.
       *
       * This is what guarantees ONE Vue instance shared between the host and
       * every plugin: both the host app and plugin bundles go through the
       * importmap → the same openpen-runtime/vue.js file.
       */
      external: ['vue', '@openpen/module-api', '@openpen/module-api/uikit'],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    include: [
      'tests/unit/**/*.test.{js,ts}',
      'src/core/modules/**/*.test.{js,ts}',
      'packages/*/tests/**/*.test.{js,ts}',
      'packages/*/src/**/*.test.{js,ts}',
    ],
    // Coverage scope = OpenPen's "unit-testable business logic" only.
    // Vue components (src/components, src/views) and Electron main
    // process are intentionally excluded — they are tested via E2E per
    // the testing standard in CLAUDE.md.
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'html'],
      include: [
        'src/**/*.{ts,js}',
        'packages/module-api/src/**/*.{ts,js,vue}',
      ],
      exclude: [
        '**/*.test.{ts,js}',
        '**/*.d.ts',
        'src/types/**',
        'src/runtime-entries/**',
        'src/main.ts',
      ],
    },
  },
});
