---
title: AppBanner
description: 用於顯示資訊通知、警告、成功確認與錯誤的內嵌狀態橫幅。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# `AppBanner`

用於顯示回饋訊息的內嵌狀態橫幅：資訊通知、警告、成功確認與錯誤。無 headless 依賴——純 CSS token。

## 屬性

| 屬性 | 型別 | 預設值 | 說明 |
|---|---|---|---|
| `variant` | `'info' \| 'warning' \| 'success' \| 'error'` | — (**必填**) | 視覺與語意意圖 |
| `inline` | `boolean` | `false` | 緊湊單行版面，適用於空間有限的情境（對話框、表單欄位） |

## 插槽

| 插槽 | 說明 |
|---|---|
| `default` | 橫幅訊息文字 |
| `actions` | 選填的操作按鈕列，渲染於尾端 |

## 無障礙

`variant="error"` 會渲染 `role="alert"`（強制模式——螢幕閱讀器立即播報）。
其他所有 variant 使用 `role="status"`（禮貌模式——於下一個適當時機播報）。

## 標準範例

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

## 內嵌範例（對話框或設定列）

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

## 動態 variant

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
