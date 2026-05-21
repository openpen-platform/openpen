---
title: AppSlider
description: OpenPenのビジュアルスタイルに合わせた数値範囲スライダーで、水平・垂直方向のオリエンテーションに対応しています。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# `AppSlider`

OpenPenのビジュアルスタイルに合わせた数値範囲スライダーです。水平・垂直方向のオリエンテーションに対応しています。

## プロパティ

| プロパティ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `model-value` | `number` | — (**必須**) | 現在の値 (`v-model` を使用) |
| `min` | `number` | `0` | 最小値 |
| `max` | `number` | `100` | 最大値 |
| `step` | `number` | `1` | ステップの増分 |
| `width` | `string` | `'100%'` | コンテナの幅 (垂直モードでは高さ) |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | スライダーの方向 |
| `track-height` | `string` | `'4px'` | トラックの太さ |
| `track-radius` | `string` | `'2px'` | トラックの border-radius |
| `thumb-width` | `string` | `'14px'` | サムの幅 |
| `thumb-height` | `string` | `'14px'` | サムの高さ |
| `thumb-radius` | `string` | `'50%'` | サムの border-radius |

## イベント

| イベント | ペイロード | 説明 |
|---|---|---|
| `update:modelValue` | `number` | ドラッグのステップごとに発行されます |

## 最小限の例

```vue
<script setup lang="ts">
import { AppSlider } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const size = ref(16)
</script>

<template>
  <AppSlider v-model="size" :min="8" :max="64" width="120px" />
</template>
```
