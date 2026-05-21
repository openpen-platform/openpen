---
title: UI スロット
description: コントロールバーアイテム、設定パネル、カーソル、ステータスバッジ、モーダル、システムトレイ/コンテキストメニュー向けの 9 つの contribution スロット。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# UI スロット

UI スロットは、ホストのクロームでレンダリングされるすべてのものを対象とします。コントロールバーアイテム、設定パネルとタブ、ツールごとのカーソル、ステータスバッジ、管理されたモーダル、システムトレイのメニューエントリ、コンテキストメニュー、テーマトークンのオーバーライドが含まれます。

## `ui.control-bar` — ✅ 利用可能 {#ui-control-bar}

- **Contribution キー**: `controlBar`
- **型**: `ControlBarContribution[]`
- **目的**: コントロールバー内のボタン/スライダー/ポップアップトリガー。グループとアイテムの順序は、`config.json` の `controlBarLayout` キーを通じてユーザーが設定できます。完全なスキーマは [コントロールバーレイアウト](../reference/control-bar-layout.md) を参照してください。
- **順序**: module が宣言するものではありません。ユーザーが設定するまで、アイテムは `'default'` グループに配置されます。新しいグループは `defaultGroup` + `groupHint` を通じて提案できます (以下を参照)。

### `ControlBarContribution` 型

```ts
interface ControlBarContribution {
  id: string            // MUST be globally unique across all modules.
  component: Component  // Vue component rendered as the bar item.
  defaultGroup?: string // Preferred group on first install. Omit → 'default'.
  groupHint?: {
    separator?: 'auto' | 'always' | 'never'
    // 'auto'   — host decides based on neighbouring groups (default).
    // 'always' — force a visual divider before this item's group.
    // 'never'  — suppress any auto-divider (use for tightly coupled items).
    label?: string | LocaleMap  // Display name for the auto-created group.
  }
}
```

`defaultGroup` と `groupHint` は**ヒントのみ**です。初回インストール後は、ユーザーの保存済みレイアウトが常にこれらより優先されます。

## `ui.settings.panels` — ✅ 利用可能 {#ui-settings-panels}

- **Contribution キー**: `settingsPanels`
- **型**: `SettingsPanelContribution[]`
- **目的**: 設定ウィンドウの **Features** タブ内のセクション。module ごとにグループ化されます。module の設定の推奨された出発点で、module が有効または無効になると、パネルは自動的に表示・非表示になります。

### `SettingsPanelContribution` 型

```ts
interface SettingsPanelContribution {
  id: string                      // unique within this module
  label: string | LocaleMap       // section heading shown above the component
  component: Component            // Vue component rendered as the section body
}
```

> **`settingsPanels` と `settingsTabs` の使い分け**: 1 つか 2 つの設定行には `settingsPanels` を使用してください。module がリッチなマルチセクションレイアウトを必要とする場合にのみ専用タブを使用してください。完全な判断基準は [guides/module-settings.md](../guides/module-settings.md) を参照してください。

## `ui.settings.tabs` — ✅ 利用可能 {#ui-settings-tabs}

- **Contribution キー**: `settingsTabs`
- **型**: `SettingsTabContribution[]`
- **目的**: 設定ウィンドウ内の専用トップレベルタブ。各 contribution は、フル幅の Vue コンポーネントと i18n ラベルで構成されます。module がリッチなレイアウト制御 (複数のサブセクション、プレビューエリアなど) を必要とする場合を除き、`settingsPanels` を優先してください。

## `ui.cursors` — ✅ 利用可能 {#ui-cursors}

- **Contribution キー**: `cursors`
- **型**: `CursorContribution[]`
- **目的**: 描画モードがアクティブな間、ツールごとにレンダリングされる DOM カーソル。ホストは OS カーソルを非表示にし (`cursor: none`)、対応するカーソルの SVG/PNG をマウスに追従する DOM 要素としてマウントします。OS コンポジターを完全にバイパスするため、macOS の透明なオーバーレイ上でもカーソルが確実にレンダリングされます。

### Contribution の形状

```ts
interface CursorContribution {
  /** MUST match the `id` of the `ToolContribution` this cursor activates for. */
  id: string
  cursor: CursorSpec
}

type CursorSpec = string | SvgCursorSpec | PngCursorSpec

interface SvgCursorSpec {
  svg: string                  // inline `<svg>...</svg>` OR plugin-relative path
  hotspot?: { x: number; y: number }   // default `{x:0, y:0}`
  fallback?: string            // CSS keyword fallback, default `'crosshair'`
}

interface PngCursorSpec {
  png: string                  // plugin-relative path; no inline form
  hotspot?: { x: number; y: number }
  fallback?: string
}
```

**リンケージルール (重要)。** `CursorContribution` の `id` フィールドは、このカーソルを有効にしたい `ToolContribution` (`canvas.tools` 内) の `id` と一致しなければなりません。ホストは、ツールが変わるたびに `id` の完全一致によってカーソルをツールに対応付けます。登録済みツールのいずれにも一致しない `id` は無害ですが、効果がありません (ホストはそのツールのデフォルトカーソルにフォールバックします)。

### DX パターン

1. **CSS キーワード (レガシー)** — `{ id, cursor: 'crosshair' }`。32 個の W3C カーソルキーワードのみ受け付けます。この場合、ホストはデフォルトの DOM カーソルをレンダリングします (キーワード自体は CSS にルーティングされません)。
2. **インライン SVG** — `{ id, cursor: { svg: '<svg>…</svg>', hotspot: { x, y } } }`。ホストは `compileCursor()` 内で DOMPurify を通じてマークアップを処理してから `v-html` 経由でマウントします。
3. **Vite `?raw` インポート** — `import laserSvg from './laser.svg?raw'` の後 `{ svg: laserSvg, hotspot: … }`。インラインと同様で、ビルド時にファイルの内容がインライン化されます。
4. **相対パス** — `{ svg: 'assets/laser.svg' }` または `{ png: 'assets/stamp.png' }`。ホストは `openpen-plugin://<hostname>/<path>` に解決し、マウント時に `compileCursor()` 内でフェッチします。SVG パスは DOMPurify を通過し、PNG パスは `<img>` でラップされます (ラスター画像は DOM コンテキストでは不活性です)。

URL 形式 (`http://`、`https://`、`data:`、`file://`、`openpen-plugin://`)、絶対パス、`..` トラバーサルは登録時に拒否されます。

### 現在のストロークカラーによるテーマ設定

ホストはアクティブなストロークカラーを `document.documentElement` 上の CSS カスタムプロパティとして公開します。

```
--openpen-cursor-accent
```

カーソルの SVG では、fill/stroke 属性でこれを参照することで、ユーザーの色選択に追従できます。

```html
<circle fill="var(--openpen-cursor-accent, #818cf8)" ... />
<line stroke="var(--openpen-cursor-accent, #818cf8)" ... />
```

ユーザーがグラデーションを選択した場合、この変数はグラデーションの `from` エンドポイントに解決されます (カーソルはアクセントスロットを 1 つしか持ちません)。フォールバック (`var()` の第 2 引数) は、最初のストロークスタイルイベントが発生するまでの短い間をカバーします。デザインに合った適切なデフォルトを選択してください。

これはオプトイン方式です。fill カラーをハードコードしたカーソルは、ユーザーの選択とは独立したままです。組み込みの `freehand`、`line`、`shape` カーソルはこの慣習に従っています。`eraser` (消しゴムのほこりはニュートラルなグレー) と `stroke-eraser` (赤と藍色の組み合わせが「ストローク全体を削除」を意味する) は意図的に使用していません。

### セキュリティ上の契約 (plugin 作者が知っておくべきこと)

- 埋め込まれた `<script>`、`onload=`、`onclick=`、`<foreignObject>`、外部の `<image href>` / `<use href>` は、マークアップが `v-html` に渡される前に DOMPurify によって除去されます。サニタイズはカーソルがマウントされる瞬間 (アクティブツールが変わるとき) に `compileCursor()` 内で実行されます。登録時ではありません。パブリック API に対して作成された plugin は、自分で DOMPurify を呼び出す必要はありません。
- 登録時、ホストはすべてのカーソル contribution を厳格な許可リストに正規化し (`id`、`cursor.svg | cursor.png`、`cursor.hotspot`、`cursor.fallback` のみ通過)、ホスト側に**不変のフリーズされたスナップショット**を保存します。`setup()` から `myModule.contributes.cursors[0].cursor` を変更しても、plugin 自身のコピーは変更されますが、ホストがレンダリングするものには影響しません。ホストは自身のスナップショットから読み取ります。レンダリングされるカーソルを変更する唯一の方法は、新しい module バージョンをリリースすることです。
- レガシーの `cursor: string` 形式は、`url(`、`image-set(`、`-webkit-image-set(`、`javascript:`、`expression(` を含む値を拒否します。

## `ui.status` — ✅ 利用可能 {#ui-status}

- **Contribution キー**: `status`
- **型**: `StatusContribution[]`
- **目的**: コントロールバー上の一時的なステータスバッジ (録画インジケーター、同期状態)。

## `ui.modals` — ✅ 利用可能 {#ui-modals}

- **Contribution キー**: `modals`
- **型**: `ModalContribution[]`
- **目的**: グローバルモーダルスタックで管理される登録済みモーダル。フォーカストラップ、ESC による閉じる機能、重複防止を提供するため、plugin がこれらの基本機能を再実装する必要はありません。

## `ui.tray.menu` — ⏳ 予約済み {#ui-tray-menu}

- **Contribution キー**: `trayMenu`
- **型**: `TrayMenuContribution[]`
- **目的**: システムトレイのメニューアイテム (組み込みの表示/非表示/終了と並列)。
- **予約の理由**: トレイマネージャーがまだ plugin の contribution を使用していません。

## `ui.context.menu` — ⏳ 予約済み {#ui-context-menu}

- **Contribution キー**: `contextMenu`
- **型**: `ContextMenuContribution[]`
- **目的**: キャンバス、ツールバー、またはトレイ上の右クリックコンテキストメニューアイテム。
- **予約の理由**: コンテキストメニューの UI デザインがまだ確定していません。フォローアップで実装予定です。

## `ui.theme.tokens` — ⏳ 予約済み {#ui-theme-tokens}

- **Contribution キー**: `themeTokens`
- **型**: `ThemeTokenContribution`
- **目的**: module が提供する CSS カスタムプロパティ (カラースウォッチ、スペーシングトークン、グラデーションプリセット)。
- **予約の理由**: 最初の利用者はカラーパレット plugin が想定されています。その plugin が登場したときにスロットを構築します。
