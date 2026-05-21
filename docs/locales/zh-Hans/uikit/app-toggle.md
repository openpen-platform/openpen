---
title: AppToggle
description: 符合 OpenPen 视觉风格的布尔开关组件。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# `AppToggle`

布尔开关组件。

## 属性

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `model-value` | `boolean` | — (**必填**) | 当前状态（使用 `v-model`） |
| `aria-label` | `string` | `''` | 无障碍标签 |

## 事件

| 事件 | 载荷 | 说明 |
|---|---|---|
| `update:modelValue` | `boolean` | 切换时触发 |

## 最简示例

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
