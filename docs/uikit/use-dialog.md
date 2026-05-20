---
title: useDialog
description: Promise-based imperative dialog API for triggering dialogs from async logic rather than template buttons.
---

# `useDialog` (imperative API)

`useDialog()` provides a Promise-based alternative to `<AppDialog>` for
cases where the dialog is triggered from logic rather than a template button —
e.g., confirmation before a destructive IPC call, or a prompt mid-workflow.
The underlying renderer is a private `<DialogHost />` mounted by the host; plugin
authors never interact with it directly.

## API summary

| Method | Signature | Resolves with |
|---|---|---|
| `.confirm()` | `(opts: DialogConfirmOptions) => Promise<boolean>` | `true` on OK; `false` on Cancel or dismiss |
| `.alert()` | `(opts: DialogAlertOptions) => Promise<void>` | resolves on dismiss (OK button or ESC) |
| `.prompt()` | `(opts: DialogPromptOptions) => Promise<string \| null>` | input value string on OK; `null` on Cancel or dismiss |
| `.custom<T>()` | `(opts: DialogCustomOptions<T>) => Promise<T \| null>` | payload passed to `ok(payload)`; `null` on cancel or dismiss |

## Options reference

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

## Working examples

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

## When to use which?

| Use case | Recommended |
|---|---|
| Dialog opened by a toolbar button with a visible trigger | `<AppDialog>` |
| Dialog opened from async logic / IPC callback | `useDialog()` |
| Simple yes/no confirmation before a destructive action | `useDialog().confirm()` |
| Single-line text input mid-workflow | `useDialog().prompt()` |
| Informational message / error notification | `useDialog().alert()` |
| Fully custom layout with bespoke interaction | `useDialog().custom()` + `useDialogPluginComponent()` |
| Dialog content needs access to parent component state via props/slots | `<AppDialog>` |

## Constraints

> - **Promise-based only** — there is no chainable `.onOk()` / `.onCancel()` API.
> - **Queued, not concurrent** — at most one imperative dialog is open at a time.
>   Additional calls while a dialog is open are queued and executed sequentially
>   after the current dialog resolves.
> - **`useDialogPluginComponent()` call site** — MUST be called inside a component
>   that is rendered by `useDialog().custom()`. Calling it elsewhere throws at runtime.
