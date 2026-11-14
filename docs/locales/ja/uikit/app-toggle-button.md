---
title: AppToggleButton
description: 太字や斜体などのオプション向けの 2 状態ボタン。状態は aria-pressed で公開されます。
translationType: machine
translatedFrom: aac5f17
translatedAt: 2026-11-14T00:00:00Z
language: ja
---

# `AppToggleButton`

押下/非押下の 2 状態を持つ単独のボタンです。ツールバーや設定行で切り替えるオプション（太字、斜体など）に使います。各ボタンが個別のタブ停止です。単純なオン/オフの設定には [`AppToggle`](./app-toggle) を使ってください。

## プロパティ

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `boolean` | — (**必須**) | 押下状態（`v-model`） |
| `ariaLabel` | `string` | — (**必須**) | アクセシブルネーム。内容が 1 文字やアイコンだけのことが多いため必須 |
| `disabled` | `boolean` | `false` | ボタンを無効にする |
| `testid` | `string` | — | ボタンの `data-testid` |

## イベント

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `boolean` | 新しい押下状態とともに発火 |

既定スロットがボタンの内容（テキストまたはアイコン）です。

## 押下状態とキーボード

押下と非押下は色相だけでなく、塗り・枠線・文字色で区別されます。押下中は、アクセント色の薄い塗り、強い枠線、主テキスト色になります。状態は `<button>` の `aria-pressed` で公開されます。

| キー | 動作 |
|---|---|
| `Tab` | 次のボタンへフォーカスを移動します。各ボタンが個別のタブ停止です |
| `Space` / `Enter` | フォーカス中のボタンを押下/解除します |

## 最小の例

```vue
<script setup lang="ts">
import { AppToggleButton } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const bold = ref(false)
const italic = ref(false)
</script>

<template>
  <AppToggleButton v-model="bold" ariaLabel="Bold" style="font-weight: 700">B</AppToggleButton>
  <AppToggleButton v-model="italic" ariaLabel="Italic" style="font-style: italic">I</AppToggleButton>
</template>
```
