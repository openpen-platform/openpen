---
title: AppButtonDropdown
description: 分离模式控制栏按钮——将 AppButton 主操作与一个用于切换弹出层的箭头按钮组合在一起。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# `AppButtonDropdown`

一个复合控制栏按钮，将 `AppButton`（主操作）与一个窄箭头按钮组合在一起。主按钮触发自身的点击事件；箭头按钮用于切换一个 `AppPopover`，其内容通过 slot 提供。参考了 [Quasar `QBtnDropdown` 分离模式](https://quasar.dev/vue-components/button-dropdown)以及 shadcn Button + DropdownMenu 的组合方式。

当单个按钮同时具备以下两种用途时，请使用此组件：

- **主操作**：用户直接触发（激活工具、执行命令）
- **次级面板**：选项列表（模式选择、子面板、相关快捷键）

如果你只需要一个按钮，请使用 [`AppButton`](./app-button)——`AppButtonDropdown` 内部对其进行了封装。如果你只需要一个弹出层触发器，请单独使用 [`AppPopover`](./app-popover)。

箭头图标会自动旋转，朝向弹出层展开的方向：关闭时向下，在水平控制栏中展开时向上，在垂直控制栏中则向左或向右（远离吸附边缘）。该组件从宿主读取 `SNAP_EDGE_KEY` 与 `IS_VERTICAL_KEY`，plugin 作者无需手动配置旋转方向。

## 属性

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `popoverId` | `string` | —（必填）| 传递给内部 `AppPopover` 的全局唯一 ID；用于模态管理器识别此下拉组件 |
| `popoverPlacement` | `'auto' \| 'top' \| 'bottom' \| 'left' \| 'right'` | `'auto'` | 弹出层首选方向；`auto` 根据宿主的 `POPOVER_PLACEMENT_HINT_KEY` 自动判断 |
| `active` | `boolean` | `false` | 使用强调色高亮主按钮（用于工具激活状态） |
| `disabled` | `boolean` | `false` | 同时禁用主按钮和箭头按钮；tooltip 仍可悬停显示 |
| `variant` | `'default' \| 'danger'` | `'default'` | 主按钮的视觉语义 |
| `mainTooltip` | `string` | — | 悬停主按钮时显示的 tooltip |
| `mainAriaLabel` | `string` | — | 主按钮的无障碍名称 |
| `caretAriaLabel` | `string` | — | 箭头按钮的无障碍名称（屏幕阅读器用户必填） |
| `mainTestid` | `string` | — | 透传给主按钮的 `data-testid` |
| `caretTestid` | `string` | — | 透传给箭头按钮的 `data-testid` |

## 插槽

| 插槽 | 说明 |
|---|---|
| `main-content` | 渲染在主按钮内部的内容（图标 SVG、色块等） |
| `popover-content` | 弹出层展开时渲染的内容（菜单、子面板、选项列表） |

## 事件

| 事件 | 载荷 | 说明 |
|---|---|---|
| `mainClick` | — | 主按钮点击；`disabled` 为 `true` 时被抑制 |
| `caretClick` | — | 箭头按钮点击（弹出层的开关由 `AppPopover` 内部处理）；可用于副作用处理，例如在工具未激活时点击箭头按钮时激活工具 |

## 最简示例

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { AppButtonDropdown } from '@openpen/module-api/uikit'

const isActive = ref(false)

function activate() {
  isActive.value = true
  // ...run primary action
}

function activateIfNeeded() {
  if (!isActive.value) isActive.value = true
}
</script>

<template>
  <AppButtonDropdown
    popover-id="shape"
    :active="isActive"
    main-tooltip="Shape tool"
    main-aria-label="Shape tool"
    caret-aria-label="Shape options"
    @main-click="activate"
    @caret-click="activateIfNeeded"
  >
    <template #main-content>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    </template>
    <template #popover-content>
      <div class="my-shape-picker">
        <!-- your option list / sub-panel goes here -->
      </div>
    </template>
  </AppButtonDropdown>
</template>
```

## 布局说明

在水平控制栏中，外层容器为 flex 行排列；在垂直控制栏中为 flex 列排列。两种方向下，箭头按钮始终紧贴主按钮的右侧（或下方）。结构类 `app-btn-dropdown-wrap`、`app-btn-dropdown-caret` 和 `app-btn-dropdown-caret-icon` 以非 scoped 方式暴露，供宿主（或你的 plugin 主题）应用上下文尺寸调整——例如，当 `AppButtonDropdown` 位于嵌入式控制栏分组内时，OpenPen 宿主会将箭头按钮高度收缩至 30 px。

弹出层展开时，箭头按钮会获得 `.active` 类以显示强调高亮；当宿主触发控制栏动画时，内部的 `AppPopover` 会自动关闭（无需手动协调）。
