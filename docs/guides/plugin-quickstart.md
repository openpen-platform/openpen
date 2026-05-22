---
title: Plugin Quick-start
description: From zero to a running OpenPen plugin in five minutes.
---

# Plugin Quick-start

From zero to a running OpenPen plugin in five minutes.

## Prerequisites

- Node.js 20+, npm 9+
- OpenPen 1.0 or later installed

---

## Step 1 — Scaffold from the starter template

```bash
npx openpen-cli create @yourscope/my-plugin
cd my-plugin
npm install
```

Replace `yourscope` with your GitHub username or org name (lowercase).
`openpen create` copies the plugin-starter template, substitutes the id, and prints next steps.

> **Manual scaffold gotcha**: if you skip `openpen-cli create` and copy the
> plugin-starter by hand, you MUST keep these three places in sync — they all
> declare the plugin id and a mismatch causes `useModuleContext()` to throw at
> runtime:
> - `plugin.json` → `"id"`
> - `src/module-id.ts` → `MODULE_ID`
> - `defineModule({ id })` in `src/index.ts` (typically imported from `module-id.ts`)

## Step 2 — Build

```bash
npm run build    # outputs dist/renderer.js
npm run dev      # watch mode during development
```

## Step 3 — Install locally for testing

Use the CLI to copy the built plugin into the host's plugin directory:

```bash
npx openpen-cli plugin add .
```

`openpen plugin add <local-path>` copies `plugin.json`, `dist/`, and `locales/`
(when present) into `~/.openpen/plugins/@yourscope/my-plugin/`. The host scans
this directory at startup; see the tutorial's [worked example](../tutorials/build-your-first-plugin.md#2-install-for-local-development) for more.

> Files on disk are only half the picture — `plugin-meta.json` is rebuilt by
> the host the next time OpenPen starts. See
> [`plugin-meta.json` ownership](../concepts/plugin-compatibility.md#plugin-meta-json-ownership)
> for what happens after `plugin add` returns.

### Manual install (alternative)

If the CLI is not available, the equivalent shell commands are:

```bash
mkdir -p ~/.openpen/plugins/@yourscope/my-plugin
cp -R plugin.json dist ~/.openpen/plugins/@yourscope/my-plugin/
```

## Step 4 — Test in the app

Restart OpenPen and look for your contribution in the control bar.

> [!IMPORTANT]
> Plugin loading requires the **production build** of OpenPen
> (`npm run build` output / a packaged release). The Vite dev server (`npm run dev`
> in the host repo) does **not** load plugins — plugins installed in
> `~/.openpen/plugins/` are skipped in dev mode. Confirm you are running a
> packaged OpenPen before debugging "plugin not loading" issues.

---

## Project layout

```
my-plugin/
├── plugin.json             ← Manifest the host scans (id, version, etc.)
├── package.json            ← devDeps: @openpen/build, @openpen/module-api
├── tsconfig.json           ← Optional, used by `npm run check`
└── src/
    ├── module-id.ts        ← Single source of truth for the plugin's id
    ├── index.ts            ← Default-exports an OpenPenModule
    └── *.vue / *.ts        ← Your plugin's components & helpers
```

`src/module-id.ts` exports a single `MODULE_ID` constant that both `defineModule({ id })` in `index.ts` and any other code paths that need to refer to the plugin's id import from. Keeping the id in one place is the convention the gotcha callout above warns about — see the worked example in [tutorials/build-your-first-plugin.md](../tutorials/build-your-first-plugin.md) for the full pattern.

---

## Module entry point

Every plugin MUST default-export an `OpenPenModule` object from `src/index.ts`.
The canonical way to produce one is `defineModule()` from `@openpen/module-api`:

```ts
import { defineModule } from '@openpen/module-api'
```

The import path is the **package root** — no sub-path export is needed.

### Minimal `src/index.ts`

```ts
import { defineModule } from '@openpen/module-api'
import MyButton from './MyButton.vue'

export default defineModule({
  id: '@yourscope/my-plugin',            // @scope/name format, globally unique
  contributes: {
    controlBar: [{ id: 'my-btn', component: MyButton }],
  },
})
```

`defineModule()` provides full TypeScript type inference over `contributes` and
runs id-format + slot-key sanity checks at the module's own build boundary (so
errors surface in your repo, not deep inside the host at load time).

For the full `OpenPenModule` interface and all available `contributes` keys, see
[module-architecture.md](../concepts/module-architecture.md).

---

## What `contributes` does

`contributes` is a typed map keyed by slot. Mix-and-match what you need; add at
least one entry.

```ts
import { defineModule, z } from '@openpen/module-api'

export default defineModule({
  id: 'my-plugin',
  settingsSchema: z.object({ opacity: z.number().default(0.8) }),
  contributes: {
    tools: [{ id: 'my-tool', /* onPointerDown/Move/Up + renderStroke — see slots.md */ }],
    cursors: [{ id: 'my-tool', cursor: { svg: '<svg .../>', hotspot: { x: 4, y: 20 } } }],
    controlBar: [{ id: 'btn', component: MyBtn }],
    settingsPanels: [{ id: 'prefs', label: { en: 'My Plugin' }, component: MyPrefsPanel }],
    shortcuts: [{
      id: 'do-thing',
      keys: 'CommandOrControl+Alt+D',
      scope: 'global',
      label: { en: 'Do the thing' },
      userCustomizable: true,
      handler() {},
    }],
  },
})
```

- `tools` registers a drawing tool. See [`canvas.tools`](../slots/canvas#canvas-tools) for the full `ToolContribution` interface (id, label, icon, pointer handlers, optional `renderStroke`).
- `cursors` ties a custom DOM cursor to a tool — the `id` on `CursorContribution` MUST match the `id` on its `ToolContribution`. See [`ui.cursors`](../slots/ui#ui-cursors) for the cursor shape options (inline SVG / relative path / PNG) and the `--openpen-cursor-accent` theming convention.
- `settingsPanels` adds a section to **Settings → Features**. Use `settingsTabs` only for modules that need a full dedicated tab.
- Shortcuts with `label` and `userCustomizable: true` appear in **Settings → Shortcuts** under your module's group, letting users rebind them. Omit both to run silently with the declared default.
- Pick accelerator defaults that won't collide with common OS bindings; the runtime logs a console error if `globalShortcut.register` is rejected.

For the full settings API (`getSettings`, `updateSettings`, `onSettingsChange`), see [guides/module-settings.md](./module-settings.md).

See [slots/index.md](../slots/index.md) for the full slot catalogue.

---

## Boundary rules

Plugin code may only import from:

- relative paths within the plugin
- `@openpen/module-api` (the SDK)
- `node:*` (main-side handlers only)
- third-party npm packages

Importing host internals (e.g. `src/services/...`) is rejected by the host's
boundary tests. The SDK exposes everything you need.

### Common pitfalls

**`zod` must come from `@openpen/module-api`.** `zod` is externalised by the
build CLI and resolved through the host's importmap at runtime. A direct
`import { z } from 'zod'` produces an unresolved-specifier error in production
builds. Always use:

```ts
import { z } from '@openpen/module-api'
```

**`@openpen/module-api/uikit` is also externalised.** The build CLI handles
this automatically. If you override `rollupOptions.external`, include all three:
`'vue'`, `'@openpen/module-api'`, and `'@openpen/module-api/uikit'`.

---

## Using UIKit components

OpenPen provides UIKit wrapper components so your plugin matches the host's visual
style with zero extra work. See [uikit/index.md](../uikit/index.md) for
the full component reference.

Quick example — a button that opens a slider popover:

```vue
<script setup lang="ts">
import { AppPopover, AppSlider } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const value = ref(50)
</script>

<template>
  <AppPopover popover-id="my-slider" placement="auto">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">Slider</button>
    </template>
    <template #content>
      <AppSlider v-model="value" :min="0" :max="100" width="120px" />
    </template>
  </AppPopover>
</template>
```

For feedback and status messages, use `AppBanner`:

```vue
<script setup lang="ts">
import { AppBanner } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const saveError = ref<string | null>(null)
</script>

<template>
  <AppBanner v-if="saveError" variant="error" inline>{{ saveError }}</AppBanner>
</template>
```

Available variants: `info`, `warning`, `success`, `error`. The `inline` prop
switches to a compact single-line layout suited for dialogs and form areas.

---

## Next steps

- **Publishing** → [guides/publishing.md](./publishing.md) — build for distribution
- **Module settings** → [guides/module-settings.md](./module-settings.md) — settingsSchema, useModuleContext, panels vs tabs
- **Full UIKit API** → [uikit/index.md](../uikit/index.md)
- **Custom UIKit components** → [uikit/custom-components.md](../uikit/custom-components.md) — building widgets beyond the bundled wrappers (tags input, number spinner, combobox)
- **Design tokens** → [reference/design-tokens.md](../reference/design-tokens.md) — host palette your styles inherit
- **All contribution slots** → [slots/index.md](../slots/index.md)
- **Escape-hatch primitives** → [uikit/primitives.md](../uikit/primitives.md)
- **Architecture deep-dive** → [module-architecture.md](../concepts/module-architecture.md)
