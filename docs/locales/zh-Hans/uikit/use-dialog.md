---
title: useDialog
description: 基于 Promise 的命令式对话框 API，用于在异步逻辑中触发对话框，而非通过模板按钮触发。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# `useDialog`（命令式 API）

`useDialog()` 为 `<AppDialog>` 提供了一种基于 Promise 的替代方案，适用于从逻辑而非模板按钮触发对话框的场景——例如，在执行破坏性 IPC 调用前的确认，或工作流程中途的提示输入。底层渲染器是由宿主挂载的私有 `<DialogHost />`；plugin 作者无需直接与其交互。

## API 概览

| 方法 | 签名 | 解析值 |
|---|---|---|
| `.confirm()` | `(opts: DialogConfirmOptions) => Promise<boolean>` | 点击确定返回 `true`；点击取消或关闭返回 `false` |
| `.alert()` | `(opts: DialogAlertOptions) => Promise<void>` | 关闭时解析（点击确定按钮或按 ESC） |
| `.prompt()` | `(opts: DialogPromptOptions) => Promise<string \| null>` | 点击确定时返回输入字符串；点击取消或关闭时返回 `null` |
| `.custom<T>()` | `(opts: DialogCustomOptions<T>) => Promise<T \| null>` | 传递给 `ok(payload)` 的载荷；取消或关闭时返回 `null` |

## 选项参考

所有方法接受一个**公共基础**加上各方法特定的字段：

**公共基础**（`title`，所有方法共享）：

| 选项 | 类型 | 是否必填 | 描述 |
|---|---|---|---|
| `title` | `string` | 是 | 对话框标题 |
| `persistent` | `boolean` | 否 | 禁止通过 ESC / 背景遮罩关闭 |
| `danger` | `boolean` | 否 | 应用危险样式 |

**`confirm` 特有字段：**

| 选项 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `message` | `string` | — （**必填**） | 正文文本 |
| `okLabel` | `string` | `'OK'` | 确认按钮的标签 |
| `cancelLabel` | `string` | `'Cancel'` | 取消按钮的标签 |

**`alert` 特有字段：**

| 选项 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `message` | `string` | — （**必填**） | 正文文本 |
| `okLabel` | `string` | `'OK'` | 关闭按钮的标签 |

**`prompt` 特有字段：**

| 选项 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `message` | `string` | — （**必填**） | 输入框上方的正文文本 |
| `defaultValue` | `string` | `''` | 预填充的输入值 |
| `placeholder` | `string` | — | 输入框占位文本 |
| `okLabel` | `string` | `'OK'` | 提交按钮的标签 |
| `cancelLabel` | `string` | `'Cancel'` | 取消按钮的标签 |

**`custom` 特有字段：**

| 选项 | 类型 | 默认值 | 描述 |
|---|---|---|---|
| `component` | `Component` | — （**必填**） | 作为对话框主体渲染的 Vue 组件 |
| `componentProps` | `Record<string, unknown>` | `{}` | 传递给自定义组件的属性 |

## 使用示例

**confirm：**

```ts
import { useDialog } from '@openpen/module-api/uikit'

const dialog = useDialog()

async function clearCanvas() {
  const confirmed = await dialog.confirm({
    title: 'Clear canvas?',
    message: 'All strokes will be permanently removed.',
    okLabel: 'Clear',
    danger: true,
  })
  if (confirmed) {
    // proceed
  }
}
```

**alert：**

```ts
const dialog = useDialog()

await dialog.alert({
  title: 'Save failed',
  message: 'Could not write to disk. Check permissions.',
})
```

**prompt：**

```ts
const dialog = useDialog()

const name = await dialog.prompt({
  title: 'Rename layer',
  message: 'Enter a new name for this layer:',
  defaultValue: 'Layer 1',
  placeholder: 'Layer name',
})
if (name !== null) {
  // user confirmed; name is the entered string
}
```

**custom** — 使用 `useDialogPluginComponent()`：

自定义组件调用 `useDialogPluginComponent<T>()` 来获取 `ok` / `cancel` / `dismiss` 句柄，这些句柄会解析 Promise：

```vue
<!-- MyCustomDialog.vue -->
<script setup lang="ts">
import { useDialogPluginComponent } from '@openpen/module-api/uikit'

const { ok, cancel } = useDialogPluginComponent<{ choice: 'a' | 'b' }>()
</script>

<template>
  <button @click="ok({ choice: 'a' })">Pick A</button>
  <button @click="ok({ choice: 'b' })">Pick B</button>
  <button @click="cancel()">Cancel</button>
</template>
```

调用方：

```ts
import { useDialog } from '@openpen/module-api/uikit'
import MyCustomDialog from './MyCustomDialog.vue'

const dialog = useDialog()

const result = await dialog.custom<{ choice: 'a' | 'b' }>({
  title: 'Pick one',
  component: MyCustomDialog,
})
// result is { choice: 'a' } | { choice: 'b' } | null
```

## 如何选择？

| 使用场景 | 推荐方案 |
|---|---|
| 由工具栏按钮打开、有可见触发器的对话框 | `<AppDialog>` |
| 从异步逻辑 / IPC 回调中打开的对话框 | `useDialog()` |
| 破坏性操作前的简单是/否确认 | `useDialog().confirm()` |
| 工作流程中途的单行文本输入 | `useDialog().prompt()` |
| 信息提示 / 错误通知 | `useDialog().alert()` |
| 具有自定义交互的完全自定义布局 | `useDialog().custom()` + `useDialogPluginComponent()` |
| 对话框内容需要通过属性/插槽访问父组件状态 | `<AppDialog>` |

## 约束

> - **仅基于 Promise** — 没有可链式调用的 `.onOk()` / `.onCancel()` API。
> - **队列执行，非并发** — 同一时间最多只有一个命令式对话框处于打开状态。当对话框已打开时，额外的调用会进入队列，在当前对话框解析后按顺序执行。
> - **`useDialogPluginComponent()` 调用位置** — 必须在由 `useDialog().custom()` 渲染的组件内部调用。在其他位置调用会在运行时抛出错误。
