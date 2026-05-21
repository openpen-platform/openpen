---
title: コントロールバーレイアウト
description: コントロールバーのアイテム順序、グループ、セパレーターを制御する OpenPen 設定の JSON レイアウトスキーマです。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# コントロールバーレイアウト

コントロールバーレイアウトは、OpenPen の設定ファイルに JSON 構造として保存されています。
これを編集することで、plugin のコードに触れることなく、アイテムの順序の整理、視覚的なグループ化、セパレーターの制御が行えます。

---

## 設定ファイルの場所

OpenPen は Electron の userData ディレクトリにある `config.json` からレイアウト状態を読み書きします。

| OS | パス |
|---|---|
| macOS | `~/Library/Application Support/OpenPen/config.json` |
| Windows | `%APPDATA%\OpenPen\config.json` |
| Linux | `~/.config/OpenPen/config.json` |

レイアウトは、他のユーザー設定とともに `controlBarLayout` キーの下に保存されます。

> **編集前に**: まず OpenPen を終了してください。アプリはファイルをメモリに保持し、終了時に上書きするため、アプリ実行中に行った変更は失われます。

---

## スキーマ

```json
{
  "controlBarLayout": {
    "version": 1,
    "groups": [
      {
        "id": "tools",
        "items": ["freehand", "line", "shape"],
        "separator": "always",
        "inset": { "enabled": true }
      },
      {
        "id": "default",
        "items": ["color-picker", "stroke-width"],
        "separator": "auto"
      }
    ]
  }
}
```

### `version`

常に `1` です。将来のマイグレーション用に予約されています。

### `groups`

`LayoutGroup` オブジェクトの順序付き配列です。コントロールバーは、ここに記載された順序でグループを左から右に描画します。

**制約** (いずれかに違反した場合、次回起動時にレイアウトが組み込みデフォルトにリセットされます):
- `id: "default"` を持つグループが厳密に 1 つ含まれている必要があります。
- グループの `id` は一意である必要があります。
- アイテム id は複数のグループに含めることができません。

---

## `LayoutGroup` フィールド

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | `string` (ケバブケース) | **yes** | 一意のグループ識別子。`"default"` はグループ未分類アイテム用に予約されています。 |
| `items` | `string[]` | **yes** | このグループのアイテムの contribution id の順序付きリスト。 |
| `separator` | `'auto' \| 'always' \| 'never'` | no | このグループの前の視覚的な区切り線 (デフォルト: `'auto'`)。 |
| `inset` | `GroupInset` | no | 存在し `enabled: true` の場合、グループを背景とボーダーのコンテナ付きで描画します。 |

### `separator` の値

| 値 | 動作 |
|---|---|
| `'auto'` | このグループの前にセパレーターが描画されます (デフォルト)。将来のバージョンでは、隣接するグループが同じ module 起源を共有する場合にセパレーターが省略されます。 |
| `'always'` | このグループの前には常にセパレーターが描画されます。 |
| `'never'` | このグループの前にはセパレーターが描画されません。 |

### `GroupInset` フィールド

| フィールド | 型 | 必須 | 説明 |
|---|---|---|---|
| `enabled` | `boolean` | **yes** | ビジュアルコンテナを有効にするには `true` に設定します。 |
| `color` | `string` | no | インセット背景の CSS カラーオーバーライド。デフォルトは `--openpen-color-control-group` です。 |

`inset.enabled` が `true` の場合、グループはアイテムを視覚的にまとめる角丸コンテナ付きで描画されます (「グループ化されたツール」の見た目)。コンテナの高さはアンラップされた 36 px のボタンに合わせられます — インセットを有効にしてもバーの高さは変わりません。

---

## アイテムが id を取得する方法

各アイテムの id は、module の `ControlBarContribution` の `id` フィールドから取得されます。

```ts
// packages/module-api/src/types/control-bar-layout.ts
interface ControlBarContribution {
  id: string       // globally unique across all modules — use "pluginId-itemName"
  component: Component
  defaultGroup?: string
  groupHint?: {
    separator?: 'auto' | 'always' | 'never'
    label?: string | LocaleMap
  }
}
```

plugin 作者は、初回インストール時のヒントとして `defaultGroup` と `groupHint` を宣言します。
**ユーザーのレイアウトが保存されると、それが常に優先されます** — ヒントは、アイテムにまだ保存された配置がない場合にのみ適用されます。

---

## リコンサイレーション (新しい plugin がインストールされたときの動作)

OpenPen が読み込み時に、保存されたレイアウトグループに存在しない plugin アイテムを検出した場合:

1. アイテムはその `defaultGroup` (`ControlBarContribution.defaultGroup` から) に割り当てられます。
2. その グループが保存されたレイアウトにまだ存在しない場合、ホストはアイテムの `groupHint` をセパレーターとラベルに使用して自動的に作成します。
3. `defaultGroup` が宣言されていない場合、アイテムは `"default"` に追加されます。

保存されたレイアウトにすでに存在するアイテムは移動されません。つまり、新しい plugin をインストールしても、既存のアイテムの配置が乱れることはありません。

---

## バリデーションと破損からの復旧

OpenPen は起動時に 3 層のバリデーションを適用します。

| レイヤー | チェック内容 | 失敗時 |
|---|---|---|
| **L1** — JSON パース | ファイルが有効な JSON であるか | すべてのユーザー設定をデフォルトにリセット |
| **L2** — スキーマ | `controlBarLayout` が想定される形状に一致するか | レイアウトのみ組み込みデフォルトにリセット。他の設定は保持される |
| **L3a** — 修復 | `'default'` グループの欠落、無効な `separator` 値 | データ損失なしにその場で修復。`console.info` メッセージをログに記録 |

L2 のリセットはレイアウトにのみ影響します — テーマ、言語、ショートカットは変更されません。

---

## 関連情報

- [Contribution Slot カタログ](../slots/ui#ui-control-bar) — `ui.control-bar` slot と `ControlBarContribution` 型
- [Module アーキテクチャ](../concepts/module-architecture.md) — 組み込みおよび plugin module が contribution を宣言する方法
