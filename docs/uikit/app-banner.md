---
title: AppBanner
description: Inline status banner for informational notices, warnings, success confirmations, and errors.
---

# `AppBanner`

Inline status banner for feedback messages: informational notices, warnings,
success confirmations, and errors. No headless dependency — pure CSS tokens.

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `'info' \| 'warning' \| 'success' \| 'error'` | — (**required**) | Visual and semantic intent |
| `inline` | `boolean` | `false` | Compact single-line layout for tight contexts (dialogs, form fields) |

## Slots

| Slot | Description |
|---|---|
| `default` | Banner message text |
| `actions` | Optional row of action buttons rendered at the trailing end |

## Accessibility

`variant="error"` renders with `role="alert"` (assertive — announced immediately by screen readers).
All other variants use `role="status"` (polite — announced at the next opportunity).

## Standard example

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

## Inline example (dialog or settings row)

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

## Dynamic variant

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
