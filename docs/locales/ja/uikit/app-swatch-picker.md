---
title: AppSwatchPicker
description: ラジオグループとして動作する単一選択の色見本。選択状態は二重リング、タブ停止は 1 つ、矢印キーで移動します。
translationType: machine
translatedFrom: aac5f17
translatedAt: 2026-11-14T00:00:00Z
language: ja
---

# `AppSwatchPicker`

排他的に 1 つだけ選べる色見本の列です。グループは `radiogroup`、各見本は `radio` として公開されます。グループ全体が 1 つのタブ停止で、矢印キーで見本間を移動します。パレットは内蔵されておらず、色は呼び出し側が渡します。

## プロパティ

| Prop | Type | Default | Description |
|---|---|---|---|
| `model-value` | `string` | — (**必須**) | 選択中の色の値（`v-model`）。`colors` の値と大文字小文字を区別せず比較 |
| `colors` | `Array<{ value: string; label: string; testid?: string }>` | — (**必須**) | 見本の一覧。`label` は見本のアクセシブルネーム、`testid` は `data-testid` になります |
| `ariaLabel` | `string` | — (**必須**) | グループ全体のアクセシブルネーム |
| `shape` | `'circular' \| 'rounded' \| 'square'` | `'circular'` | 見本の形 |
| `size` | `'small' \| 'medium' \| 'large'` | `'medium'` | 見本のサイズ: 22px、24px、28px |
| `spacing` | `'small' \| 'medium'` | `'medium'` | 見本の間隔: 6px、8px |
| `background` | `(color) => string` | — | 見本の塗りを上書き（グラデーションなど）。既定は色の `value` |
| `disabled` | `boolean` | `false` | すべての操作を無効にし、薄く表示 |
| `testid` | `string` | `'app-swatch-picker'` | グループの `data-testid` |

## イベント

| Event | Payload | Description |
|---|---|---|
| `update:modelValue` | `string` | ユーザーが選んだ見本の `value` とともに発火 |

## 選択状態とキーボード

選択中の見本には内側に二重リングが付きます。外側は主テキスト色のリング、内側はポップアップの面の色の帯（`--openpen-color-surface-popup`）です。帯がリングと見本を分けるため、どの色の見本でも選択が見えます。キーボードフォーカスは見本の外側の別のアウトラインで示されます。

| キー | 動作 |
|---|---|
| `Tab` | グループ（選択中の見本）にフォーカスを移し、もう一度押すとグループの外へ出ます |
| `←` `↑` | 前の見本へ移動して選択します（ネイティブのラジオグループと同じ） |
| `→` `↓` | 次の見本へ移動して選択します |

選択状態は各 `radio` の `aria-checked` で支援技術に公開されます。

## 動作に関する補足

- **折り返し。** コンテナが狭いと見本は次の行に折り返します。矢印キーは常に表示順に 1 つずつ移動するため、折り返したレイアウトでも `↓` は下の見本ではなく次の見本へ移動します。
- **一致なし。** `model-value` が `colors` のどれにも一致しない場合、どの見本もチェックされず、`Tab` は最初の見本に入ります。最初の矢印キーで見本が選択され、`update:modelValue` が発火します。
- **ツールチップ。** 各見本は `label` をネイティブの `title` ツールチップとしても表示します。
- **重複。** 値は大文字小文字を区別せず比較されるため、大文字小文字だけが違う 2 つの色を渡さないでください。
- **型。** `SwatchColor`（`colors` の 1 要素の型）がエクスポートされています: `import type { SwatchColor } from '@openpen/module-api/uikit'`。

## 最小の例

```vue
<script setup lang="ts">
import { AppSwatchPicker } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const color = ref('#EF4444')
const colors = [
  { value: '#818CF8', label: 'Indigo' },
  { value: '#EF4444', label: 'Red' },
  { value: '#10B981', label: 'Emerald' },
]
</script>

<template>
  <AppSwatchPicker v-model="color" :colors="colors" ariaLabel="Highlight colour" />
</template>
```
