---
title: AppPopoverPanel
description: AppPopover の内容用レイアウト：縦の間隔、任意のタイトル、ホスト本体のポップアップパネルと同じ間隔のフォーム行。
translationType: machine
translatedFrom: 94f4f7d
translatedAt: 2026-11-12T00:00:00Z
language: ja
---

# `AppPopoverPanel` / `AppPopoverRow`

[`AppPopover`](./app-popover) の `content` スロット用のレイアウト補助です。`AppPopover` が枠（背景、境界線、角丸、内側余白、影）を描き、ライト／ダークテーマとアクセントカラーにも自動で追従します。この 2 つのコンポーネントは中身の配置を担当するため、プラグイン側でパネル用 CSS を書く必要はありません。

> `@openpen/module-api` 1.4.0 以上が必要です。それより古いホストにはこの 2 つのコンポーネントがありません。

## `AppPopoverPanel`

子要素の間隔が 10px の縦並びと、任意のタイトル。

| プロパティ | 型 | 既定値 | 説明 |
|---|---|---|---|
| `title` | `string` | — | 内容の上に表示する見出し（大文字表示、字間を広げて表示） |

| スロット | 説明 |
|---|---|
| default | パネルの内容（通常は `AppPopoverRow` を 1 つ以上） |

## `AppPopoverRow`

ラベル（任意）とコントロールを 1 行に並べます。縦方向は中央揃え、間隔は 10px です。行内に置いた [`AppSegmented`](./app-segmented) は残りの幅いっぱいに広がります。

| プロパティ | 型 | 既定値 | 説明 |
|---|---|---|---|
| `label` | `string` | — | コントロールの前に表示するラベル |

| スロット | 説明 |
|---|---|
| default | コントロール：`AppToggle`、`AppSlider`、`AppSegmented` など |

## 最小例


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
