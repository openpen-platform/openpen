---
title: AppPopover
description: 点击打开的弹出层，锚定到触发元素，支持外部点击关闭、互斥以及 ControlBar 动画守卫。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# `AppPopover`

点击打开的弹出层，锚定到触发元素。支持外部点击关闭、与其他弹出层互斥以及 ControlBar 动画守卫。

## 属性

| 属性 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `popover-id` | `string` | — (**必填**) | 全局唯一 id，用于互斥控制 |
| `placement` | `'auto' \| 'top' \| 'bottom' \| 'left' \| 'right'` | `'auto'` | 首选弹出方向 |
| `gap` | `number` | `8` | 触发元素与内容之间的距离（px） |

## 插槽

| 插槽 | 作用域 | 描述 |
|---|---|---|
| `trigger` | `{ active: boolean, toggle: () => void, open: () => void, close: () => void }` | 用于打开弹出层的元素 |
| `content` | — | 渲染在弹出层面板内的内容 |

> **MUST NOT** 在触发按钮上添加 `@click="toggle"`。`PopoverTrigger` 会在内部处理点击事件；手动调用 `toggle` 会导致双重切换竞态问题。
> `toggle`/`open`/`close` 作用域函数仅供**程序化控制**使用（例如，从另一个按钮打开此弹出层）。

## 最简示例

```vue
<script setup lang="ts">
import { AppPopover } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const value = ref(50)
</script>

<template>
  <AppPopover popover-id="my-slider" placement="auto">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">Slider</button>
    </template>
    <template #content>
      <input v-model.number="value" type="range" min="0" max="100" />
    </template>
  </AppPopover>
</template>
```
