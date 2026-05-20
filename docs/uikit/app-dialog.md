---
title: AppDialog
description: Centred modal dialog with backdrop, ESC-to-close, focus trap, and host modal-manager integration.
---

# `AppDialog`

Centred dialog with backdrop, ESC-to-close, and focus trap. Integrates with the
host modal manager so opening one dialog closes any other open dialog/popover.
Use `v-model:open` for two-way binding.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `modal-id` | `string` | — (**required**) | Globally unique id; used for modal-stack mutual exclusion |
| `title` | `string` | — (**required**) | Dialog header title |
| `open` | `boolean` | — (**required**) | Controlled open state; pair with `@update:open` or `v-model:open` |
| `persistent` | `boolean` | `false` | When `true`, ESC and backdrop clicks do not close the dialog |
| `danger` | `boolean` | `false` | Adds the `openpen-modal-danger` CSS class — a hook for destructive-action styling |

## Slots

| Slot | Scope | Description |
|---|---|---|
| `trigger` | `{ active: boolean, toggle: () => void, open: () => void, close: () => void }` | Element that opens the dialog |
| `default` | — | Dialog body content |
| `footer` | — | Optional footer area (action buttons etc.) |

## Events

| Event | Payload | Description |
|---|---|---|
| `update:open` | `boolean` | Emitted when the dialog requests an open-state change; required for `v-model:open` |

> **MUST NOT** add `@click="toggle"` to the trigger — `DialogTrigger` handles
> activation automatically. The scope functions are escape hatches for
> programmatic control only.

## Minimal example

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

## Persistent + danger example (destructive confirmation)

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

## See also

For dialogs triggered from async logic rather than a template button, see [`useDialog`](./use-dialog) (imperative API).
