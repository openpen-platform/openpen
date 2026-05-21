---
title: AppSlider
description: 符合 OpenPen 视觉风格的数值范围滑块，支持水平与垂直方向。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# `AppSlider`

符合 OpenPen 视觉风格的数值范围滑块。支持水平与垂直两种方向。

## 属性

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `model-value` | `number` | — (**必填**) | 当前值（使用 `v-model`） |
| `min` | `number` | `0` | 最小值 |
| `max` | `number` | `100` | 最大值 |
| `step` | `number` | `1` | 步进增量 |
| `width` | `string` | `'100%'` | 容器宽度（垂直模式下为高度） |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | 滑块方向 |
| `track-height` | `string` | `'4px'` | 轨道粗细 |
| `track-radius` | `string` | `'2px'` | 轨道圆角 |
| `thumb-width` | `string` | `'14px'` | 滑块宽度 |
| `thumb-height` | `string` | `'14px'` | 滑块高度 |
| `thumb-radius` | `string` | `'50%'` | 滑块圆角 |

## 事件

| 事件 | 载荷 | 说明 |
|---|---|---|
| `update:modelValue` | `number` | 每次拖动步进时触发 |

## 最简示例

```vue
<script setup lang="ts">
import { AppSlider } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const size = ref(16)
</script>

<template>
  <AppSlider v-model="size" :min="8" :max="64" width="120px" />
</template>
```
