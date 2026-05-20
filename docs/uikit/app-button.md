---
title: AppButton
description: Standard 36×36 control-bar button matching the host's visual design with built-in tooltip support.
---

# `AppButton`

Standard 36×36 control-bar button that matches the host's visual design: rounded
corners, hover background, active-state accent highlight, and an inline tooltip.
Prefer this wrapper over a plain `<button>` when adding a button to the control
bar — it removes the need to replicate exact sizing, colours, and tooltip
behaviour manually.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `'default' \| 'danger'` | `'default'` | Visual intent; `'danger'` colours the button red for destructive actions |
| `active` | `boolean` | `false` | Highlights the button with the accent colour (use for active-tool state) |
| `disabled` | `boolean` | `false` | Dims the button content; keeps pointer events alive so the tooltip still fires |
| `tooltip` | `string` | — | Short label shown above the button on hover |
| `aria-label` | `string` | — | Accessible name for screen readers |

## Slots

| Slot | Description |
|---|---|
| `default` | Button content (icon SVG, text, or any inline element) |

## Events

| Event | Payload | Description |
|---|---|---|
| `click` | — | Emitted on click; suppressed when `disabled` is `true` |

## Minimal example

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
