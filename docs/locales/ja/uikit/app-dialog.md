---
title: AppDialog
description: バックドロップ・ESC クローズ・フォーカストラップ・ホストモーダルマネージャー統合を備えた中央揃えモーダルダイアログ。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# `AppDialog`

バックドロップ・ESC クローズ・フォーカストラップを備えた中央揃えダイアログです。ホストのモーダルマネージャーと統合されており、1 つのダイアログを開くと他に開いているダイアログや popover が自動的に閉じます。双方向バインディングには `v-model:open` を使用してください。

## プロパティ

| プロパティ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `modal-id` | `string` | — (**必須**) | グローバルに一意な ID。モーダルスタックの排他制御に使用されます |
| `title` | `string` | — (**必須**) | ダイアログヘッダーのタイトル |
| `open` | `boolean` | — (**必須**) | 制御された開閉状態。`@update:open` または `v-model:open` と組み合わせて使用します |
| `persistent` | `boolean` | `false` | `true` のとき、ESC キーおよびバックドロップのクリックでダイアログが閉じません |
| `danger` | `boolean` | `false` | `openpen-modal-danger` CSS クラスを付与します。破壊的アクションのスタイリング用フックです |

## スロット

| スロット | スコープ | 説明 |
|---|---|---|
| `trigger` | `{ active: boolean, toggle: () => void, open: () => void, close: () => void }` | ダイアログを開くトリガー要素 |
| `default` | — | ダイアログ本文のコンテンツ |
| `footer` | — | オプションのフッターエリア (アクションボタンなど) |

## イベント

| イベント | ペイロード | 説明 |
|---|---|---|
| `update:open` | `boolean` | ダイアログが開閉状態の変更を要求するときに発火します。`v-model:open` に必要です |

> **MUST NOT** トリガーに `@click="toggle"` を追加しないでください。`DialogTrigger` がアクティベーションを自動的に処理します。スコープ関数はプログラム制御専用のエスケープハッチです。

## 最小構成の例

```vue
<script setup lang="ts">
import { AppDialog } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const open = ref(false)
</script>

<template>
  <AppDialog modal-id="confirm-clear" title="Clear canvas?" v-model:open="open">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">Clear…</button>
    </template>
    Are you sure? This cannot be undone.
    <template #footer>
      <button @click="open = false">Cancel</button>
      <button class="primary" @click="open = false">Clear</button>
    </template>
  </AppDialog>
</template>
```

## persistent + danger の例 (破壊的確認)

```vue
<script setup lang="ts">
import { AppDialog } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const open = ref(false)

function confirmDelete() {
  // perform destructive action
  open.value = false
}
</script>

<template>
  <AppDialog
    modal-id="delete-layer"
    title="Delete layer?"
    v-model:open="open"
    :persistent="true"
    :danger="true"
  >
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">Delete…</button>
    </template>
    This layer and all its strokes will be permanently removed.
    <template #footer>
      <button @click="open = false">Cancel</button>
      <button class="danger" @click="confirmDelete">Delete</button>
    </template>
  </AppDialog>
</template>
```

## 関連項目

テンプレートボタンではなく非同期ロジックからダイアログを起動する場合は、[`useDialog`](./use-dialog) (命令型 API) を参照してください。
