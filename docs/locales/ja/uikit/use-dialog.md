---
title: useDialog
description: 非同期ロジックからダイアログを呼び出すための、Promise ベースの命令型ダイアログ API。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# `useDialog` (命令型 API)

`useDialog()` は、テンプレートのボタンではなくロジックからダイアログを起動するケースのために、`<AppDialog>` の代替となる Promise ベースの API を提供します。たとえば、破壊的な IPC 呼び出し前の確認や、ワークフロー途中のプロンプト表示などが該当します。内部レンダラーはホストがマウントするプライベートな `<DialogHost />` であり、plugin 作者が直接操作することはありません。

## API 概要

| メソッド | シグネチャ | 解決値 |
|---|---|---|
| `.confirm()` | `(opts: DialogConfirmOptions) => Promise<boolean>` | OK で `true`、キャンセルまたは閉じで `false` |
| `.alert()` | `(opts: DialogAlertOptions) => Promise<void>` | 閉じ操作 (OK ボタンまたは ESC) で解決 |
| `.prompt()` | `(opts: DialogPromptOptions) => Promise<string \| null>` | OK で入力値の文字列、キャンセルまたは閉じで `null` |
| `.custom<T>()` | `(opts: DialogCustomOptions<T>) => Promise<T \| null>` | `ok(payload)` に渡したペイロード、キャンセルまたは閉じで `null` |

## オプション一覧

すべてのメソッドは**共通ベース**とメソッド固有のフィールドを受け取ります。

**共通ベース** (全メソッドで共有される `title`):

| オプション | 型 | 必須 | 説明 |
|---|---|---|---|
| `title` | `string` | yes | ダイアログのヘッダータイトル |
| `persistent` | `boolean` | no | ESC / バックドロップによる閉じを抑制する |
| `danger` | `boolean` | no | 危険スタイルを適用する |

**`confirm` 固有:**

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `message` | `string` | — (**必須**) | 本文テキスト |
| `okLabel` | `string` | `'OK'` | 確認ボタンのラベル |
| `cancelLabel` | `string` | `'Cancel'` | キャンセルボタンのラベル |

**`alert` 固有:**

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `message` | `string` | — (**必須**) | 本文テキスト |
| `okLabel` | `string` | `'OK'` | 閉じボタンのラベル |

**`prompt` 固有:**

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `message` | `string` | — (**必須**) | 入力欄の上に表示する本文テキスト |
| `defaultValue` | `string` | `''` | 入力欄の初期値 |
| `placeholder` | `string` | — | 入力欄のプレースホルダーテキスト |
| `okLabel` | `string` | `'OK'` | 送信ボタンのラベル |
| `cancelLabel` | `string` | `'Cancel'` | キャンセルボタンのラベル |

**`custom` 固有:**

| オプション | 型 | デフォルト | 説明 |
|---|---|---|---|
| `component` | `Component` | — (**必須**) | ダイアログ本体としてレンダリングする Vue コンポーネント |
| `componentProps` | `Record<string, unknown>` | `{}` | カスタムコンポーネントに転送するプロパティ |

## 使用例

**confirm:**

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

**alert:**

```ts
const dialog = useDialog()

await dialog.alert({
  title: 'Save failed',
  message: 'Could not write to disk. Check permissions.',
})
```

**prompt:**

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

**custom** — `useDialogPluginComponent()` を使う場合:

カスタムコンポーネントは `useDialogPluginComponent<T>()` を呼び出して、Promise を解決する `ok` / `cancel` / `dismiss` のハンドルを取得します。

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

呼び出し元:

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

## どれを使うべきか?

| ユースケース | 推奨 |
|---|---|
| ツールバーボタンなど目に見えるトリガーからダイアログを開く | `<AppDialog>` |
| 非同期ロジックや IPC コールバックからダイアログを開く | `useDialog()` |
| 破壊的操作前のシンプルな yes/no 確認 | `useDialog().confirm()` |
| ワークフロー途中での 1 行テキスト入力 | `useDialog().prompt()` |
| 情報メッセージやエラー通知 | `useDialog().alert()` |
| 独自のインタラクションを持つ完全カスタムレイアウト | `useDialog().custom()` + `useDialogPluginComponent()` |
| ダイアログのコンテンツが props/slot 経由で親コンポーネントの状態にアクセスする必要がある | `<AppDialog>` |

## 制約

> - **Promise ベースのみ** — チェーン可能な `.onOk()` / `.onCancel()` API はありません。
> - **キュー処理、同時実行なし** — 命令型ダイアログは同時に最大 1 つしか開けません。ダイアログが開いている間に追加で呼び出された場合は、現在のダイアログが解決した後に順番に実行されます。
> - **`useDialogPluginComponent()` の呼び出し元** — `useDialog().custom()` によってレンダリングされるコンポーネント内で呼び出す必要があります。それ以外の場所で呼び出すと実行時にエラーが発生します。
