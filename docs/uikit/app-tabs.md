---
title: AppTabs
description: Controlled tabbed-content container with accessible keyboard navigation.
---

# `AppTabs`

Controlled tabbed-content container.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `string` | — (**required**) | Active tab id (use `v-model`) |
| `tabs` | `Array<{ id: string; label: string }>` | — (**required**) | Ordered tab descriptors |

## Events

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `string` | Emitted when active tab changes |

## Slots

| Slot | Scope | Description |
|---|---|---|
| `default` | `{ activeTabId: string }` | Tab content area; switch on the active id |

## Minimal example

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
