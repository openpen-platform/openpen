# Build Your First OpenPen Plugin

In this tutorial you'll scaffold a plugin, build it, install it into OpenPen,
and publish it to the community catalog — all using the `openpen` CLI.

## Prerequisites

- Node.js 20+, npm 9+
- OpenPen 1.0 or later installed and running
- A code editor with TypeScript support
- `gh` CLI installed and authenticated (`gh auth login`) — required for `openpen publish`

---

## 1. Scaffold the project

```bash
npx openpen-cli create @yourscope/my-highlighter
cd my-highlighter
npm install
```

Replace `yourscope` with your GitHub username or org name (lowercase).
`openpen create` copies the plugin-starter template, substitutes the id
placeholders, and prints next steps.

You'll get a folder like:

```
my-highlighter/
├── plugin.json         # manifest the host scans at load time
├── package.json        # devDeps: @openpen/build, @openpen/module-api
├── tsconfig.json
└── src/
    └── index.ts        # default-exports a defineModule({...}) call
```

> **`plugin.json` vs `package.json`**: `plugin.json` is what OpenPen reads at
> load time. `package.json` is only for the Node.js build toolchain.

---

## 2. Install for local development

Build the plugin and install it directly from the local source directory:

```bash
npm run build
npx openpen-cli plugin add .
```

`openpen plugin add <local-path>` copies `plugin.json`, `dist/`, and `locales/`
(when present) into `~/.openpen/plugins/@yourscope/my-highlighter/`. No build
step runs on your machine during install — the `dist/` you built is used as-is.

Restart OpenPen. Your plugin loads automatically and its contribution appears
in the control bar.

> **Note**: Plugin loading requires the production build of OpenPen,
> not the Vite dev server. Build the host with `npm run build` in the
> host repo if you have not already.

### Manual install (alternative)

If you prefer to skip the CLI:

```bash
npm run build
mkdir -p ~/.openpen/plugins/@yourscope/my-highlighter
cp -R plugin.json dist ~/.openpen/plugins/@yourscope/my-highlighter/
```

---

## 3. Anatomy of `src/index.ts`

Every plugin must default-export an `OpenPenModule` object. Use `defineModule()`
from `@openpen/module-api`:

```ts
import { defineModule } from '@openpen/module-api'
import HighlighterButton from './HighlighterButton.vue'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'

export default defineModule({
  id: '@yourscope/my-highlighter',
  version: '0.1.0',
  contributes: {
    controlBar: [
      {
        id: 'highlighter',
        component: HighlighterButton,
      },
    ],
    locales: { en, 'zh-Hant': zhHant },
  },
})
```

The display name and description shown in Settings → Modules come from two
**reserved keys** in `locales/en.json`:

```json
{
  "name": "Highlighter",
  "description": "Highlights text on screen."
}
```

### Key fields

| Field | Type | Notes |
|-------|------|-------|
| `id` | `string` | `@scope/name` format, lowercase. Must be globally unique in the catalog. |
| `version` | `string` | SemVer. Required for third-party plugins. |
| `minAppVersion` | `string` | Optional. OpenPen rejects the plugin if the running host is older. |
| `contributes` | `ModuleContributions` | At least one slot entry required. |
| `setup` | `(ctx) => void` | Optional one-shot init hook — runs once after manifest validation. |

### `contributes` — picking a slot

`contributes` is a typed map keyed by slot name. Mix and match what you need:

```ts
contributes: {
  controlBar: [...],        // buttons in the floating control bar
  tools: [...],             // drawing tool implementations
  settingsTabs: [...],      // a tab in Settings > (Your Plugin)
  shortcuts: [...],         // global keyboard shortcuts
  cursors: [...],           // custom cursor per tool
  // ...and more — see reference/slots.md
}
```

`defineModule()` provides full TypeScript inference over every slot and runs
id-format checks at build time, so errors surface in your repo before the host
ever sees the plugin.

---

## 4. Add a `setup` hook with `ctx.t()` and `ctx.notify()`

`locales/en.json` holds all translatable strings. The `name` and `description`
keys are reserved for the Modules manager UI; add your own runtime strings
alongside them:

```json
{
  "name": "Highlighter",
  "description": "Highlights text on screen.",
  "notif": { "ready": "Highlighter loaded" }
}
```

```ts
import { defineModule } from '@openpen/module-api'
import HighlighterButton from './HighlighterButton.vue'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'

export default defineModule({
  id: '@yourscope/my-highlighter',
  version: '0.1.0',
  contributes: {
    controlBar: [{ id: 'highlighter', component: HighlighterButton }],
    locales: { en, 'zh-Hant': zhHant },
  },

  setup(ctx) {
    ctx.notify({
      message: ctx.t('notif.ready'),
      variant: 'success',
      duration: 1500,
    })
    ctx.onDispose(() => {
      // cancel timers, remove listeners, etc.
    })
  },
})
```

### What `ctx` provides

| Method | Description |
|--------|-------------|
| `ctx.t(key, params?)` | Resolves an i18n key in this module's locale namespace. |
| `ctx.notify(payload)` | Shows a toast in the overlay window. Returns a `NotifyHandle`. |
| `ctx.getSettings<T>()` | Returns this module's settings. |
| `ctx.callMain(action, payload?)` | Invokes one of this module's main-process handlers. |
| `ctx.onDispose(fn)` | Registers a cleanup callback — called when the module is unloaded. |
| `ctx.moduleId` | This module's id string. |
| `ctx.locale` | Currently active locale, e.g. `'en'`. Read-only. |

---

## 4a. i18n in Vue components

`ctx.t()` works inside Vue component templates too — use `useModuleContext()` to
retrieve the context and call `ctx.t()` exactly as you would in `setup()`.

> **Important:** the argument passed to `useModuleContext()` MUST exactly match
> the `id` field in `plugin.json` (and in `defineModule({ id })`). A mismatch
> throws an `Error` at runtime with a message identifying the unregistered id.
> The recommended pattern is to define a `MODULE_ID` constant once (e.g. in
> `src/module-id.ts`) and import it everywhere instead of repeating the string.

```vue
<!-- HighlighterButton.vue -->
<script setup lang="ts">
import { useModuleContext } from '@openpen/module-api'

// Keys are automatically namespaced — no full path required.
const ctx = useModuleContext('@yourscope/my-highlighter')
</script>

<template>
  <button
    :aria-label="ctx.t('button.label')"
    :data-tip="ctx.t('button.label')"
    @click="activate"
  >
    <!-- icon SVG -->
  </button>
</template>
```

With `locales/en.json`:

```json
{
  "name": "Highlighter",
  "description": "Highlights text on screen.",
  "button": { "label": "Highlight" }
}
```

`ctx.t('button.label')` resolves `yourscope.my-highlighter.button.label`
in the global i18n store. Locale changes re-render the component reactively.

> **Do not** call `useI18n()` from `vue-i18n` directly and pass a partial path
> like `t('button.label')` — that resolves against the host locale store, not
> your plugin's namespace, and will silently return the key string instead of a
> translation. Always go through `useModuleContext().t()` from Vue components.

---

## 5. Development workflow

```bash
npm run dev      # watch mode — rebuilds dist/renderer.js on every save
```

To test the change in OpenPen, copy and restart:

```bash
npx openpen-cli plugin add .
# then restart OpenPen
```

There is no hot-reload bridge. The cycle is: edit → build → install → restart.

---

## 6. Pack for distribution

When your plugin is ready to share, create the distributable zip:

```bash
npm run build          # clean production build
npx openpen-cli pack       # creates: yourscope-my-highlighter-0.1.0.zip
                       # prints: sha256: <hex>
```

The zip contains only `plugin.json`, `dist/`, and `locales/` — no `src/`,
no `node_modules/`, no lifecycle scripts.

---

## 7. Publish to the catalog

### Step 1 — Create a GitHub Release

```bash
gh release create v0.1.0 ./yourscope-my-highlighter-0.1.0.zip
```

### Step 2 — Open a catalog PR

```bash
npx openpen-cli publish
```

`openpen publish` reads `plugin.json`, verifies the GitHub Release exists,
checks that your authenticated GitHub login matches the plugin scope, computes
the sha256, and opens a **Registration PR** in the `OpenPen-plugins` catalog repo.

**What happens next:**

- The catalog bot validates your PR automatically (scope, id format, sha256, release URL).
- A maintainer reviews the Registration PR — first-time submissions need human approval.
- After merge, `plugins.json` is regenerated by CI, making your plugin discoverable
  in the OpenPen marketplace.

### Updating your plugin

For subsequent releases the flow is the same, but step 2 opens an **Update PR**
instead of a Registration PR. Update PRs are auto-merged by the bot after
validation passes — no human review needed.

```bash
# bump version in plugin.json, then:
npm run build
npx openpen-cli pack
gh release create v0.2.0 ./yourscope-my-highlighter-0.2.0.zip
npx openpen-cli publish
```

---

## Where to go next

- [Module Architecture](../concepts/module-architecture.md) — the four-layer
  design and how plugins fit in
- [Trust Model](../concepts/trust-model.md) — what plugins can and can't do
- [Slot Reference](../reference/slots.md) — all contribution slots
- [UIKit Reference](../reference/uikit.md) — pre-built UI components
- [Notify API](../reference/notify-api.md) — toast notifications and i18n
