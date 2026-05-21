---
title: AppTooltip
description: 悬停触发的工具提示，支持配置弹出方位和展开延迟。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# `AppTooltip`

悬停触发的工具提示，支持配置方位和延迟。

## 属性

| 属性 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `content` | `string` | — (**必填**) | 工具提示文字 |
| `side` | `'top' \| 'bottom' \| 'left' \| 'right'` | `'top'` | 首选弹出方位 |
| `delay` | `number` | `200` | 悬停展开延迟（毫秒） |

## 插槽

| 插槽 | 描述 |
|---|---|
| `default` | 触发元素（任何接收悬停事件的元素） |

## 最简示例

```vue
<script setup lang="ts">
import { AppTooltip } from '@openpen/module-api/uikit'
</script>

<template>
  <AppTooltip content="Undo last stroke" side="bottom">
    <button class="cb-btn" aria-label="Undo">↶</button>
  </AppTooltip>
</template>
```

## 组合使用 `AppTooltip` 与 `AppPopover`

`AppTooltip`（悬停触发）与 `AppPopover`（点击触发）组合使用时，MUST 将
`AppTooltip` 嵌套在 `AppPopover` 的 `#trigger` 插槽**内部**。这是唯一安全的嵌套顺序。

### 为何这种方式是安全的

- `AppPopover` 通过**点击**打开；`AppTooltip` 通过**悬停**打开。两者的触发机制互斥——不会同时触发。
- 两个组件均为独立的 portal，会将各自的浮层传送至 `<body>`。`AppPopover` 使用 `MODAL_MANAGER_KEY` 实现互斥；`AppTooltip` 直接包裹 `TooltipProvider`，不使用任何共享注入键。将其中一个嵌套在另一个内部不会产生键冲突。
- `z-index` 层叠由各 portal 的包装组件独立控制，两个 portal 互不干扰。

### 可用示例

```vue
<script setup lang="ts">
import { AppPopover, AppTooltip } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const opacity = ref(80)
</script>

<template>
  <AppPopover popover-id="opacity-slider" placement="auto">
    <template #trigger="{ active }">
      <!-- AppTooltip wraps the button INSIDE the trigger slot so the
           slot-scope `active` prop remains accessible. -->
      <AppTooltip content="Adjust opacity" side="bottom">
        <button class="cb-btn" :class="{ active }" aria-label="Opacity">
          ◑
        </button>
      </AppTooltip>
    </template>
    <template #content>
      <label>
        Opacity
        <input v-model.number="opacity" type="range" min="0" max="100" />
      </label>
    </template>
  </AppPopover>
</template>
```

> **注意**：用户点击时工具提示会自动消失（浏览器在点击离开时会触发 `mouseleave`），因此已展开的弹出面板与工具提示之间不会产生视觉冲突。

### 不应这样做

```vue
<!-- ❌ AppTooltip outside #trigger — loses access to `active` slot scope -->
<AppTooltip content="Adjust opacity" side="bottom">
  <AppPopover popover-id="opacity-slider">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">◑</button>
    </template>
  </AppPopover>
</AppTooltip>
```
