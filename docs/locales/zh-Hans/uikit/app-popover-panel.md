---
title: AppPopoverPanel
description: AppPopover 内容的内部布局：纵向间距、可选标题，以及与宿主自身弹出面板相同间距的表单行。
translationType: machine
translatedFrom: 94f4f7d
translatedAt: 2026-11-14T00:00:00Z
language: zh-Hans
---

# `AppPopoverPanel` / `AppPopoverRow`

用于 [`AppPopover`](./app-popover) 的 `content` 插槽的布局辅助组件。`AppPopover` 负责绘制外框（背景、边框、圆角、内边距、阴影），并自动跟随浅色/深色主题与强调色；这两个组件负责排布内部内容，因此插件无需自带面板 CSS。

> 需要 `@openpen/module-api` 1.4.0 及以上。更旧版本的宿主没有这两个组件。
>
> 下文的共用列对齐是在这两个组件首次发布之后才加入的。早于该变更的宿主仍有这两个组件，但每一行各自排版：标签、控件和数值文字在一行内并排，各行之间不会对齐。不会报错，插件也无法在运行时检测。

## `AppPopoverPanel`

子元素间距为 10px 的纵向堆叠，外加可选标题。面板内每个 `AppPopoverRow` 共用三列——标签、控件、数值——因此每一行的控件起点相同、数值文字也对齐，插件无需写任何 CSS。标签列与面板内最长的标签一样宽（翻译后的标签不必调宽度），控件列占用剩余宽度（至少 140px），数值列是可选的，没有任何一行使用时不占宽度。

这些列使用 CSS `subgrid`（Chromium 117 及以上）。宿主的 Electron 已包含，插件无需额外处理。在不支持 `subgrid` 的浏览器中，一行的三个部分会上下堆叠。

**行必须是面板的直接子元素。**列属于面板，行只有在是面板自己的子元素时才会加入。不要把行包在 `<div>` 或根节点为外层容器的组件里：被包住的行会离开共用列，它的标签、控件和数值文字会缩进一个窄列并上下堆叠。行外面的 `<template v-for>` 或 `<template v-if>` 没问题，因为它不产生元素。

直接放在面板里的其他内容（提示文字、分隔线）会排进标签列，并可能把标签列撑宽。请改放进没有 `label` 的 `AppPopoverRow`；那一行会横跨所有列。

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `title` | `string` | — | 显示在内容上方的标题（全大写显示，并加大字距） |

| 插槽 | 说明 |
|---|---|
| 默认 | 面板内容，通常是一个或多个 `AppPopoverRow` |

## `AppPopoverRow`

一个表单行：可选标签、一个控件、可选的数值文字，垂直居中，间距 10px。行会加入面板的共用列，所以请把这些部分按此顺序直接放在行内。没有 `label` 的行（按钮组、分段控件）改为横跨所有列。放在行内的 [`AppSegmented`](./app-segmented) 会占满剩余宽度。

| 属性 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `label` | `string` | — | 显示在控件之前的标签 |

| 插槽 | 说明 |
|---|---|
| 默认 | 控件（`AppToggle`、`AppSlider`、`AppSegmented` 等），后面可接一个放数值文字的元素（例如 `<span>150px</span>`）。数值元素必须是该行的第三个子元素（标签、控件、数值），会靠右对齐并使用等宽数字。不要给滑块设置 `width`；它会填满控件列。 |

**滑块的数字不是数值文字。**在插件面板里，请用 [`AppSlider`](./app-slider) 的 `value-label` 属性显示滑块的数字：拖动滑块时，把手上方会出现一个小气泡，面板保持安静，滑块也能使用整个控件列。不要在滑块旁放静态数字。第三个元素只用于不是滑块数值的文字。

可选的数值文字是按位置找出来的，所以每行请保持三个部分：

- 第四个元素会在行内换到多出来的一行；数值仍是第三个、靠右对齐。输出多个根节点的控件组件会占用不止一个位置，把数值挤出第三个位置：数值会换到多出来的一行，也不会靠右。
- 没有 `label` 的行是单纯的 flex 行；其中的第三个元素不会套用列对齐。
- 有 `label` 但没有数值文字的行没有问题；数值列只是留空。

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

## 对齐的滑块行

带滑块的行会在整个面板中对齐，每个滑块在拖动时以气泡显示自己的数字。不要传宽度，也不要写样式：

```vue
<AppPopoverPanel title="Spotlight">
  <AppPopoverRow label="Radius">
    <AppSlider v-model="radius" :min="40" :max="400" :value-label="`${radius}px`" ariaLabel="Radius" />
  </AppPopoverRow>
  <AppPopoverRow label="Dim level">
    <AppSlider v-model="dim" :min="0" :max="100" :value-label="`${dim}%`" ariaLabel="Dim level" />
  </AppPopoverRow>
</AppPopoverPanel>
```

两个滑块的起点与终点都相同，无论标签多长。
