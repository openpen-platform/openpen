---
title: AppButton
description: 标准 36×36 控制栏按钮，与宿主视觉设计保持一致，内置 tooltip 支持。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# `AppButton`

标准 36×36 控制栏按钮，与宿主视觉设计保持一致：圆角、悬停背景、激活状态强调高亮，以及内联 tooltip。在控制栏中添加按钮时，优先使用此封装组件而非原生 `<button>`——无需手动复刻精确的尺寸、颜色和 tooltip 行为。

按钮会自动适配宿主的控制栏上下文：

- **垂直栏**会将按钮缩小至 34×34，以匹配更窄的垂直栏占位。
- **Tooltip 方向**在垂直栏中朝吸附边的反方向显示（吸附左侧 → tooltip 在右侧；吸附右侧 → tooltip 在左侧），在水平模式下当控制栏靠近工作区顶部边缘时，tooltip 翻转至按钮下方。

这些行为来自宿主提供的注入键（`IS_VERTICAL_KEY`、`SNAP_EDGE_KEY`、`TOOLTIP_FLIP_DOWN_KEY`），plugin 作者无需自行配置。在宿主控制栏上下文之外，AppButton 以标准 36×36 水平模式按钮渲染。

## 属性

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `variant` | `'default' \| 'danger'` | `'default'` | 视觉意图；`'danger'` 将按钮标红，用于危险操作 |
| `active` | `boolean` | `false` | 以强调色高亮按钮（用于工具激活状态） |
| `disabled` | `boolean` | `false` | 使按钮内容变暗；保留指针事件，以便 tooltip 仍可触发 |
| `tooltip` | `string` | — | 悬停时显示在按钮上方的简短标签 |
| `aria-label` | `string` | — | 供屏幕阅读器使用的无障碍名称 |

## 插槽

| 插槽 | 说明 |
|---|---|
| `default` | 按钮内容（图标 SVG、文本或任意内联元素） |

## 事件

| 事件 | 载荷 | 说明 |
|---|---|---|
| `click` | — | 点击时触发；`disabled` 为 `true` 时被抑制 |

## 最简示例

```vue
<script setup lang="ts">
import { AppButton } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const active = ref(false)
</script>

<template>
  <AppButton
    :active="active"
    tooltip="Toggle feature"
    aria-label="Toggle feature"
    @click="active = !active"
  >
    <!-- Inline SVG icon (stroke="currentColor" — colour tracks the token) -->
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="3" />
    </svg>
  </AppButton>
</template>
```
