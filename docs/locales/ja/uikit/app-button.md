---
title: AppButton
description: ホストのビジュアルデザインに合わせた標準 36×36 コントロールバーボタン。ツールチップのサポートを内蔵しています。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# `AppButton`

ホストのビジュアルデザインに合わせた標準 36×36 コントロールバーボタンです。角丸、ホバー時の背景、アクティブ状態のアクセントハイライト、インラインツールチップを備えています。
コントロールバーにボタンを追加する場合は、プレーンな `<button>` ではなくこのラッパーを使用してください。サイズ、色、ツールチップの動作を手動で再現する必要がなくなります。

ボタンはホストのコントロールバーコンテキストに自動的に適応します。

- **縦型バー**では、狭い縦型バーのフットプリントに合わせてボタンが 34×34 に縮小されます。
- **ツールチップの方向**は、縦型バーではスナップしているエッジと反対側を向きます (左スナップ → ツールチップは右側、右スナップ → ツールチップは左側)。水平モードではバーがワークエリアの上端に近い場合にボタンの下側に反転します。

これらの動作はホストが提供するインジェクションキー (`IS_VERTICAL_KEY`、`SNAP_EDGE_KEY`、`TOOLTIP_FLIP_DOWN_KEY`) によって実現されており、plugin 作者が設定する必要はありません。ホストのコントロールバーコンテキスト外では、AppButton は標準の 36×36 水平モードボタンとしてレンダリングされます。

## プロパティ

| プロパティ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `variant` | `'default' \| 'danger'` | `'default'` | 視覚的な意図。`'danger'` は破壊的な操作に対してボタンを赤く表示します |
| `active` | `boolean` | `false` | アクセントカラーでボタンをハイライトします (アクティブツール状態に使用します) |
| `disabled` | `boolean` | `false` | ボタンのコンテンツをグレーアウトします。ツールチップが引き続き発火するようにポインターイベントは有効なままです |
| `tooltip` | `string` | — | ホバー時にボタンの上に表示される短いラベル |
| `aria-label` | `string` | — | スクリーンリーダー向けのアクセシブルな名前 |

## スロット

| スロット | 説明 |
|---|---|
| `default` | ボタンのコンテンツ (アイコン SVG、テキスト、またはインライン要素) |

## イベント

| イベント | ペイロード | 説明 |
|---|---|---|
| `click` | — | クリック時に発行されます。`disabled` が `true` の場合は抑制されます |

## 最小構成の例

```vue
<script setup lang="ts">
import { AppButton } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const active = ref(false)
</script>

<template>
  <AppButton
    :active="active"
    tooltip="Toggle feature"
    aria-label="Toggle feature"
    @click="active = !active"
  >
    <!-- Inline SVG icon (stroke="currentColor" — colour tracks the token) -->
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <circle cx="12" cy="12" r="3" />
    </svg>
  </AppButton>
</template>
```
