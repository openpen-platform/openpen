---
title: AppPopoverPanel
description: AppPopover の内容用レイアウト：縦の間隔、任意のタイトル、ホスト本体のポップアップパネルと同じ間隔のフォーム行。
translationType: machine
translatedFrom: 94f4f7d
translatedAt: 2026-11-14T00:00:00Z
language: ja
---

# `AppPopoverPanel` / `AppPopoverRow`

[`AppPopover`](./app-popover) の `content` スロット用のレイアウト補助です。`AppPopover` が枠（背景、境界線、角丸、内側余白、影）を描き、ライト／ダークテーマとアクセントカラーにも自動で追従します。この 2 つのコンポーネントは中身の配置を担当するため、プラグイン側でパネル用 CSS を書く必要はありません。

> `@openpen/module-api` 1.4.0 以上が必要です。それより古いホストにはこの 2 つのコンポーネントがありません。
>
> 以下の共有カラムによる揃えは、この 2 つのコンポーネントが最初に提供された後に追加されました。その変更より前のホストにも 2 つのコンポーネントはありますが、各行を単独でレイアウトします。ラベル、コントロール、値のテキストは 1 行に並び、行をまたいで揃いません。エラーにはならず、プラグインが実行時に検出することもできません。

## `AppPopoverPanel`

子要素の間隔が 10px の縦並びと、任意のタイトル。パネル内のすべての `AppPopoverRow` は 3 つのカラム（ラベル、コントロール、値）を共有するので、どの行でもコントロールの開始位置が揃い、値のテキストも揃います。プラグイン側の CSS は不要です。ラベルのカラムはパネル内で最も長いラベルの幅になり（翻訳後のラベルでも幅の調整は不要）、コントロールのカラムは残りの幅を使い（最小 140px）、値のカラムは任意で、どの行も使わないときは幅を取りません。

カラムには CSS `subgrid`（Chromium 117 以降）を使います。ホストの Electron は対応済みなので、プラグイン側で追加の対応は要りません。`subgrid` に対応していないブラウザでは、1 行の 3 つの部分が縦に積まれます。

**行はパネルの直接の子要素にしてください。**カラムはパネルが持っていて、行はパネル自身の子である場合にだけ参加します。行を `<div>` や、ルートがラッパーになっているコンポーネントで包まないでください。包まれた行は共有カラムから外れ、ラベル、コントロール、値のテキストが狭い 1 カラムに縮んで縦に積まれます。行の外側の `<template v-for>` や `<template v-if>` は、要素を作らないので問題ありません。

パネルの直下に置いたそれ以外の内容（補足テキストや区切り線など）はラベルのカラムに配置され、そのカラムを広げることがあります。そうした内容は `label` のない `AppPopoverRow` に入れてください。その行は全カラムにまたがります。

| プロパティ | 型 | 既定値 | 説明 |
|---|---|---|---|
| `title` | `string` | — | 内容の上に表示する見出し（大文字表示、字間を広げて表示） |

| スロット | 説明 |
|---|---|
| default | パネルの内容（通常は `AppPopoverRow` を 1 つ以上） |

## `AppPopoverRow`

ラベル（任意）、コントロール、値のテキスト（任意）を 1 行に並べます。縦方向は中央揃え、間隔は 10px です。行はパネルの共有カラムに参加するので、これらをこの順に行の直下へ置いてください。`label` のない行（ボタン群、セグメント化コントロールなど）は全カラムにまたがります。行内に置いた [`AppSegmented`](./app-segmented) は残りの幅いっぱいに広がります。

| プロパティ | 型 | 既定値 | 説明 |
|---|---|---|---|
| `label` | `string` | — | コントロールの前に表示するラベル |

| スロット | 説明 |
|---|---|
| default | コントロール（`AppToggle`、`AppSlider`、`AppSegmented` など）。その後ろに、値のテキストを入れた要素を 1 つ置けます（例：`<span>150px</span>`）。値の要素は行の 3 番目の子要素（ラベル、コントロール、値）にしてください。右揃え・等幅数字で表示されます。スライダーに `width` を設定しないでください。コントロールのカラムいっぱいに広がります。 |

**スライダーの数字は値のテキストではありません。**プラグインのパネルでは、スライダーの数字を [`AppSlider`](./app-slider) の `value-label` プロパティで表示してください。スライダーをドラッグしている間だけつまみの上に小さな吹き出しが出るので、パネルは静かなままで、スライダーはコントロールのカラム全体を使えます。スライダーの横に固定の数字を置かないでください。3 番目の要素は、スライダーの値ではないテキストにだけ使います。

任意の値のテキストは位置で見つけるため、1 行は 3 つの部分にとどめてください。

- 4 番目の要素は行内の余分な 1 行に折り返されます。値は 3 番目のまま右揃えで残ります。複数のルート要素を出力するコントロールのコンポーネントは複数の位置を使うため、値が 3 番目の位置から押し出されます。その場合、値は行内の余分な 1 行に折り返され、右揃えにもなりません。
- `label` のない行は単なる flex 行です。その 3 番目の要素にはカラムの揃えが適用されません。
- `label` があって値のテキストがない行は問題ありません。値のカラムが空くだけです。

## 最小の例

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

## 揃えたスライダーの行

スライダーのある行はパネル全体で揃い、各スライダーはドラッグ中に吹き出しで自分の数字を表示します。幅もスタイルも指定しません。

```vue
<AppPopoverPanel title="Spotlight">
  <AppPopoverRow label="Radius">
    <AppSlider v-model="radius" :min="40" :max="400" :value-label="`${radius}px`" ariaLabel="Radius" />
  </AppPopoverRow>
  <AppPopoverRow label="Dim level">
    <AppSlider v-model="dim" :min="0" :max="100" :value-label="`${dim}%`" ariaLabel="Dim level" />
  </AppPopoverRow>
</AppPopoverPanel>
```

ラベルの長さにかかわらず、2 つのスライダーは開始位置も終了位置も同じになります。
