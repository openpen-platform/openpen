# Module Settings

Modules can persist user preferences via a **settings schema** and the `useModuleContext()` composable. Settings are stored under `config.json → modules[moduleId]` and survive app restarts.

---

## Defining a settings schema

Declare a Zod schema on your module definition using the `z` re-export from `@openpen/module-api`:

```ts
import { defineModule, z } from '@openpen/module-api'

export default defineModule({
  id: 'my-plugin',
  settingsSchema: z.object({
    opacity: z.number().min(0).max(1).default(0.8),
    mode: z.enum(['solid', 'gradient']).default('solid'),
  }),
  contributes: { /* ... */ },
})
```

- `settingsSchema` is **required** for any module that calls `updateSettings()`. Calling `updateSettings()` without a schema throws synchronously with `ctx.updateSettings() requires a settingsSchema on the module definition for "<id>"`. Read-only modules that only call `getSettings()` may omit `settingsSchema` — they will receive `{}` until a schema is declared.
- Default values declared with `.default()` are merged with the stored values on every `getSettings()` read — you never receive `undefined` for a key that has a default.
- Use the `z` re-export; do not add Zod as a separate dependency.

---

## Reading and writing settings from a Vue component

Import `useModuleContext` from `@openpen/module-api`:

```ts
import { useModuleContext } from '@openpen/module-api'
```

`useModuleContext(moduleId)` returns a context object with three settings methods:

| Method | What it does |
|--------|-------------|
| `getSettings<T>()` | Returns current settings merged with schema defaults. |
| `updateSettings<T>(patch)` | Persists a partial patch. Returns a `Promise`. |
| `onSettingsChange<T>(cb)` | Subscribes to settings changes; returns an unsubscribe function. |

### Example: a settings panel component

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useModuleContext } from '@openpen/module-api'
import { AppSlider, AppSegmented } from '@openpen/module-api/uikit'

type Settings = { opacity: number; mode: 'solid' | 'gradient' }

const opacity = ref(0.8)
const mode = ref<'solid' | 'gradient'>('solid')
let unsub: (() => void) | null = null

onMounted(() => {
  const ctx = useModuleContext('my-plugin')
  const s = ctx.getSettings<Settings>()
  opacity.value = s.opacity
  mode.value = s.mode
  unsub = ctx.onSettingsChange<Settings>((next) => {
    if (next.opacity != null) opacity.value = next.opacity
    if (next.mode) mode.value = next.mode
  })
})

onUnmounted(() => { unsub?.() })

async function setOpacity(v: number) {
  const ctx = useModuleContext('my-plugin')
  opacity.value = v
  await ctx.updateSettings<Settings>({ opacity: v })
}

async function setMode(v: string) {
  const ctx = useModuleContext('my-plugin')
  mode.value = v as Settings['mode']
  await ctx.updateSettings<Settings>({ mode: v as Settings['mode'] })
}
</script>

<template>
  <div>
    <AppSlider :model-value="opacity" :min="0" :max="1" :step="0.05"
               @update:model-value="setOpacity($event)" />
    <AppSegmented
      :model-value="mode"
      :options="[{ value: 'solid', label: 'Solid' }, { value: 'gradient', label: 'Gradient' }]"
      @update:model-value="setMode($event)" />
  </div>
</template>
```

**Call `useModuleContext` inside `onMounted`, not at the top of `<script setup>`.** Module contexts are registered after Vue component trees mount; calling at setup-evaluation time risks a "not registered" error.

---

## Showing preferences in the host UI

The host provides two slots for module preferences. Choose based on complexity:

| | `settingsPanels` → `ui.settings.panels` | `settingsTabs` → `ui.settings.tabs` |
|---|---|---|
| **Where it appears** | A titled section inside **Settings → Features**, grouped with other modules | A dedicated top-level tab in Settings |
| **Recommended for** | Most modules — a few preference rows | Modules with deep configuration (many sections, nested layout, preview areas) |
| **User discoverability** | High — all module preferences in one place | Lower — users must find the specific tab |
| **Visibility when disabled** | Disappears automatically | Disappears automatically |

When in doubt, start with `settingsPanels`. You can add a dedicated tab later without changing user data.

### Using `settingsPanels`

```ts
import { defineModule, z } from '@openpen/module-api'
import MySettingsPanel from './MySettingsPanel.vue'

export default defineModule({
  id: 'my-plugin',
  settingsSchema: z.object({
    opacity: z.number().default(0.8),
  }),
  contributes: {
    settingsPanels: [{
      id: 'my-plugin-settings',
      label: { en: 'My Plugin', 'zh-Hant': '我的插件' },
      component: MySettingsPanel,
    }],
  },
})
```

The host renders the component as a titled card section under Settings → Features. The section disappears automatically when the module is disabled or removed.

### Using `settingsTabs`

```ts
import { defineModule } from '@openpen/module-api'
import MyFullSettingsTab from './MyFullSettingsTab.vue'

export default defineModule({
  id: 'my-plugin',
  contributes: {
    settingsTabs: [{
      id: 'my-plugin',
      label: { en: 'My Plugin' },
      component: MyFullSettingsTab,
    }],
  },
})
```

Use this for modules that need rich layout (multiple sub-sections, code editors, image pickers, etc.).

---

## Accessing settings in `setup()`

`ModuleSetupContext` (the `ctx` argument in `setup()`) exposes the same three methods. Use them to initialise module state before the UI renders:

```ts
export default defineModule({
  id: 'my-plugin',
  settingsSchema: z.object({ opacity: z.number().default(0.8) }),
  setup(ctx) {
    const { opacity } = ctx.getSettings<{ opacity: number }>()
    applyOpacity(opacity)

    ctx.onSettingsChange<{ opacity: number }>(({ opacity }) => {
      if (opacity != null) applyOpacity(opacity)
    })
  },
  contributes: { /* ... */ },
})
```

`onSettingsChange` subscriptions registered inside `setup()` are automatically cleaned up via `ctx.onDispose` when the module is unloaded.

---

## See also

- [`reference/slots.md`](../reference/slots.md) — `ui.settings.panels`, `ui.settings.tabs`, and `system.shortcuts` slot details.
- [`reference/uikit.md`](../reference/uikit.md) — `AppSlider`, `AppSegmented`, `AppToggle`, and other UIKit components for building preference rows.
