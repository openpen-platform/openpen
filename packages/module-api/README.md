# @openpen/module-api

The public contract surface for **OpenPen modules** — both first-party (`src/core/modules/*`) and third-party plugins (`~/.openpen/plugins/*`).

This is the **only** import path that built-in modules and plugins are allowed to use (apart from relative imports, `node:*`, and third-party npm packages). The boundary is enforced by `tests/unit/boundaries/*` in the OpenPen main repo.

## Install

```bash
npm install @openpen/module-api zod
```

> **Import `z` from `@openpen/module-api`, not from `'zod'` directly.**
> The build externalises `'zod'` — a direct `import { z } from 'zod'` in a
> plugin file will fail at build time with an unresolved-import error. Use
> `import { z } from '@openpen/module-api'` everywhere in your plugin.

## Quick start

```typescript
import { defineModule, z } from '@openpen/module-api'

export default defineModule({
  id: 'my-module',
  name: { en: 'My Module', 'zh-TW': '我的模組' },
  settingsSchema: z.object({
    enabled: z.boolean().default(true),
  }),
  contributes: {
    tools: [
      {
        id: 'my-tool',
        // ...
      },
    ],
  },
})
```

### `setup(ctx)` — Module initialisation

`defineModule` supports an optional `setup(ctx: ModuleSetupContext)` hook, called once when the module loads. `ctx` provides:

| Method | Description |
|--------|-------------|
| `ctx.getSettings<T>()` | Read this module's parsed settings (requires `settingsSchema` to be declared) |
| `ctx.callMain(action, payload?)` | Call this module's main-side handler |
| `ctx.onDispose(fn)` | Register a cleanup callback (called in reverse order when the module is unloaded) |
| `ctx.notify(payload)` | Show a short-lived toast in the overlay window; returns `NotifyHandle` for early `dismiss()` |

```typescript
import { defineModule } from '@openpen/module-api'
import type { NotifyPayload } from '@openpen/module-api'

export default defineModule({
  id: 'my-module',
  name: { en: 'My Module' },
  contributes: { /* ... */ },

  setup(ctx) {
    // Show a toast when the module finishes loading.
    ctx.notify({
      message: { en: 'My Module ready' },
      variant: 'success',
      duration: 1500,
    })

    // Release resources (timers, listeners, etc.) on unload.
    const timer = setInterval(() => { /* ... */ }, 5000)
    ctx.onDispose(() => clearInterval(timer))
  },
})
```

See [docs/reference/notify-api.md](../../docs/reference/notify-api.md).

See the OpenPen [docs](https://github.com/openpen/openpen/blob/main/docs/README.md) for guides, slot catalogue, and UIKit reference.

## Long-term stability of the UIKit

The UIKit (`@openpen/module-api/uikit`) wraps a headless behaviour library
internally. That library is an implementation detail — it is not part of the
public API surface.

If the underlying library is ever replaced, the host will follow a documented
fallback order: Headless UI Vue → Ark UI → self-written primitives. The wrapper
props, events, and slots documented here will remain stable across any such
swap. Plugin authors who import only from `@openpen/module-api/uikit` will be
unaffected. Authors who drop to the primitive layer (named primitive exports)
will see a major-version bump and a small targeted port. Authors who bypass the
UIKit entirely and import a headless library directly in their plugin's
`package.json` are responsible for porting that surface themselves.

This guarantee is why the wrapper layer is the recommended starting point for
all plugin UI.

## License

MIT
