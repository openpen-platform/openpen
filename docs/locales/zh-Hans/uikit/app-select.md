---
title: AppSelect
description: 与 OpenPen 弹出层样式一致的单选下拉组件。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# `AppSelect`

与 OpenPen 弹出层样式一致的单选下拉组件。

## 属性

| 属性 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `model-value` | `string` | — (**必填**) | 当前选中的值（使用 `v-model`） |
| `options` | `Array<{ value: string; label: string }>` | — (**必填**) | 可选选项列表 |
| `placeholder` | `string` | — (**必填**) | 未选中任何选项时显示的占位文本 |
| `disabled` | `boolean` | `false` | 禁用交互 |

## 事件

| 事件 | 载荷 | 描述 |
|---|---|---|
| `update:modelValue` | `string` | 选中项变更时触发 |

## 最简示例

```vue
<script setup lang="ts">
import { AppSelect } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const lang = ref('en')
const options = [
  { value: 'en', label: 'English' },
  { value: 'zh-Hant', label: '繁體中文' },
]
</script>

<template>
  <AppSelect v-model="lang" :options="options" placeholder="Pick a language" />
</template>
```
