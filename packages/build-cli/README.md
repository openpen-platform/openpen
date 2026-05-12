# @openpen/build

Zero-configuration build CLI for OpenPen plugin authors. Wraps Vite +
Vue so plugin developers never touch a `vite.config.js`.

## Install

```bash
npm install --save-dev @openpen/build @openpen/module-api
```

## Use

```bash
npx openpen-build           # one-shot build → dist/renderer.js
npx openpen-build --watch   # dev mode, rebuild on change
npx openpen-build --check   # type-check only (requires tsconfig.json)
```

The CLI expects, in the plugin's project root:

- `plugin.json` — the manifest the host scans.
- `src/index.ts` — the entry that default-exports an `OpenPenModule`.

It produces `dist/renderer.js` (single-file ESM, sourcemap included).
`vue`, `@openpen/module-api`, and `@openpen/module-api/uikit` are externalised —
the host provides them at runtime via importmap, so they never bloat the plugin
bundle.

> **`zod` is also externalised via `@openpen/module-api`.** Do NOT write
> `import { z } from 'zod'` in your plugin files — use
> `import { z } from '@openpen/module-api'` instead. A direct `'zod'` import
> will produce an unresolved-import build error because `zod` is not bundled
> into the plugin and is not provided as a standalone external by the host.

## CSS handling

Any `<style>` or `<style scoped>` block in your Vue SFCs is automatically
inlined into `dist/renderer.js` at build time via
[vite-plugin-css-injected-by-js v4](https://github.com/marco-prontera/vite-plugin-css-injected-by-js).

**You MUST NOT** ship a sibling `.css` file or reference a separate stylesheet
from `plugin.json`. The host plugin loader only reads the `renderer` field and
dynamically imports that single JS file — it does not load additional CSS assets.
The inline injection runs when the module is imported by the host, before any
Vue component mounts, so styles are available at first render.

This means:
- Plugin authors do not need to configure anything extra.
- `dist/*.css` will **not** appear in the build output (or, if Vite emits a
  near-empty placeholder, the host ignores it).
- Design-token overrides (`--openpen-*` CSS variables) and scoped component
  styles both work out of the box.

## License

MIT
