---
title: AppSlider
description: OpenPenのビジュアルスタイルに合わせた数値範囲スライダーで、水平・垂直方向のオリエンテーションに対応しています。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-11-14T00:00:00Z
language: ja
---

# `AppSlider`

OpenPen の見た目に合わせた数値範囲スライダーです。水平方向と垂直方向に対応します。

## プロパティ

| プロパティ | 型 | 既定値 | 説明 |
|---|---|---|---|
| `model-value` | `number` | — (**必須**) | 現在の値（`v-model` で使用） |
| `min` | `number` | `0` | 最小値 |
| `max` | `number` | `100` | 最大値 |
| `step` | `number` | `1` | ステップ幅 |
| `width` | `string` | `'100%'` | コンテナの幅（垂直モードでは高さ） |
| `ariaLabel` | `string` | — | スクリーンリーダーがつまみで読み上げる名前。スライダーに見えるラベルがないときに渡します。`vue-tsc` の strict templates で型チェックされるテンプレート（`openpen-build --check` が使う設定）では `ariaLabel` と書いてください。 |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | スライダーの向き |
| `track-height` | `string` | `'4px'` | トラックの太さ |
| `track-radius` | `string` | `'2px'` | トラックの角丸 |
| `thumb-width` | `string` | `'14px'` | つまみの幅 |
| `thumb-height` | `string` | `'14px'` | つまみの高さ |
| `thumb-radius` | `string` | `'50%'` | つまみの角丸 |
| `value-label` | `string` | — | 値の吹き出しに表示するテキスト（例：`"4px"`）。スライダーをドラッグしている間、つまみの上にこのテキストの小さな吹き出しが出て、離すと消えます。このテキストは `aria-valuetext` としてスクリーンリーダーにも渡されます。水平スライダーのみ。未指定なら吹き出しは出ません |

## イベント

| イベント | ペイロード | 説明 |
|---|---|---|
| `update:modelValue` | `number` | ドラッグの 1 ステップごとに発火 |

## 最小の例

```vue
<script setup lang="ts">
import { AppSlider } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const size = ref(16)
</script>

<template>
  <AppSlider v-model="size" :min="8" :max="64" width="120px" ariaLabel="Font size" />
</template>
```

## 値の表示

プラグインのポップオーバーパネルでは、スライダーの数字は横に固定表示せず `value-label`（ドラッグ中につまみの上に出る吹き出し）で表示してください。[`AppPopoverPanel`](./app-popover-panel) を参照してください。

```vue
<AppSlider v-model="size" :min="8" :max="64" :value-label="`${size}px`" ariaLabel="Font size" />
```
