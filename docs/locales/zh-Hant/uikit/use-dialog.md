---
title: useDialog
description: 基於 Promise 的命令式對話框 API，用於從非同步邏輯觸發對話框，而非透過範本按鈕。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# `useDialog`（命令式 API）

`useDialog()` 提供以 Promise 為基礎的替代方案，用於取代 `<AppDialog>`，適合從邏輯而非範本按鈕觸發對話框的情境——例如，在執行破壞性 IPC 呼叫前的確認提示，或工作流程中途的輸入提示。底層渲染器是由 host 掛載的私有 `<DialogHost />`；plugin 作者永遠不會直接與它互動。

## API 摘要

| 方法 | 簽名 | 解析值 |
|---|---|---|
| `.confirm()` | `(opts: DialogConfirmOptions) => Promise<boolean>` | 按下 OK 時為 `true`；取消或關閉時為 `false` |
| `.alert()` | `(opts: DialogAlertOptions) => Promise<void>` | 關閉時解析（OK 按鈕或 ESC） |
| `.prompt()` | `(opts: DialogPromptOptions) => Promise<string \| null>` | 按下 OK 時為輸入值字串；取消或關閉時為 `null` |
| `.custom<T>()` | `(opts: DialogCustomOptions<T>) => Promise<T \| null>` | 傳入 `ok(payload)` 的 payload；取消或關閉時為 `null` |

## 選項參考

所有方法都接受一個**共用基底**加上各方法專屬欄位：

**共用基底**（`title`，所有方法共享）：

| 選項 | 類型 | 必填 | 說明 |
|---|---|---|---|
| `title` | `string` | 是 | 對話框標題 |
| `persistent` | `boolean` | 否 | 停用 ESC / 背景點擊關閉 |
| `danger` | `boolean` | 否 | 套用危險操作樣式 |

**`confirm` 專屬：**

| 選項 | 類型 | 預設值 | 說明 |
|---|---|---|---|
| `message` | `string` | —（**必填**） | 主體文字 |
| `okLabel` | `string` | `'OK'` | 確認按鈕的標籤 |
| `cancelLabel` | `string` | `'Cancel'` | 取消按鈕的標籤 |

**`alert` 專屬：**

| 選項 | 類型 | 預設值 | 說明 |
|---|---|---|---|
| `message` | `string` | —（**必填**） | 主體文字 |
| `okLabel` | `string` | `'OK'` | 關閉按鈕的標籤 |

**`prompt` 專屬：**

| 選項 | 類型 | 預設值 | 說明 |
|---|---|---|---|
| `message` | `string` | —（**必填**） | 輸入框上方的主體文字 |
| `defaultValue` | `string` | `''` | 預填的輸入值 |
| `placeholder` | `string` | — | 輸入框的佔位文字 |
| `okLabel` | `string` | `'OK'` | 提交按鈕的標籤 |
| `cancelLabel` | `string` | `'Cancel'` | 取消按鈕的標籤 |

**`custom` 專屬：**

| 選項 | 類型 | 預設值 | 說明 |
|---|---|---|---|
| `component` | `Component` | —（**必填**） | 要渲染為對話框主體的 Vue 元件 |
| `componentProps` | `Record<string, unknown>` | `{}` | 轉發給自訂元件的屬性 |

## 使用範例

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

自訂元件呼叫 `useDialogPluginComponent<T>()` 來取得 `ok` / `cancel` / `dismiss` 控制代碼，以解析 Promise：

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

呼叫端：

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

## 何時使用哪種方式？

| 使用情境 | 建議 |
|---|---|
| 由工具列按鈕開啟、有明確觸發點的對話框 | `<AppDialog>` |
| 從非同步邏輯 / IPC 回呼開啟的對話框 | `useDialog()` |
| 執行破壞性操作前的簡單是/否確認 | `useDialog().confirm()` |
| 工作流程中途的單行文字輸入 | `useDialog().prompt()` |
| 資訊訊息 / 錯誤通知 | `useDialog().alert()` |
| 具有客製互動的完整自訂版面 | `useDialog().custom()` + `useDialogPluginComponent()` |
| 對話框內容需要透過屬性/插槽存取父元件狀態 | `<AppDialog>` |

## 限制

> - **僅限 Promise** — 沒有可鏈式呼叫的 `.onOk()` / `.onCancel()` API。
> - **佇列執行，不並發** — 同一時間最多只能開啟一個命令式對話框。在對話框開啟期間發出的其他呼叫會被加入佇列，並在當前對話框解析後依序執行。
> - **`useDialogPluginComponent()` 呼叫位置** — 必須在由 `useDialog().custom()` 渲染的元件內呼叫。在其他地方呼叫將在執行時期拋出錯誤。
