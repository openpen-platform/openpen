---
title: AppSlider
description: 符合 OpenPen 视觉风格的数值范围滑块，支持水平与垂直方向。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-11-14T00:00:00Z
language: zh-Hans
---

# `AppSlider`

符合 OpenPen 视觉风格的数值范围滑块。支持水平与垂直方向。

## 属性

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `model-value` | `number` | — (**必填**) | 当前值（使用 `v-model`） |
| `min` | `number` | `0` | 最小值 |
| `max` | `number` | `100` | 最大值 |
| `step` | `number` | `1` | 步进增量 |
| `width` | `string` | `'100%'` | 容器宽度（垂直模式下为高度） |
| `ariaLabel` | `string` | — | 屏幕阅读器在滑块上朗读的名称；滑块没有可见标签时请传入。在由 `vue-tsc` 以严格模板检查的模板中（`openpen-build --check` 即是），请写成 `ariaLabel`。 |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | 滑块方向 |
| `track-height` | `string` | `'4px'` | 轨道粗细 |
| `track-radius` | `string` | `'2px'` | 轨道圆角半径 |
| `thumb-width` | `string` | `'14px'` | 滑块宽度 |
| `thumb-height` | `string` | `'14px'` | 滑块高度 |
| `thumb-radius` | `string` | `'50%'` | 滑块圆角半径 |
| `value-label` | `string` | — | 数值气泡的文字（例如 `"4px"`）。拖动滑块时，把手上方会出现带有此文字的小气泡，松开后隐藏；此文字也会以 `aria-valuetext` 提供给屏幕阅读器。仅限水平滑块。不设置则没有气泡 |

## 事件

| 事件 | 数据 | 说明 |
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
  <AppSlider v-model="size" :min="8" :max="64" width="120px" ariaLabel="Font size" />
</template>
```

## 显示数值

在插件弹出面板里，请用 `value-label`（拖动时出现在把手上方的气泡）显示滑块的数字，不要在旁边放静态数字；见 [`AppPopoverPanel`](./app-popover-panel)。

```vue
<AppSlider v-model="size" :min="8" :max="64" :value-label="`${size}px`" ariaLabel="Font size" />
```
