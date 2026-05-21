/**
 * Builds three self-contained ESM runtime shims into dist/openpen-runtime/.
 *
 * These files are referenced by the importmap in dist/index.html so that
 * plugins (and the host app itself) importing bare specifiers like
 * `import { ref } from 'vue'` get the SAME module objects — enabling a
 * single shared Vue instance and cross-boundary reactivity.
 *
 * Uses Rollup directly (not Vite) to ensure truly self-contained bundles.
 * Vite's lib mode always keeps `export * from "vue"` as a re-export facade
 * regardless of `preserveEntrySignatures` / `ssr.noExternal`, which would
 * cause a circular importmap resolution at runtime.
 *
 * Run via: node scripts/build-runtime.mjs
 */
import { rollup } from 'rollup'
import nodeResolve from '@rollup/plugin-node-resolve'
import commonjs from '@rollup/plugin-commonjs'
import replace from '@rollup/plugin-replace'
import esbuild from 'rollup-plugin-esbuild'
import { compileScript, compileStyle, compileTemplate, parse as sfcParse } from '@vue/compiler-sfc'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fs from 'node:fs'
import crypto from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'dist', 'openpen-runtime')

fs.mkdirSync(OUT_DIR, { recursive: true })

/** Resolve a path relative to the monorepo root. */
const r = (...parts) => path.join(ROOT, ...parts)

const entries = [
  {
    input: r('src/runtime-entries/vue.ts'),
    output: r('dist/openpen-runtime/vue.js'),
    label: 'vue',
    // vue.js is the root of the dep tree — fully self-contained.
    extra_external: [],
  },
  {
    input: r('src/runtime-entries/module-api.ts'),
    output: r('dist/openpen-runtime/module-api.js'),
    label: 'module-api',
    // module-api imports vue; at runtime importmap routes "vue" → vue.js.
    // Mark vue as external so we don't bundle a second copy.
    extra_external: ['vue', /^@vue\//],
  },
  {
    input: r('src/runtime-entries/module-api-uikit.ts'),
    output: r('dist/openpen-runtime/module-api-uikit.js'),
    label: 'module-api-uikit',
    // uikit imports vue + @openpen/module-api.
    // Both are available via importmap at runtime.
    extra_external: ['vue', /^@vue\//, '@openpen/module-api'],
  },
]

const sharedPlugins = [
  replace({
    preventAssignment: true,
    values: {
      'process.env.NODE_ENV': '"production"',
      // Vite's import.meta.env.* keys. Vite substitutes these at build time
      // for first-party builds, but the runtime shims here are bundled with
      // Rollup directly, so any module-api SFC that reads import.meta.env.DEV
      // (e.g. AppPopover's dev-only warning) would otherwise hit
      // `Cannot read properties of undefined (reading 'DEV')` at plugin load.
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env.MODE': '"production"',
      'import.meta.env.SSR': 'false',
      '__DEV__': 'false',
      '__ESM_BUNDLER__': 'true',
      '__CJS__': 'false',
      '__TEST__': 'false',
      '__FEATURE_OPTIONS_API__': 'true',
      '__FEATURE_PROD_DEVTOOLS__': 'false',
      '__FEATURE_PROD_HYDRATION_MISMATCH_DETAILS__': 'false',
      '__FEATURE_SUSPENSE__': 'true',
      '__COMPAT__': 'false',
    },
  }),
  nodeResolve({
    browser: true,
    preferBuiltins: false,
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    moduleDirectories: ['node_modules'],
  }),
  commonjs({
    include: /node_modules/,
  }),
  esbuild({
    target: 'es2020',
    loaders: {
      '.ts': 'ts',
      '.tsx': 'tsx',
      '.vue': 'ts', // Vue SFC handled inline
    },
  }),
]

for (const { input, output, label, extra_external } of entries) {
  console.log(`[build-runtime] bundling ${label} …`)

  const bundle = await rollup({
    input,
    external: (id) => {
      // Always exclude Node.js built-ins and Electron.
      if (id.startsWith('node:') || id === 'electron') return true
      // Per-entry extra externals (e.g. vue is external for module-api).
      for (const pattern of extra_external) {
        if (typeof pattern === 'string' ? id === pattern : pattern.test(id)) return true
      }
      return false
    },
    preserveEntrySignatures: 'strict',
    onwarn(warning, warn) {
      // Suppress expected Vue circular-dep warnings.
      if (warning.code === 'CIRCULAR_DEPENDENCY') return
      warn(warning)
    },
    plugins: [
      // Resolve @openpen/module-api* to the package's src/ so the vue-sfc
      // plugin below sees the raw .vue files and inlines scoped styles.
      // Without this we would resolve via package.json exports to the
      // pre-compiled dist/, where styles are emitted to a separate .css
      // file that this rollup pipeline does not know to load.
      {
        name: 'module-api-src-resolver',
        resolveId(id) {
          if (id === '@openpen/module-api') return r('packages/module-api/src/index.ts')
          if (id === '@openpen/module-api/uikit') return r('packages/module-api/src/uikit/index.ts')
          if (id === '@openpen/module-api/uikit/internal') return r('packages/module-api/src/uikit/internal.ts')
          if (id === '@openpen/module-api/host') return r('packages/module-api/src/host/index.ts')
          if (id === '@openpen/module-api/host/registry') return r('packages/module-api/src/host/registry.ts')
          return null
        },
      },
      // Compile Vue SFC files using @vue/compiler-sfc.
      {
        name: 'vue-sfc',
        async transform(source, id) {
          if (!id.endsWith('.vue')) return null

          const scopeId = `data-v-${crypto.createHash('md5').update(id).digest('hex').slice(0, 8)}`
          const { descriptor } = sfcParse(source, { filename: id })

          // Compile <script> / <script setup>.
          const scriptResult = compileScript(descriptor, {
            id: scopeId,
            genDefaultAs: '__vue_default__',
          })

          // Compile <template>.
          let templateCode = ''
          if (descriptor.template) {
            const tplResult = compileTemplate({
              id: scopeId,
              filename: id,
              source: descriptor.template.content,
              scoped: descriptor.scoped,
              compilerOptions: {
                bindingMetadata: scriptResult.bindings,
              },
            })
            templateCode = tplResult.code.replace(
              /^import \{ (.+) \} from ["']vue["']/m,
              (_match, imports) => `import { ${imports} } from 'vue'`
            )
          }

          // Compile <style> blocks. Vite's dev pipeline injects them via HMR;
          // the runtime build needs to inline them and self-inject at import
          // time, otherwise wrappers like AppSlider / AppPopover render
          // unstyled in production. Scoped styles get rewritten with the
          // [data-v-XXXX] attribute selector by compileStyle.
          const cssChunks = []
          for (const style of descriptor.styles) {
            const compiled = compileStyle({
              source: style.content,
              filename: id,
              id: scopeId,
              scoped: style.scoped,
            })
            if (compiled.errors.length > 0) {
              for (const err of compiled.errors) this.warn(`[vue-sfc] ${id}: ${err.message}`)
            }
            cssChunks.push(compiled.code)
          }
          const css = cssChunks.join('\n')
          const styleInjector = css
            ? `;(function(){if(typeof document==='undefined')return;` +
              `const k='__openpen_sfc_${scopeId}';if(document.head.querySelector('style['+k+']'))return;` +
              `const s=document.createElement('style');s.setAttribute(k,'');` +
              `s.textContent=${JSON.stringify(css)};document.head.appendChild(s);})();`
            : ''

          const finalCode = [
            scriptResult.content,
            templateCode,
            `__vue_default__.render = render`,
            `__vue_default__.__scopeId = "${scopeId}"`,
            styleInjector,
            `export default __vue_default__`,
          ].join('\n')

          return { code: finalCode, map: null, moduleSideEffects: 'no-treeshake' }
        },
      },
      ...sharedPlugins,
    ],
    treeshake: {
      moduleSideEffects: (id) => {
        // Keep side effects for Vue packages (they register globals).
        return id.includes('vue') || id.includes('reka-ui') || id.includes('module-api')
      },
    },
  })

  await bundle.write({
    file: output,
    format: 'es',
    sourcemap: false,
    exports: 'named',
  })
  await bundle.close()

  const size = fs.statSync(output).size
  console.log(`[build-runtime] → dist/openpen-runtime/${label}.js (${(size / 1024).toFixed(1)} kB)`)
}

console.log('[build-runtime] done.')
