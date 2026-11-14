---
title: AppSegmented
description: 单选分段控件（radio group），用于互斥选项；外观是一条灰色轨道加上浮起的选中段，选项可以是文字、图标加文字，或只有图标。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-11-14T00:00:00Z
language: zh-Hans
---

# `AppSegmented`

单选分段控件（radio group）。所有选项放在同一条灰色轨道里、没有分隔线，选中的那一段会浮起（更亮的底、细边框、柔和阴影），所以选中状态靠形状就看得出来，不只靠颜色。键盘焦点会在整个分组外画一个框。

## 属性

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `model-value` | `string` | — (**必填**) | 当前选中的值（使用 `v-model`） |
| `options` | `Array<{ value: string; label: string; icon?: string; iconOnly?: boolean; tooltip?: string; testid?: string }>` | — (**必填**) | 可用选项。`icon` 是显示在标签前的 SVG 字符串。`iconOnly: true` 时只显示图标，`label` 成为无障碍名称与提示文字。`tooltip` 可为任何选项设置提示文字 |
| `ariaLabel` | `string` | — | 整个分组的无障碍名称（例如 `"Head style"`）；分组没有可见标签时请传入。在由 `vue-tsc` 以严格模板检查的模板中（`openpen-build --check` 即是），请写成 `ariaLabel`。 |
| `disabled` | `boolean` | `false` | 禁用所有交互并应用静音样式 |

## 事件

| 事件 | Payload | 说明 |
|---|---|---|
| `update:modelValue` | `string` | 选中项变更时触发 |

## 最小示例

```vue
<script setup lang="ts">
import { AppSegmented } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const mode = ref('solid')
const options = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
]
</script>

<template>
  <AppSegmented v-model="mode" :options="options" />
</template>
```

## 只有图标的选项

```vue
<script setup lang="ts">
import { AppSegmented } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const head = ref('solid')
const options = [
  { value: 'solid', label: 'Solid head', icon: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 8h8M10 4l4 4-4 4z" fill="currentColor" stroke="currentColor"/></svg>', iconOnly: true },
  { value: 'open', label: 'Open head', icon: '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M2 8h12M9 3l5 5-5 5" fill="none" stroke="currentColor"/></svg>', iconOnly: true },
]
</script>

<template>
  <AppSegmented v-model="head" :options="options" ariaLabel="Head style" />
</template>
```
