---
title: AppPopoverPanel
description: AppPopover 内容的内部布局：纵向间距、可选标题，以及与宿主自身弹出面板相同间距的表单行。
translationType: machine
translatedFrom: 94f4f7d
translatedAt: 2026-11-12T00:00:00Z
language: zh-Hans
---

# `AppPopoverPanel` / `AppPopoverRow`

用于 [`AppPopover`](./app-popover) 的 `content` 插槽的布局辅助组件。`AppPopover` 负责绘制外框（背景、边框、圆角、内边距、阴影），并自动跟随浅色/深色主题与强调色；这两个组件负责排布内部内容，因此插件无需自带面板 CSS。

> 需要 `@openpen/module-api` 1.4.0 及以上。更旧版本的宿主没有这两个组件。

## `AppPopoverPanel`

子元素间距为 10px 的纵向堆叠，外加可选标题。

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `title` | `string` | — | 显示在内容上方的标题（全大写显示，并加大字距） |

| 插槽 | 说明 |
|---|---|
| 默认 | 面板内容，通常是一个或多个 `AppPopoverRow` |

## `AppPopoverRow`

一个表单行：可选标签后接一个控件，垂直居中，间距 10px。放在行内的 [`AppSegmented`](./app-segmented) 会占满剩余宽度。

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `label` | `string` | — | 显示在控件之前的标签 |

| 插槽 | 说明 |
|---|---|
| 默认 | 控件：`AppToggle`、`AppSlider`、`AppSegmented` 等 |

## 最小示例


```vue
<script setup lang="ts">
import {
  AppPopover, AppPopoverPanel, AppPopoverRow, AppToggle, AppSegmented,
} from '@openpen/module-api/uikit'
import { ref } from 'vue'

const filled = ref(false)
const style = ref('solid')
const options = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
]
</script>

<template>
  <AppPopover popover-id="my-panel">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">Style</button>
    </template>
    <template #content>
      <AppPopoverPanel title="Style">
        <AppPopoverRow label="Fill">
          <AppToggle v-model="filled" ariaLabel="Fill" />
        </AppPopoverRow>
        <AppPopoverRow>
          <AppSegmented v-model="style" :options="options" />
        </AppPopoverRow>
      </AppPopoverPanel>
    </template>
  </AppPopover>
</template>
```
