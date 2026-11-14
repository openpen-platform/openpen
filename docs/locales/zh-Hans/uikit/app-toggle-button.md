---
title: AppToggleButton
description: 用于粗体、斜体等选项的双状态按钮，状态通过 aria-pressed 暴露。
translationType: machine
translatedFrom: aac5f17
translatedAt: 2026-11-14T00:00:00Z
language: zh-Hans
---

# `AppToggleButton`

具有“按下/未按下”两种状态的独立按钮，用于在工具栏或设置行中开关的选项，例如粗体和斜体。每个按钮都是独立的 Tab 停靠点。若只是普通的开/关偏好设置，请改用 [`AppToggle`](./app-toggle)。

## 属性

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `boolean` | — (**必填**) | 按下状态（使用 `v-model`） |
| `ariaLabel` | `string` | — (**必填**) | 无障碍名称。内容常常只是单个字符或图标，因此必填 |
| `disabled` | `boolean` | `false` | 禁用按钮 |
| `testid` | `string` | — | 按钮的 `data-testid` |

## 事件

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `boolean` | 触发时带有新的按下状态 |

默认插槽是按钮内容（文字或图标）。

## 按下状态与键盘

按下与未按下不只靠色相区分，而是靠填充、边框和文字颜色：按下的按钮有强调色淡底、更明显的边框和主文字色。状态通过 `<button>` 的 `aria-pressed` 暴露。

| 按键 | 行为 |
|---|---|
| `Tab` | 焦点移到下一个按钮；每个按钮都是独立的 Tab 停靠点 |
| `Space` / `Enter` | 按下或释放当前焦点按钮 |

## 最小示例

```vue
<script setup lang="ts">
import { AppToggleButton } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const bold = ref(false)
const italic = ref(false)
</script>

<template>
  <AppToggleButton v-model="bold" ariaLabel="Bold" style="font-weight: 700">B</AppToggleButton>
  <AppToggleButton v-model="italic" ariaLabel="Italic" style="font-style: italic">I</AppToggleButton>
</template>
```
