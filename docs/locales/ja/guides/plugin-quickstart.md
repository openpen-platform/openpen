---
title: Plugin クイックスタート
description: ゼロから動作する OpenPen plugin を5分で作成します。
translationType: machine
translatedFrom: 36c1264
translatedAt: 2026-05-22T07:00:00Z
language: ja
---

# Plugin クイックスタート

ゼロから動作する OpenPen plugin を5分で作成します。

## 前提条件

- Node.js 20+、npm 9+
- OpenPen 1.0 以降がインストール済みであること

---

## ステップ 1 — スターターテンプレートからスキャフォールド

```bash
npx openpen-cli create @yourscope/my-plugin
cd my-plugin
npm install
```

`yourscope` は GitHub のユーザー名または組織名 (小文字) に置き換えてください。
`openpen create` は plugin-starter テンプレートをコピーし、id を置換して次のステップを表示します。

> **手動スキャフォールドの注意点**: `openpen-cli create` をスキップして
> plugin-starter を手動でコピーする場合、以下の3箇所を必ず同期させてください。
> これらはすべて plugin の id を宣言しており、不一致があると `useModuleContext()` が
> 実行時にエラーをスローします:
> - `plugin.json` → `"id"`
> - `src/module-id.ts` → `MODULE_ID`
> - `src/index.ts` 内の `defineModule({ id })` (通常は `module-id.ts` からインポート)

## ステップ 2 — ビルド

```bash
npm run build    # outputs dist/renderer.js
npm run dev      # watch mode during development
```

## ステップ 3 — テスト用にローカルインストール

CLI を使用して、ビルド済み plugin をホストの plugin ディレクトリにコピーします:

```bash
npx openpen-cli plugin add .
```

`openpen plugin add <local-path>` は `plugin.json`、`dist/`、および `locales/` (存在する場合) を
`~/.openpen/plugins/@yourscope/my-plugin/` にコピーします。ホストは起動時にこのディレクトリをスキャンします。詳細は
チュートリアルの [実装例](../tutorials/build-your-first-plugin.md#2-install-for-local-development) を参照してください。

> ディスク上のファイルは全体の半分に過ぎません。`plugin-meta.json` は次回 OpenPen が起動する際に
> ホストによって再構築されます。`plugin add` が返った後の動作については
> [`plugin-meta.json` の所有権](../concepts/plugin-compatibility.md#plugin-meta-json-ownership)
> を参照してください。

### 手動インストール (代替手段)

CLI が利用できない場合、同等のシェルコマンドは以下のとおりです:

```bash
mkdir -p ~/.openpen/plugins/@yourscope/my-plugin
cp -R plugin.json dist ~/.openpen/plugins/@yourscope/my-plugin/
```

## ステップ 4 — アプリでテスト

OpenPen を再起動し、コントロールバーに contribution が表示されることを確認します。

> [!IMPORTANT]
> plugin の読み込みには OpenPen の**プロダクションビルド**が必要です
> (`npm run build` の出力またはパッケージ化されたリリース)。Vite の開発サーバー (ホストリポジトリでの `npm run dev`)
> は plugin を読み込みません。`~/.openpen/plugins/` にインストールされた plugin は開発モードではスキップされます。
> 「plugin が読み込まれない」問題をデバッグする前に、パッケージ化された OpenPen を実行していることを確認してください。

---

## プロジェクト構成

```
my-plugin/
├── plugin.json             ← Manifest the host scans (id, version, etc.)
├── package.json            ← devDeps: @openpen/build, @openpen/module-api
├── tsconfig.json           ← Optional, used by `npm run check`
└── src/
    ├── module-id.ts        ← Single source of truth for the plugin's id
    ├── index.ts            ← Default-exports an OpenPenModule
    └── *.vue / *.ts        ← Your plugin's components & helpers
```

`src/module-id.ts` は単一の `MODULE_ID` 定数をエクスポートします。`index.ts` 内の `defineModule({ id })` と、plugin の id を参照する他のコードパスがここからインポートします。id を1箇所に集約するのは、上記の注意点で説明している規則です。詳細なパターンは [tutorials/build-your-first-plugin.md](../tutorials/build-your-first-plugin.md) のサンプルを参照してください。

---

## module エントリーポイント

すべての plugin は `src/index.ts` から `OpenPenModule` オブジェクトをデフォルトエクスポートしなければなりません。
標準的な方法は `@openpen/module-api` の `defineModule()` を使用することです:

```ts
import { defineModule } from '@openpen/module-api'
```

インポートパスは**パッケージルート**です。サブパスエクスポートは不要です。

### 最小構成の `src/index.ts`

```ts
import { defineModule } from '@openpen/module-api'
import MyButton from './MyButton.vue'

export default defineModule({
  id: '@yourscope/my-plugin',            // @scope/name format, globally unique
  contributes: {
    controlBar: [{ id: 'my-btn', component: MyButton }],
  },
})
```

`defineModule()` は `contributes` に対して完全な TypeScript 型推論を提供し、
module 自身のビルド境界で id フォーマットと slot キーの整合性チェックを実行します
(ホストの読み込み時に深部でエラーが発生するのではなく、リポジトリ内でエラーが表面化します)。

`OpenPenModule` インターフェースと利用可能なすべての `contributes` キーについては、
[module-architecture.md](../concepts/module-architecture.md) を参照してください。

---

## `contributes` の役割

`contributes` は slot をキーとした型付きマップです。必要なものを組み合わせて使用し、
少なくとも1つのエントリーを追加してください。

```ts
import { defineModule, z } from '@openpen/module-api'

export default defineModule({
  id: 'my-plugin',
  settingsSchema: z.object({ opacity: z.number().default(0.8) }),
  contributes: {
    tools: [{ id: 'my-tool', /* onPointerDown/Move/Up + renderStroke — see slots.md */ }],
    cursors: [{ id: 'my-tool', cursor: { svg: '<svg .../>', hotspot: { x: 4, y: 20 } } }],
    controlBar: [{ id: 'btn', component: MyBtn }],
    settingsPanels: [{ id: 'prefs', label: { en: 'My Plugin' }, component: MyPrefsPanel }],
    shortcuts: [{
      id: 'do-thing',
      keys: 'CommandOrControl+Alt+D',
      scope: 'global',
      label: { en: 'Do the thing' },
      userCustomizable: true,
      handler() {},
    }],
  },
})
```

- `tools` は描画ツールを登録します。`ToolContribution` インターフェース (id、ラベル、アイコン、ポインターハンドラー、オプションの `renderStroke`) については [`canvas.tools`](../slots/canvas#canvas-tools) を参照してください。
- `cursors` はカスタム DOM カーソルをツールに関連付けます。`CursorContribution` の `id` は対応する `ToolContribution` の `id` と一致しなければなりません。カーソル形状オプション (インライン SVG / 相対パス / PNG) と `--openpen-cursor-accent` テーマ規則については [`ui.cursors`](../slots/ui#ui-cursors) を参照してください。
- `settingsPanels` は**設定 → 機能**にセクションを追加します。専用タブ全体が必要な module の場合のみ `settingsTabs` を使用してください。
- `label` と `userCustomizable: true` を持つ shortcut は**設定 → ショートカット**の module グループに表示され、ユーザーがキーバインドを変更できます。両方を省略すると、宣言したデフォルトでサイレントに動作します。
- OS の一般的なキーバインドと衝突しないアクセラレーターのデフォルトを選択してください。`globalShortcut.register` が拒否された場合、ランタイムはコンソールエラーを記録します。

設定 API (`getSettings`、`updateSettings`、`onSettingsChange`) については [guides/module-settings.md](./module-settings.md) を参照してください。

slot のカタログ全体については [slots/index.md](../slots/index.md) を参照してください。

---

## 境界ルール

plugin のコードがインポートできるのは以下のみです:

- plugin 内の相対パス
- `@openpen/module-api` (SDK)
- `node:*` (メインサイドハンドラーのみ)
- サードパーティの npm パッケージ

ホストの内部実装 (`src/services/...` など) のインポートはホストの境界テストで拒否されます。SDK が必要なものをすべて公開しています。

### よくある落とし穴

**`zod` は `@openpen/module-api` からインポートする必要があります。** `zod` はビルド CLI によって外部化され、実行時にホストの importmap を通じて解決されます。`import { z } from 'zod'` を直接使用すると、プロダクションビルドで未解決のスペシファイアエラーが発生します。常に以下を使用してください:

```ts
import { z } from '@openpen/module-api'
```

**`@openpen/module-api/uikit` も外部化されています。** ビルド CLI がこれを自動的に処理します。`rollupOptions.external` をオーバーライドする場合は、`'vue'`、`'@openpen/module-api'`、`'@openpen/module-api/uikit'` の3つすべてを含めてください。

---

## UIKit コンポーネントの使用

OpenPen は UIKit ラッパーコンポーネントを提供しており、追加作業なしで plugin がホストのビジュアルスタイルに合わせられます。コンポーネントリファレンス全体は [uikit/index.md](../uikit/index.md) を参照してください。

簡単な例 — スライダーポップオーバーを開くボタン:

```vue
<script setup lang="ts">
import { AppPopover, AppSlider } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const value = ref(50)
</script>

<template>
  <AppPopover popover-id="my-slider" placement="auto">
    <template #trigger="{ active }">
      <button class="cb-btn" :class="{ active }">Slider</button>
    </template>
    <template #content>
      <AppSlider v-model="value" :min="0" :max="100" width="120px" />
    </template>
  </AppPopover>
</template>
```

フィードバックやステータスメッセージには `AppBanner` を使用します:

```vue
<script setup lang="ts">
import { AppBanner } from '@openpen/module-api/uikit'
import { ref } from 'vue'

const saveError = ref<string | null>(null)
</script>

<template>
  <AppBanner v-if="saveError" variant="error" inline>{{ saveError }}</AppBanner>
</template>
```

利用可能なバリアント: `info`、`warning`、`success`、`error`。`inline` プロパティを指定すると、ダイアログやフォームエリアに適したコンパクトな1行レイアウトに切り替わります。

---

## 次のステップ

- **公開** → [guides/publishing.md](./publishing.md) — 配布用ビルド
- **module 設定** → [guides/module-settings.md](./module-settings.md) — settingsSchema、useModuleContext、パネルとタブ
- **UIKit API 全体** → [uikit/index.md](../uikit/index.md)
- **カスタム UIKit コンポーネント** → [uikit/custom-components.md](../uikit/custom-components.md) — バンドル済みラッパーを超えたウィジェットの作成 (タグ入力、数値スピナー、コンボボックス)
- **デザイントークン** → [reference/design-tokens.md](../reference/design-tokens.md) — スタイルが継承するホストパレット
- **すべての contribution slot** → [slots/index.md](../slots/index.md)
- **エスケープハッチプリミティブ** → [uikit/primitives.md](../uikit/primitives.md)
- **アーキテクチャの詳細** → [module-architecture.md](../concepts/module-architecture.md)
