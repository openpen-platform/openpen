---
title: AppToggle
description: Boolean on/off switch that matches OpenPen's visual style.
---

# `AppToggle`

Boolean on/off switch.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `boolean` | — (**required**) | Current state (use `v-model`) |
| `aria-label` | `string` | `''` | Accessible label |

## Events

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `boolean` | Emitted on toggle |

## Minimal example

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
