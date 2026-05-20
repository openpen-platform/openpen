---
title: AppPopover
description: Click-to-open popover anchored to a trigger element, with outside-click close, mutual exclusion, and ControlBar animation guard.
---

# `AppPopover`

Click-to-open popover anchored to a trigger element. Handles outside-click close,
mutual exclusion with other popovers, and ControlBar animation guard.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `popover-id` | `string` | — (**required**) | Globally unique id; used for mutual exclusion |
| `placement` | `'auto' \| 'top' \| 'bottom' \| 'left' \| 'right'` | `'auto'` | Preferred placement direction |
| `gap` | `number` | `8` | Distance between trigger and content in px |

## Slots

| Slot | Scope | Description |
|---|---|---|
| `trigger` | `{ active: boolean, toggle: () => void, open: () => void, close: () => void }` | The element that opens the popover |
| `content` | — | Content rendered inside the popover panel |

> **MUST NOT** add `@click="toggle"` to the trigger button. `PopoverTrigger` handles
> the click internally; calling `toggle` manually causes a double-toggle race.
> The `toggle`/`open`/`close` scope functions are provided for **programmatic control**
> only (e.g., opening this popover from another button).

## Minimal example

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
