---
title: AppPopover
description: トリガー要素に固定されたクリックで開くポップオーバーです。外部クリックによる閉じる動作、相互排他制御、ControlBar アニメーションガードに対応しています。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# `AppPopover`

トリガー要素に固定されたクリックで開くポップオーバーです。外部クリックによる閉じる動作、他のポップオーバーとの相互排他制御、ControlBar アニメーションガードを処理します。

## プロパティ

| プロパティ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `popover-id` | `string` | — (**必須**) | グローバルに一意な ID です。相互排他制御に使用されます。 |
| `placement` | `'auto' \| 'top' \| 'bottom' \| 'left' \| 'right'` | `'auto'` | 優先する表示方向です。 |
| `gap` | `number` | `8` | トリガーとコンテンツ間の距離 (px) です。 |

## スロット

| スロット | スコープ | 説明 |
|---|---|---|
| `trigger` | `{ active: boolean, toggle: () => void, open: () => void, close: () => void }` | ポップオーバーを開く要素です。 |
| `content` | — | ポップオーバーパネル内にレンダリングされるコンテンツです。 |

> トリガーボタンに `@click="toggle"` を追加しては **MUST NOT** です。`PopoverTrigger` が
> クリックを内部で処理するため、`toggle` を手動で呼び出すとダブルトグルの競合が発生します。
> `toggle`/`open`/`close` スコープ関数は**プログラムによる制御**専用です
> (例: 別のボタンからこのポップオーバーを開く場合)。

## 最小構成の例

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
