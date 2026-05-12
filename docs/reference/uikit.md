# OpenPen UIKit Reference

> For widgets not listed below (tags input, number spinner, combobox), see
> [custom-uikit-components.md](../guides/custom-uikit-components.md).

OpenPen UIKit wrappers handle inject keys, mutual exclusion, animation guard, and
mouse-passthrough automatically. Plugin authors MUST start here; no knowledge of
the underlying headless library is required.

Import path:

```ts
import {
  AppButton,
  AppPopover, AppDialog,
  AppSlider, AppToggle, AppSegmented,
  AppSelect, AppTooltip, AppTabs,
  AppBanner,
  useDialog, useDialogPluginComponent,
} from '@openpen/module-api/uikit'
import type { BannerVariant } from '@openpen/module-api/uikit'
```

---

## Three layers — pick the right level for the job

UIKit exposes three escalating levels of API access. Choosing the right one up
front saves you from rewrites later.

| Layer | Import path | DX cost | Visual consistency | Bundle impact | Freedom |
|---|---|---|---|---|---|
| **Wrapper** | `@openpen/module-api/uikit` | Low | Automatic — tokens applied for you | Smallest | Low |
| **Primitive re-export** | `@openpen/module-api/uikit` (named exports) | Medium | Token-driven — you write the CSS | Medium | High |
| **Escape hatch** | Your own `reka-ui` (or any library) install | Self-managed | Self-managed | Largest | Unlimited |

### Decision rule

**Wrapper** — use this for the vast majority of components. You get popovers,
dialogs, sliders, toggles, and more with zero boilerplate: inject keys, mutual
exclusion, ControlBar animation guard, and mouse-passthrough are all handled
internally.

**Primitive re-export** — use this when you need full control over markup and
styling but want to keep the accessibility and keyboard-navigation behaviour that
comes with the headless primitives (focus trapping, ARIA attributes, keyboard
close, etc.). You write your own CSS; you manage mutual exclusion and
passthrough yourself (see `docs/reference/primitives.md`).

**Escape hatch** — use this for genuinely novel UI patterns that have no
equivalent in the wrapper or primitive layers (for example, a graph editor or a
3D viewport). You are free to install any library in your plugin's own
`package.json`. The trade-off is that you now own visual consistency,
accessibility, and long-term maintenance of that surface. In particular, if the
host swaps its underlying headless library (see "If we ever swap the underlying
headless library" below), any direct import you took will need a manual port by
you — the host's wrapper API will stay stable, but third-party imports you
bundled yourself will not.

> If you are unsure which layer to use, start with the Wrapper. You can always
> drop to a lower layer later; going the other way is harder.

---

## `AppPopover`

Click-to-open popover anchored to a trigger element. Handles outside-click close,
mutual exclusion with other popovers, and ControlBar animation guard.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `popover-id` | `string` | — (**required**) | Globally unique id; used for mutual exclusion |
| `placement` | `'auto' \| 'top' \| 'bottom' \| 'left' \| 'right'` | `'auto'` | Preferred placement direction |
| `gap` | `number` | `8` | Distance between trigger and content in px |

### Slots

| Slot | Scope | Description |
|---|---|---|
| `trigger` | `{ active: boolean, toggle: () => void, open: () => void, close: () => void }` | The element that opens the popover |
| `content` | — | Content rendered inside the popover panel |

> **MUST NOT** add `@click="toggle"` to the trigger button. `PopoverTrigger` handles
> the click internally; calling `toggle` manually causes a double-toggle race.
> The `toggle`/`open`/`close` scope functions are provided for **programmatic control**
> only (e.g., opening this popover from another button).

### Minimal example

```vue
<script setup lang="ts">
import { AppPopover } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const value = ref(50)
</script>

<template>
  <AppPopover popover-id="my-slider" placement="auto">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">Slider</button>
    </template>
    <template #content>
      <input v-model.number="value" type="range" min="0" max="100" />
    </template>
  </AppPopover>
</template>
```

---

## `AppSlider`

Numeric range slider that matches OpenPen's visual style. Supports horizontal and
vertical orientations.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `number` | — (**required**) | Current value (use `v-model`) |
| `min` | `number` | `0` | Minimum value |
| `max` | `number` | `100` | Maximum value |
| `step` | `number` | `1` | Step increment |
| `width` | `string` | `'100%'` | Container width (or height in vertical mode) |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Slider orientation |
| `track-height` | `string` | `'4px'` | Track thickness |
| `track-radius` | `string` | `'2px'` | Track border-radius |
| `thumb-width` | `string` | `'14px'` | Thumb width |
| `thumb-height` | `string` | `'14px'` | Thumb height |
| `thumb-radius` | `string` | `'50%'` | Thumb border-radius |

### Events

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `number` | Emitted on every drag step |

### Minimal example

```vue
<script setup lang="ts">
import { AppSlider } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const size = ref(16)
</script>

<template>
  <AppSlider v-model="size" :min="8" :max="64" width="120px" />
</template>
```

---

## `AppToggle`

Boolean on/off switch.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `boolean` | — (**required**) | Current state (use `v-model`) |
| `aria-label` | `string` | `''` | Accessible label |

### Events

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `boolean` | Emitted on toggle |

### Minimal example

```vue
<script setup lang="ts">
import { AppToggle } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const enabled = ref(false)
</script>

<template>
  <AppToggle v-model="enabled" aria-label="Enable feature" />
</template>
```

---

## `AppSegmented`

Single-select segmented control (radio group).

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `string` | — (**required**) | Currently selected value (use `v-model`) |
| `options` | `Array<{ value: string; label: string; icon?: string }>` | — (**required**) | Available options |
| `disabled` | `boolean` | `false` | Disables all interaction and applies muted styling |

### Events

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `string` | Emitted when selection changes |

### Minimal example

```vue
<script setup lang="ts">
import { AppSegmented } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const mode = ref('solid')
const options = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
]
</script>

<template>
  <AppSegmented v-model="mode" :options="options" />
</template>
```

---

## `AppDialog`

Centred dialog with backdrop, ESC-to-close, and focus trap. Integrates with the
host modal manager so opening one dialog closes any other open dialog/popover.
Use `v-model:open` for two-way binding.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `modal-id` | `string` | — (**required**) | Globally unique id; used for modal-stack mutual exclusion |
| `title` | `string` | — (**required**) | Dialog header title |
| `open` | `boolean` | — (**required**) | Controlled open state; pair with `@update:open` or `v-model:open` |
| `persistent` | `boolean` | `false` | When `true`, ESC and backdrop clicks do not close the dialog |
| `danger` | `boolean` | `false` | Adds the `openpen-modal-danger` CSS class — a hook for destructive-action styling |

### Slots

| Slot | Scope | Description |
|---|---|---|
| `trigger` | `{ active: boolean, toggle: () => void, open: () => void, close: () => void }` | Element that opens the dialog |
| `default` | — | Dialog body content |
| `footer` | — | Optional footer area (action buttons etc.) |

### Events

| Event | Payload | Description |
|---|---|---|
| `update:open` | `boolean` | Emitted when the dialog requests an open-state change; required for `v-model:open` |

> **MUST NOT** add `@click="toggle"` to the trigger — `DialogTrigger` handles
> activation automatically. The scope functions are escape hatches for
> programmatic control only.

### Minimal example

```vue
<script setup lang="ts">
import { AppDialog } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const open = ref(false)
</script>

<template>
  <AppDialog modal-id="confirm-clear" title="Clear canvas?" v-model:open="open">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">Clear…</button>
    </template>
    Are you sure? This cannot be undone.
    <template #footer>
      <button @click="open = false">Cancel</button>
      <button class="primary" @click="open = false">Clear</button>
    </template>
  </AppDialog>
</template>
```

### Persistent + danger example (destructive confirmation)

```vue
<script setup lang="ts">
import { AppDialog } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const open = ref(false)

function confirmDelete() {
  // perform destructive action
  open.value = false
}
</script>

<template>
  <AppDialog
    modal-id="delete-layer"
    title="Delete layer?"
    v-model:open="open"
    :persistent="true"
    :danger="true"
  >
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">Delete…</button>
    </template>
    This layer and all its strokes will be permanently removed.
    <template #footer>
      <button @click="open = false">Cancel</button>
      <button class="danger" @click="confirmDelete">Delete</button>
    </template>
  </AppDialog>
</template>
```

---

## `useDialog` (imperative API)

`useDialog()` provides a Promise-based alternative to `<AppDialog>` for
cases where the dialog is triggered from logic rather than a template button —
e.g., confirmation before a destructive IPC call, or a prompt mid-workflow.
The underlying renderer is a private `<DialogHost />` mounted by the host; plugin
authors never interact with it directly.

### API summary

| Method | Signature | Resolves with |
|---|---|---|
| `.confirm()` | `(opts: DialogConfirmOptions) => Promise<boolean>` | `true` on OK; `false` on Cancel or dismiss |
| `.alert()` | `(opts: DialogAlertOptions) => Promise<void>` | resolves on dismiss (OK button or ESC) |
| `.prompt()` | `(opts: DialogPromptOptions) => Promise<string \| null>` | input value string on OK; `null` on Cancel or dismiss |
| `.custom<T>()` | `(opts: DialogCustomOptions<T>) => Promise<T \| null>` | payload passed to `ok(payload)`; `null` on cancel or dismiss |

### Options reference

All methods accept a **common base** plus method-specific fields:

**Common base** (`title`, shared across all methods):

| Option | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | yes | Dialog header title |
| `persistent` | `boolean` | no | Suppress ESC / backdrop close |
| `danger` | `boolean` | no | Apply danger styling |

**`confirm`-specific:**

| Option | Type | Default | Description |
|---|---|---|---|
| `message` | `string` | — (**required**) | Body text |
| `okLabel` | `string` | `'OK'` | Label for the confirm button |
| `cancelLabel` | `string` | `'Cancel'` | Label for the cancel button |

**`alert`-specific:**

| Option | Type | Default | Description |
|---|---|---|---|
| `message` | `string` | — (**required**) | Body text |
| `okLabel` | `string` | `'OK'` | Label for the dismiss button |

**`prompt`-specific:**

| Option | Type | Default | Description |
|---|---|---|---|
| `message` | `string` | — (**required**) | Body text above the input |
| `defaultValue` | `string` | `''` | Pre-filled input value |
| `placeholder` | `string` | — | Input placeholder text |
| `okLabel` | `string` | `'OK'` | Label for the submit button |
| `cancelLabel` | `string` | `'Cancel'` | Label for the cancel button |

**`custom`-specific:**

| Option | Type | Default | Description |
|---|---|---|---|
| `component` | `Component` | — (**required**) | Vue component to render as dialog body |
| `componentProps` | `Record<string, unknown>` | `{}` | Props forwarded to the custom component |

### Working examples

**confirm:**

```ts
import { useDialog } from '@openpen/module-api/uikit'

const dialog = useDialog()

async function clearCanvas() {
  const confirmed = await dialog.confirm({
    title: 'Clear canvas?',
    message: 'All strokes will be permanently removed.',
    okLabel: 'Clear',
    danger: true,
  })
  if (confirmed) {
    // proceed
  }
}
```

**alert:**

```ts
const dialog = useDialog()

await dialog.alert({
  title: 'Save failed',
  message: 'Could not write to disk. Check permissions.',
})
```

**prompt:**

```ts
const dialog = useDialog()

const name = await dialog.prompt({
  title: 'Rename layer',
  message: 'Enter a new name for this layer:',
  defaultValue: 'Layer 1',
  placeholder: 'Layer name',
})
if (name !== null) {
  // user confirmed; name is the entered string
}
```

**custom** — using `useDialogPluginComponent()`:

The custom component calls `useDialogPluginComponent<T>()` to get `ok` / `cancel` / `dismiss` handles that resolve the Promise:

```vue
<!-- MyCustomDialog.vue -->
<script setup lang="ts">
import { useDialogPluginComponent } from '@openpen/module-api/uikit'

const { ok, cancel } = useDialogPluginComponent<{ choice: 'a' | 'b' }>()
</script>

<template>
  <button @click="ok({ choice: 'a' })">Pick A</button>
  <button @click="ok({ choice: 'b' })">Pick B</button>
  <button @click="cancel()">Cancel</button>
</template>
```

Call site:

```ts
import { useDialog } from '@openpen/module-api/uikit'
import MyCustomDialog from './MyCustomDialog.vue'

const dialog = useDialog()

const result = await dialog.custom<{ choice: 'a' | 'b' }>({
  title: 'Pick one',
  component: MyCustomDialog,
})
// result is { choice: 'a' } | { choice: 'b' } | null
```

### When to use which?

| Use case | Recommended |
|---|---|
| Dialog opened by a toolbar button with a visible trigger | `<AppDialog>` |
| Dialog opened from async logic / IPC callback | `useDialog()` |
| Simple yes/no confirmation before a destructive action | `useDialog().confirm()` |
| Single-line text input mid-workflow | `useDialog().prompt()` |
| Informational message / error notification | `useDialog().alert()` |
| Fully custom layout with bespoke interaction | `useDialog().custom()` + `useDialogPluginComponent()` |
| Dialog content needs access to parent component state via props/slots | `<AppDialog>` |

### Constraints

> - **Promise-based only** — there is no chainable `.onOk()` / `.onCancel()` API.
> - **Queued, not concurrent** — at most one imperative dialog is open at a time.
>   Additional calls while a dialog is open are queued and executed sequentially
>   after the current dialog resolves.
> - **`useDialogPluginComponent()` call site** — MUST be called inside a component
>   that is rendered by `useDialog().custom()`. Calling it elsewhere throws at runtime.

---

## `AppSelect`

Single-select dropdown that matches OpenPen's popup styling.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `string` | — (**required**) | Currently selected value (use `v-model`) |
| `options` | `Array<{ value: string; label: string }>` | — (**required**) | Selectable options |
| `placeholder` | `string` | — (**required**) | Shown when no option is selected |
| `disabled` | `boolean` | `false` | Disable interaction |

### Events

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `string` | Emitted when selection changes |

### Minimal example

```vue
<script setup lang="ts">
import { AppSelect } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const lang = ref('en')
const options = [
  { value: 'en', label: 'English' },
  { value: 'zh-Hant', label: '繁體中文' },
]
</script>

<template>
  <AppSelect v-model="lang" :options="options" placeholder="Pick a language" />
</template>
```

---

## `AppTooltip`

Hover-triggered tooltip with configurable side and delay.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `content` | `string` | — (**required**) | Tooltip text |
| `side` | `'top' \| 'bottom' \| 'left' \| 'right'` | `'top'` | Preferred placement |
| `delay` | `number` | `200` | Hover-open delay in ms |

### Slots

| Slot | Description |
|---|---|
| `default` | The trigger element (any element receiving hover) |

### Minimal example

```vue
<script setup lang="ts">
import { AppTooltip } from '@openpen/module-api/uikit'
</script>

<template>
  <AppTooltip content="Undo last stroke" side="bottom">
    <button class="cb-btn" aria-label="Undo">↶</button>
  </AppTooltip>
</template>
```

---

### Combining `AppTooltip` with `AppPopover`

`AppTooltip` (hover) and `AppPopover` (click) MUST be composed with
`AppTooltip` **inside** the `#trigger` slot of `AppPopover`. This is the
only safe nesting order.

#### Why this is safe

- `AppPopover` opens on **click**; `AppTooltip` opens on **hover**. The two
  triggers are mutually exclusive — they cannot fire simultaneously.
- Both components are self-contained portals that teleport their floating panels
  to `<body>`. `AppPopover` uses `MODAL_MANAGER_KEY` for mutual exclusion;
  `AppTooltip` wraps `TooltipProvider` directly and uses no shared inject key.
  Nesting one inside the other causes no key collision.
- `z-index` layering is controlled per-portal by the wrapper component; the two
  portals do not interfere.

#### Working example

```vue
<script setup lang="ts">
import { AppPopover, AppTooltip } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const opacity = ref(80)
</script>

<template>
  <AppPopover popover-id="opacity-slider" placement="auto">
    <template #trigger="{ active }">
      <!-- AppTooltip wraps the button INSIDE the trigger slot so the
           slot-scope `active` prop remains accessible. -->
      <AppTooltip content="Adjust opacity" side="bottom">
        <button class="cb-btn" :class="{ active }" aria-label="Opacity">
          ◑
        </button>
      </AppTooltip>
    </template>
    <template #content>
      <label>
        Opacity
        <input v-model.number="opacity" type="range" min="0" max="100" />
      </label>
    </template>
  </AppPopover>
</template>
```

> **Note**: the tooltip disappears automatically when the user clicks (the
> browser fires `mouseleave` on click-away), so there is no visual conflict
> between the open popover panel and the tooltip.

#### What NOT to do

```vue
<!-- ❌ AppTooltip outside #trigger — loses access to `active` slot scope -->
<AppTooltip content="Adjust opacity" side="bottom">
  <AppPopover popover-id="opacity-slider">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">◑</button>
    </template>
  </AppPopover>
</AppTooltip>
```

---

## `AppTabs`

Controlled tabbed-content container.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `string` | — (**required**) | Active tab id (use `v-model`) |
| `tabs` | `Array<{ id: string; label: string }>` | — (**required**) | Ordered tab descriptors |

### Events

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `string` | Emitted when active tab changes |

### Slots

| Slot | Scope | Description |
|---|---|---|
| `default` | `{ activeTabId: string }` | Tab content area; switch on the active id |

### Minimal example

```vue
<script setup lang="ts">
import { AppTabs } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const tab = ref('general')
const tabs = [
  { id: 'general', label: 'General' },
  { id: 'shortcuts', label: 'Shortcuts' },
]
</script>

<template>
  <AppTabs v-model="tab" :tabs="tabs">
    <template #default="{ activeTabId }">
      <div v-if="activeTabId === 'general'">General settings…</div>
      <div v-else-if="activeTabId === 'shortcuts'">Shortcut settings…</div>
    </template>
  </AppTabs>
</template>
```

---

## `AppBanner`

Inline status banner for feedback messages: informational notices, warnings,
success confirmations, and errors. No headless dependency — pure CSS tokens.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `'info' \| 'warning' \| 'success' \| 'error'` | — (**required**) | Visual and semantic intent |
| `inline` | `boolean` | `false` | Compact single-line layout for tight contexts (dialogs, form fields) |

### Slots

| Slot | Description |
|---|---|
| `default` | Banner message text |
| `actions` | Optional row of action buttons rendered at the trailing end |

### Accessibility

`variant="error"` renders with `role="alert"` (assertive — announced immediately by screen readers).
All other variants use `role="status"` (polite — announced at the next opportunity).

### Standard example

```vue
<script setup lang="ts">
import { AppBanner } from '@openpen/module-api/uikit'
</script>

<template>
  <!-- Informational -->
  <AppBanner variant="info">Sync completes in the background.</AppBanner>

  <!-- Warning with dismiss action -->
  <AppBanner variant="warning">
    Restart required to apply changes.
    <template #actions>
      <button @click="restart">Restart now</button>
    </template>
  </AppBanner>

  <!-- Success -->
  <AppBanner variant="success">Plugin installed successfully.</AppBanner>

  <!-- Error -->
  <AppBanner variant="error">Installation failed — check permissions.</AppBanner>
</template>
```

### Inline example (dialog or settings row)

```vue
<script setup lang="ts">
import { AppBanner } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const error = ref<string | null>(null)
</script>

<template>
  <AppBanner v-if="error" variant="error" inline>{{ error }}</AppBanner>
</template>
```

### Dynamic variant

```vue
<script setup lang="ts">
import { AppBanner } from '@openpen/module-api/uikit'
import type { BannerVariant } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const variant = ref<BannerVariant>('info')
const message = ref('Ready.')
</script>

<template>
  <AppBanner :variant="variant">{{ message }}</AppBanner>
</template>
```

---

## `AppButton`

Standard 36×36 control-bar button that matches the host's visual design: rounded
corners, hover background, active-state accent highlight, and an inline tooltip.
Prefer this wrapper over a plain `<button>` when adding a button to the control
bar — it removes the need to replicate exact sizing, colours, and tooltip
behaviour manually.

### Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `'default' \| 'danger'` | `'default'` | Visual intent; `'danger'` colours the button red for destructive actions |
| `active` | `boolean` | `false` | Highlights the button with the accent colour (use for active-tool state) |
| `disabled` | `boolean` | `false` | Dims the button content; keeps pointer events alive so the tooltip still fires |
| `tooltip` | `string` | — | Short label shown above the button on hover |
| `aria-label` | `string` | — | Accessible name for screen readers |

### Slots

| Slot | Description |
|---|---|
| `default` | Button content (icon SVG, text, or any inline element) |

### Events

| Event | Payload | Description |
|---|---|---|
| `click` | — | Emitted on click; suppressed when `disabled` is `true` |

### Minimal example

```vue
<script setup lang="ts">
import { AppButton } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const active = ref(false)
</script>

<template>
  <AppButton
    :active="active"
    tooltip="Toggle feature"
    aria-label="Toggle feature"
    @click="active = !active"
  >
    <!-- Inline SVG icon (stroke="currentColor" — colour tracks the token) -->
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="3" />
    </svg>
  </AppButton>
</template>
```

---

## If we ever swap the underlying headless library

The OpenPen UIKit currently wraps **Reka UI** as its headless behaviour layer.
This is an internal implementation detail. Plugin authors who import only from
`@openpen/module-api/uikit` should never see it.

If Reka UI is ever deprecated, abandoned, or significantly diverges from the
project's needs, the host has a documented fallback order:

1. **Headless UI Vue** (Tailwind Labs' official Vue port) — mature, widely used,
   smaller component set.
2. **Ark UI** (built on Zag.js, cross-framework with Vue support) — broader
   component coverage, state-machine–driven.
3. **Self-written headless primitives** — a last resort if neither option above
   is viable.

### What this means for each layer

| Layer | Effect of a library swap |
|---|---|
| **Wrapper** (`@openpen/module-api/uikit`) | No change to your code. The wrapper API — props, events, slots — is a stable contract managed by the host. |
| **Primitive re-export** (`@openpen/module-api/uikit` named primitives) | A major-version bump will land. You will need a small, targeted port to update primitive component names or props that changed. |
| **Escape hatch** (direct third-party library import) | You are responsible for porting that surface entirely. The host cannot help here because you opted out of the wrapper contract. |

This is documented up front so you can make an informed choice about which layer
to invest in. The wrapper layer is a long-term contract the host team commits to
maintaining across library swaps. If long-term stability matters more than
maximum UI freedom, the wrapper is the right choice.
