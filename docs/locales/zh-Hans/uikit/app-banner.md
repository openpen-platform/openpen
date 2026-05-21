---
title: AppBanner
description: 用于展示信息通知、警告、成功确认和错误的内联状态横幅。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# `AppBanner`

用于展示反馈消息的内联状态横幅：信息通知、警告、成功确认和错误。无 headless 依赖——纯 CSS token。

## 属性

| 属性 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `variant` | `'info' \| 'warning' \| 'success' \| 'error'` | — (**必填**) | 视觉与语义意图 |
| `inline` | `boolean` | `false` | 紧凑单行布局，适用于空间有限的场景（对话框、表单字段） |

## 插槽

| 插槽 | 描述 |
|---|---|
| `default` | 横幅消息文本 |
| `actions` | 可选的操作按钮行，渲染在末尾 |

## 无障碍

`variant="error"` 渲染时带有 `role="alert"`（assertive——屏幕阅读器立即播报）。
其他所有 variant 使用 `role="status"`（polite——在下一个时机播报）。

## 标准示例

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

## 内联示例（对话框或设置行）

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

## 动态 variant

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
