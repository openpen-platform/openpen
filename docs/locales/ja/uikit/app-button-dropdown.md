---
title: AppButtonDropdown
description: スプリットモードのコントロールバーボタン — AppButton のプライマリアクションとポップオーバーを切り替えるキャレットボタンをペアにします。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# `AppButtonDropdown`

`AppButton` (メインアクション) とナロウなキャレットボタンをペアにした複合コントロールバーボタンです。メインボタンは独自のクリックイベントを発火し、キャレットボタンは slot で提供するコンテンツを持つ `AppPopover` を切り替えます。[Quasar `QBtnDropdown` スプリットモード](https://quasar.dev/vue-components/button-dropdown) と shadcn の Button + DropdownMenu コンポジションを参考にしています。

次の両方を持つボタンが必要な場合に使用してください。

- 直接呼び出す**プライマリアクション** (ツールのアクティベート、コマンドの実行)
- オプションの**セカンダリサーフェス** (モードピッカー、サブパネル、関連ショートカット)

ボタンだけが必要な場合は [`AppButton`](./app-button) を使用してください — `AppButtonDropdown` は内部的にこれをラップしています。ポップオーバートリガーだけが必要な場合は [`AppPopover`](./app-popover) を単独で使用してください。

キャレットのシェブロンは開いているポップオーバーの方向に向くよう自動的に回転します。閉じているときは下向き、水平バーで開いているときは上向き、垂直バーでは (スナップされたエッジから離れる方向に) 左向きまたは右向きになります。このコンポーネントはホストから `SNAP_EDGE_KEY` と `IS_VERTICAL_KEY` を読み取るため、plugin 開発者が手動で回転を設定する必要はありません。

## プロパティ

| プロパティ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `popoverId` | `string` | — (必須) | 内部の `AppPopover` に渡されるグローバルに一意な ID。モーダルマネージャーがこのドロップダウンを識別するために使用します |
| `popoverPlacement` | `'auto' \| 'top' \| 'bottom' \| 'left' \| 'right'` | `'auto'` | 優先するポップオーバーの表示位置。`auto` はホストの `POPOVER_PLACEMENT_HINT_KEY` に基づいて決定します |
| `active` | `boolean` | `false` | メインボタンをアクセントカラーでハイライトします (アクティブなツール状態に使用) |
| `disabled` | `boolean` | `false` | メインボタンとキャレットボタンの両方を無効化します。ツールチップはホバー可能なままです |
| `variant` | `'default' \| 'danger'` | `'default'` | メインボタンのビジュアルインテント |
| `mainTooltip` | `string` | — | ホバー時にメインボタンの上に表示されるツールチップ |
| `mainAriaLabel` | `string` | — | メインボタンのアクセシブルな名前 |
| `caretAriaLabel` | `string` | — | キャレットボタンのアクセシブルな名前 (スクリーンリーダーを使用する場合に必須) |
| `mainTestid` | `string` | — | メインボタンに転送される `data-testid` |
| `caretTestid` | `string` | — | キャレットボタンに転送される `data-testid` |

## スロット

| スロット | 説明 |
|---|---|
| `main-content` | メインボタン内にレンダリングされるコンテンツ (アイコン SVG、スウォッチなど) |
| `popover-content` | 開いているときにポップオーバー内にレンダリングされるコンテンツ (メニュー、サブパネル、オプションリスト) |

## イベント

| イベント | ペイロード | 説明 |
|---|---|---|
| `mainClick` | — | メインボタンのクリック。`disabled` が `true` の場合は抑制されます |
| `caretClick` | — | キャレットボタンのクリック (ポップオーバーの開閉切り替えは `AppPopover` が内部的に処理します)。ツールが非アクティブな状態でキャレットがクリックされたときにツールをアクティベートするなど、副作用のフックとして使用します |

## 最小構成の例

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { AppButtonDropdown } from '@openpen/module-api/uikit'

const isActive = ref(false)

function activate() {
  isActive.value = true
  // ...run primary action
}

function activateIfNeeded() {
  if (!isActive.value) isActive.value = true
}
</script>

<template>
  <AppButtonDropdown
    popover-id="shape"
    :active="isActive"
    main-tooltip="Shape tool"
    main-aria-label="Shape tool"
    caret-aria-label="Shape options"
    @main-click="activate"
    @caret-click="activateIfNeeded"
  >
    <template #main-content>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <rect x="4" y="4" width="16" height="16" rx="2" />
      </svg>
    </template>
    <template #popover-content>
      <div class="my-shape-picker">
        <!-- your option list / sub-panel goes here -->
      </div>
    </template>
  </AppButtonDropdown>
</template>
```

## レイアウトに関する注意事項

ラップ要素は水平コントロールバーではフレックスロー、垂直コントロールバーではフレックスカラムになります。キャレットはどちらの方向でもメインボタンの右側 (または下側) に常に配置されます。構造クラス `app-btn-dropdown-wrap`、`app-btn-dropdown-caret`、`app-btn-dropdown-caret-icon` はアンスコープドで公開されているため、ホスト (またはご自身の plugin テーマ) でコンテキストに応じたサイズを適用できます。例えば、OpenPen ホストでは `AppButtonDropdown` がインセットコントロールバーグループ内にある場合、キャレットの高さを 30 px に縮小しています。

ポップオーバーが開いているとき、キャレットボタンはアクセントハイライト用の `.active` クラスを受け取ります。ホストがコントロールバーのアニメーションをトリガーすると、内部の `AppPopover` は自動的に閉じます (手動での調整は不要です)。
