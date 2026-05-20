# OpenPen Module Architecture

## TL;DR

OpenPen uses a **host + contribution-slots architecture** (described below) and a **shared-renderer trust model** in which plugins run alongside the host and users install at their own discretion (see [`guides/publishing.md`](../guides/publishing.md#trust-model--responsibility)). The two layers are decoupled: the slot system and the trust model evolve independently.

The core only contains framework infrastructure — it has no knowledge of what tools, shapes, or settings panels exist. All concrete features, both the built-in set and third-party plugins, implement the same `OpenPenModule` interface and contribute to the host through declared **slots**. Adding a new feature never requires editing the host; built-in modules are removable, and plugin authors have the same capabilities as built-in modules.

## Three layers

```
┌────────────────────────────────────────────────────────────────┐
│ LAYER 1 — CORE (knows nothing about features)                  │
│   canvas-engine, stroke-store, module-loader, slot-registry,   │
│   settings-store, window-manager, ipc-bridge, i18n-resolver,   │
│   module-runtime, slot-runtime                                 │
└────────────────────────────────────────────────────────────────┘
                            │ same interface
            ┌───────────────┴───────────────┐
            │                               │
┌──────────────────────────┐    ┌──────────────────────────┐
│ LAYER 2 — BUILT-IN       │    │ LAYER 3 — PLUGINS        │
│   modules shipped        │    │ ~/.openpen/plugins/      │
│   with the host          │    │   third-party, runtime   │
│                          │    │   loaded                 │
└──────────────────────────┘    └──────────────────────────┘
```

The only structural difference between **built-in** and **plugin** modules is _location_ (in-repo vs `~/.openpen/plugins/`) and _governance_ (released with the host vs installed by users). Their interface (`OpenPenModule`), loader, validator, and runtime are identical.

## OpenPenModule interface

Every module exports a single object satisfying `OpenPenModule`:

```ts
interface OpenPenModule {
  id: string                                  // globally unique, @scope/name format
  version?: string
  minAppVersion?: string
  metadata?: {
    name: LocaleMap                           // e.g. { en: 'My Plugin', 'zh-Hant': '我的插件' }
    description?: LocaleMap
  }
  setup?(ctx: ModuleSetupContext): void | Promise<void>
  contributes?: ModuleContributions           // at least one field required
  settingsSchema?: z.ZodType                  // user-facing prefs
}
```

The display name and description shown in Settings → Modules come from two
**reserved keys** in your locale dictionaries, registered via `contributes.locales`:

```ts
contributes: {
  locales: {
    en: { name: 'My Plugin', description: 'What it does.' },
    'zh-Hant': { name: '我的插件', description: '功能說明。' },
  },
}
```

The host reads `name` and `description` from the active locale when rendering
Settings → Modules. Any other keys are available to your module via `ctx.t()` in
`setup()` and `useModuleContext().t()` in Vue components.

> **`metadata` as a fallback**: the top-level `metadata` field (`metadata.name`,
> `metadata.description`) is an i18n-independent fallback consulted when the
> module is disabled and its `contributes.locales` entries are not wired into
> the host. The locale-based approach above is the primary source and should be
> the one you populate.

Use `defineModule()` from `@openpen/module-api` to declare your module — it provides full type inference and validates your contribution object before the host ever sees it.

## Contribution slots

A **slot** is a typed extension point on the host. Modules opt in by adding a field to `contributes`:

```ts
export default defineModule({
  id: 'stroke-width',
  settingsSchema: z.object({
    defaultWidth: z.number().min(1).max(20).default(4),
    style: z.enum(['slider', 'popup']).default('slider'),
  }),
  contributes: {
    strokeStyle: { provides: ['lineWidth'] },
    controlBar: [{
      id: 'stroke-width-slider',
      component: StrokeWidthSlider,
    }],
    settingsPanels: [{
      id: 'stroke-width-settings',
      label: { en: 'Stroke Width', 'zh-Hant': '筆觸寬度' },
      component: StrokeWidthSettingsPanel,
    }],
  },
})
```

The full slot catalogue lives in [`slots/index.md`](../slots/index.md).

### Slot statuses

- **`available`** — wired through to a runtime adapter; usable today.
- **`reserved`** — the type and registration are accepted, but no adapter exists yet. You can ship contributions to a reserved slot now; they start working when the adapter lands, with no changes required on your side.

## What `@openpen/module-api` exposes

`@openpen/module-api` is the only path that modules and plugins are allowed to import from the host. It exports:

- `defineModule()` helper
- `useModuleContext(moduleId)` — `getSettings()`, `updateSettings()`, `onSettingsChange()` for reading and writing persisted module preferences (see [guides/module-settings.md](../guides/module-settings.md))
- `MODULE_ID_RE` / `isValidModuleId()` — id format validation
- `resolveLabel()` — `LocaleMap` → string with BCP-47 fallback
- All slot definitions (`ALL_SLOTS`, `V1_ACTIVE_SLOTS`, `V1_RESERVED_SLOTS`, `getSlot()`, `isKnownSlot()`)
- All TypeScript types (`OpenPenModule`, `ModuleContributions`, every `*Contribution` shape)
- `z` — re-export of zod for `settingsSchema`

Plugins MUST only import from `@openpen/module-api`; the host validates this at the module boundary and rejects any imports from host-internal paths.

## When your plugin loads

1. **Renderer startup** imports built-in modules statically from src/core/modules/ and fetches third-party plugin manifests from ~/.openpen/plugins/ via IPC.
2. **Validation** runs preflight checks: id format, id collisions across built-in and plugin modules, slot key existence, settings schema parse, and minAppVersion compatibility. All errors are collected and reported together.
3. **Setup** calls each module's setup(ctx) once per renderer window (overlay, settings, and main each run their own runtime), in registration order.
4. **Slot wiring** connects each module's contributes to the relevant adapter. Vue components contributed to controlBar, settingsTabs, htmlOverlays, and other active slots are rendered into their containers.

## See also

- [`slots/index.md`](../slots/index.md) — every slot, its status, and contribution shape.
- [`guides/module-settings.md`](../guides/module-settings.md) — settingsSchema, `useModuleContext`, `settingsPanels` vs `settingsTabs`.
- [`uikit/index.md`](../uikit/index.md) — UIKit wrappers for plugin authors.
- [`uikit/primitives.md`](../uikit/primitives.md) — primitives, design tokens, and escape-hatch guidance.
- [`guides/plugin-quickstart.md`](../guides/plugin-quickstart.md) — from zero to a running plugin.
- [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — contributing to OpenPen core.
- `@openpen/module-api` on npm — TypeScript types and full API surface.
