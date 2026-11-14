---
title: AppSwatchPicker
description: 单选颜色色块，行为类似单选组：选中状态为双环，整组一个 Tab 停靠点，方向键切换。
translationType: machine
translatedFrom: aac5f17
translatedAt: 2026-11-14T00:00:00Z
language: zh-Hans
---

# `AppSwatchPicker`

一排颜色色块，只能选中其中一个。整组是 `radiogroup`，每个色块是 `radio`；整组是一个 Tab 停靠点，方向键在色块间移动。组件不内置调色板，颜色由调用方传入。

## 属性

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `string` | — (**必填**) | 当前选中的颜色值（使用 `v-model`），与 `colors` 的值不区分大小写比较 |
| `colors` | `Array<{ value: string; label: string; testid?: string }>` | — (**必填**) | 色块列表。`label` 是色块的无障碍名称，`testid` 会成为它的 `data-testid` |
| `ariaLabel` | `string` | — (**必填**) | 整组的无障碍名称 |
| `shape` | `'circular' \| 'rounded' \| 'square'` | `'circular'` | 色块形状 |
| `size` | `'small' \| 'medium' \| 'large'` | `'medium'` | 色块大小：22px、24px、28px |
| `spacing` | `'small' \| 'medium'` | `'medium'` | 色块间距：6px、8px |
| `background` | `(color) => string` | — | 覆盖色块填充（例如绘制渐变）。默认使用颜色的 `value` |
| `disabled` | `boolean` | `false` | 禁用所有交互并显示为淡化样式 |
| `testid` | `string` | `'app-swatch-picker'` | 整组的 `data-testid` |

## 事件

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `string` | 用户选中色块时触发，参数为该色块的 `value` |

## 选中状态与键盘

选中的色块带有内嵌双环：外环为主文字色，内侧为弹出面板底色的色带（`--openpen-color-surface-popup`）。色带把外环与色块隔开，因此无论色块是什么颜色，选中状态都清晰可见。键盘焦点则是色块外侧另一道轮廓线。

| 按键 | 行为 |
|---|---|
| `Tab` | 将焦点移入整组（落在选中的色块上），再按一次则离开整组 |
| `←` `↑` | 移动到上一个色块并选中（与原生单选组相同） |
| `→` `↓` | 移动到下一个色块并选中 |

选中状态通过每个 `radio` 的 `aria-checked` 暴露给辅助技术。

## 行为说明

- **换行。** 容器较窄时，色块会换到下一行。方向键始终按显示顺序逐个移动，所以在换行的布局中 `↓` 会移到下一个色块，而不是下方的色块。
- **无匹配。** 当 `model-value` 与 `colors` 中任何一项都不匹配时，没有色块被选中，`Tab` 会落在第一个色块上；按下第一个方向键后才会选中一个色块并触发 `update:modelValue`。
- **提示文字。** 每个色块也会把 `label` 显示为原生的 `title` 提示。
- **重复值。** 值以不区分大小写的方式比较，请不要传入只有大小写不同的两个颜色。
- **类型。** `SwatchColor`（`colors` 中单一项目的类型）已导出：`import type { SwatchColor } from '@openpen/module-api/uikit'`。

## 最小示例

```vue
<script setup lang="ts">
import { AppSwatchPicker } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const color = ref('#EF4444')
const colors = [
  { value: '#818CF8', label: 'Indigo' },
  { value: '#EF4444', label: 'Red' },
  { value: '#10B981', label: 'Emerald' },
]
</script>

<template>
  <AppSwatchPicker v-model="color" :colors="colors" ariaLabel="Highlight colour" />
</template>
```
