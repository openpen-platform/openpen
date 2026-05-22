---
title: はじめての OpenPen plugin を作る
description: openpen-cli ツールチェーンを使って、plugin のスキャフォールディングからビルド、インストール、公開まで、ゼロから OpenPen 上で動かすまでの手順を解説します。
translationType: machine
translatedFrom: 36c1264
translatedAt: 2026-05-22T07:00:00Z
language: ja
---

# はじめての OpenPen plugin を作る

このチュートリアルでは、`openpen` CLI を使って plugin のスキャフォールディング、ビルド、OpenPen へのインストール、そしてコミュニティカタログへの公開までを一通り体験します。

## 前提条件

- Node.js 20+、npm 9+
- OpenPen 1.0 以降がインストールされ、起動していること
- TypeScript をサポートするコードエディター
- `gh` CLI がインストールされ、認証済みであること (`gh auth login`) — `openpen publish` に必要

---

## 1. プロジェクトのスキャフォールディング

```bash
npx openpen-cli create @yourscope/my-highlighter
cd my-highlighter
npm install
```

`yourscope` は GitHub のユーザー名または組織名 (小文字) に置き換えてください。
`openpen create` は plugin-starter テンプレートをコピーし、id のプレースホルダーを置換して、次のステップを出力します。

以下のようなフォルダー構成が生成されます。

```
my-highlighter/
├── plugin.json         # manifest the host scans at load time
├── package.json        # devDeps: @openpen/build, @openpen/module-api
├── tsconfig.json
└── src/
    └── index.ts        # default-exports a defineModule({...}) call
```

> **`plugin.json` vs `package.json`**: `plugin.json` はロード時に OpenPen が読み込むファイルです。`package.json` は Node.js のビルドツールチェーン専用です。

---

## 2. ローカル開発用インストール

plugin をビルドして、ローカルのソースディレクトリから直接インストールします。

```bash
npm run build
npx openpen-cli plugin add .
```

`openpen plugin add <local-path>` は `plugin.json`、`dist/`、および `locales/` (存在する場合) を `~/.openpen/plugins/@yourscope/my-highlighter/` にコピーします。インストール時にマシン上でビルドは実行されません — ビルド済みの `dist/` がそのまま使用されます。

CLI はファイルの書き込みのみを行います。`plugin-meta.json` はホストの責務であり、次回起動時に再構築されます。インストールが反映されたことを確認する方法を含む完全な lifecycle については、[`plugin-meta.json` の所有権](../concepts/plugin-compatibility.md#plugin-meta-json-ownership)を参照してください。

OpenPen を再起動すると、plugin が自動的に読み込まれ、その contribution がコントロールバーに表示されます。

> [!IMPORTANT]
> plugin の読み込みには OpenPen の**プロダクションビルド**
> (`npm run build` の出力 / パッケージ済みリリース) が必要です。Vite の開発サーバー (ホストリポジトリの `npm run dev`)
> では plugin を読み込み**ません**。「plugin が読み込まれない」問題をデバッグする前に、パッケージ済みの
> OpenPen が実行されていることを確認してください。

### 手動インストール (代替手段)

CLI を使わずにインストールする場合は以下の通りです。

```bash
npm run build
mkdir -p ~/.openpen/plugins/@yourscope/my-highlighter
cp -R plugin.json dist ~/.openpen/plugins/@yourscope/my-highlighter/
```

---

## 3. `src/index.ts` の構造

すべての plugin は `OpenPenModule` オブジェクトをデフォルトエクスポートする必要があります。`@openpen/module-api` の `defineModule()` を使用してください。

```ts
import { defineModule } from '@openpen/module-api'
import HighlighterButton from './HighlighterButton.vue'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'

export default defineModule({
  id: '@yourscope/my-highlighter',
  version: '0.1.0',
  contributes: {
    controlBar: [
      {
        id: 'highlighter',
        component: HighlighterButton,
      },
    ],
    locales: { en, 'zh-Hant': zhHant },
  },
})
```

設定画面の「Settings → Modules」に表示される表示名と説明は、`locales/en.json` の 2 つの**予約キー**から取得されます。

```json
{
  "name": "Highlighter",
  "description": "Highlights text on screen."
}
```

### 主要フィールド

| フィールド | 型 | 備考 |
|------------|------|------|
| `id` | `string` | `@scope/name` 形式、小文字。カタログ内でグローバルに一意である必要があります。 |
| `version` | `string` | SemVer。サードパーティ plugin では必須です。 |
| `minAppVersion` | `string` | 省略可能。動作中のホストが古い場合、OpenPen はその plugin を拒否します。 |
| `contributes` | `ModuleContributions` | 少なくとも 1 つの slot エントリーが必要です。 |
| `setup` | `(ctx) => void` | 省略可能なワンショット初期化フック — manifest の検証後に 1 回実行されます。 |

### `contributes` — slot の選択

`contributes` は slot 名をキーとする型付きマップです。必要なものを組み合わせて使用できます。

```ts
contributes: {
  controlBar: [...],        // buttons in the floating control bar
  tools: [...],             // drawing tool implementations
  settingsTabs: [...],      // a tab in Settings > (Your Plugin)
  shortcuts: [...],         // global keyboard shortcuts
  cursors: [...],           // custom cursor per tool
  // ...and more — see slots/index.md
}
```

`defineModule()` はすべての slot に対して完全な TypeScript 推論を提供し、ビルド時に id フォーマットのチェックを行うため、ホストが plugin を参照する前にリポジトリ内でエラーが検出されます。

### 実例 — 描画ツール + カスタムカーソル

スターターのスキャフォールドはコントロールバーボタンを contribution します。実際にキャンバス上に描画できる描画ツールにするには、`tools` と `cursors` を追加します。Tool コントラクトの重要な詳細: **3 つのポインターハンドラーはすべて第 1 引数としてライブの `canvasCtx` を受け取ります**。ツールは `onPointerMove` 中にインクリメンタルに描画します。`Stroke` を返すのは `onPointerUp` のみで (他は `void` を返します)、返された `Stroke` は `id` (一意) と `tool` (`ToolContribution.id` と一致) を必ず持つ必要があります。

```ts
// src/highlighter-tool.ts
import { resolveStrokeColor } from '@openpen/module-api'
import type { Tool, Stroke, Point, StrokeStyle } from '@openpen/module-api'

const HIGHLIGHTER_ALPHA = 0.35
const HIGHLIGHTER_WIDTH_MUL = 3

export function createHighlighterTool(toolId: string): Tool {
  let points: Point[] = []
  let style: StrokeStyle | null = null
  let prev: Point | null = null

  function applyStyle(ctx: CanvasRenderingContext2D, s: StrokeStyle): void {
    ctx.globalAlpha = HIGHLIGHTER_ALPHA
    ctx.strokeStyle = resolveStrokeColor(s.color)
    ctx.lineWidth = s.lineWidth * HIGHLIGHTER_WIDTH_MUL
    ctx.lineCap = 'square'
    ctx.lineJoin = 'miter'
  }

  return {
    needsPreviewRedraw: false,

    onPointerDown(_canvasCtx, point, s) {
      points = [point]
      style = { ...s }
      prev = point
    },

    onPointerMove(canvasCtx, point) {
      if (!style || !prev) return
      points.push(point)
      canvasCtx.save()
      applyStyle(canvasCtx, style)
      canvasCtx.beginPath()
      canvasCtx.moveTo(prev.x, prev.y)
      canvasCtx.lineTo(point.x, point.y)
      canvasCtx.stroke()
      canvasCtx.restore()
      prev = point
    },

    onPointerUp(_canvasCtx, point): Stroke | null {
      if (!style) return null
      points.push(point)
      const stroke: Stroke = {
        id: crypto.randomUUID(),
        tool: toolId,
        points: [...points],
        style: { ...style },
        // tool-specific extras: survive into renderStroke for history replay
        alpha: HIGHLIGHTER_ALPHA,
        widthMul: HIGHLIGHTER_WIDTH_MUL,
      }
      points = []
      style = null
      prev = null
      return stroke
    },
  }
}

export function renderHighlighter(
  canvasCtx: CanvasRenderingContext2D,
  stroke: Stroke,
): void {
  if (stroke.points.length < 2) return
  const alpha = (stroke.alpha as number) ?? HIGHLIGHTER_ALPHA
  const widthMul = (stroke.widthMul as number) ?? HIGHLIGHTER_WIDTH_MUL
  canvasCtx.save()
  canvasCtx.globalAlpha = alpha
  canvasCtx.strokeStyle = resolveStrokeColor(stroke.style.color)
  canvasCtx.lineWidth = stroke.style.lineWidth * widthMul
  canvasCtx.lineCap = 'square'
  canvasCtx.lineJoin = 'miter'
  canvasCtx.beginPath()
  canvasCtx.moveTo(stroke.points[0].x, stroke.points[0].y)
  for (let i = 1; i < stroke.points.length; i++) {
    canvasCtx.lineTo(stroke.points[i].x, stroke.points[i].y)
  }
  canvasCtx.stroke()
  canvasCtx.restore()
}
```

```ts
// src/module-id.ts — single source of truth for the plugin's id
export const MODULE_ID = '@scope/highlighter'
```

```ts
// src/index.ts
import { defineModule } from '@openpen/module-api'
import { MODULE_ID } from './module-id'
import { createHighlighterTool, renderHighlighter } from './highlighter-tool'

const TOOL_ID = 'highlighter'

const highlighterCursor = {
  svg:
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">' +
      // chunky marker body — fill follows the user's stroke color via the
      // --openpen-cursor-accent convention.
      '<rect x="6" y="3" width="9" height="14" rx="1.5" ' +
        'fill="var(--openpen-cursor-accent, #ffeb3b)" stroke="#111" stroke-width="1.2"/>' +
      '<polygon points="6,17 15,17 12,22 9,22" fill="#111"/>' +
    '</svg>',
  hotspot: { x: 10, y: 22 },     // bottom tip
  fallback: 'crosshair' as const,
}

export default defineModule({
  id: MODULE_ID,
  version: '0.1.0',
  metadata: { name: { en: 'Highlighter' } },
  contributes: {
    tools: [{
      id: TOOL_ID,
      label: { en: 'Highlighter' },
      icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="3" width="9" height="14" rx="1"/><polygon points="6,17 15,17 12,22 9,22"/></svg>',
      ...createHighlighterTool(TOOL_ID),
      renderStroke: renderHighlighter,
    }],
    cursors: [{
      id: TOOL_ID,                      // MUST match the tool's id
      cursor: highlighterCursor,
    }],
  },
})
```

注目すべき点:

1. **Tool コントラクト** — `onPointerDown(canvasCtx, point, style)` は状態を初期化しますが `void` を返します。`onPointerMove(canvasCtx, point)` はライブの `canvasCtx` 上にインクリメンタルに描画します。`onPointerUp(canvasCtx, point)` のみが `Stroke` を返すハンドラーで、返されたオブジェクトがホストによって undo/redo 用に保存されます。
2. **Stroke は値オブジェクト** — `id` (一意、慣例として `crypto.randomUUID()` を使用) + `tool` (`ToolContribution.id` と一致) + ポイント + スタイル + 履歴の再現のために保持したいツール固有の追加データを持ちます。
3. **`renderStroke` は履歴再現フック** — undo/redo やリサイズ時に、キャンバスエンジンはすべてのストロークに対して `renderStroke(canvasCtx, stroke)` を呼び出して再現します。デフォルトのポリラインを超えるエフェクト (アルファ、カスタム幅、グラデーション処理) で描画するツールは必ず提供してください。プレーンなポリラインで描画するツールは省略できます。
4. **`StrokeColor` はユニオン型** — `string | { type: 'linear'; from: string; to: string }` です。カスタムレンダラーは両方を処理する必要があります。上記のスニペットは `@openpen/module-api` の `resolveStrokeColor(color)` を使用して、`ctx.strokeStyle` に使用する代表的な CSS カラー (線形グラデーションの場合は `color.from`) を取得しています。
5. **カーソルとツールの紐付け** — `CursorContribution.id === ToolContribution.id` です。id を正確に一致させないと、ホストはデフォルトカーソルにフォールバックします。

ビルドしてインストールすると、ホストの読み込み時にコントロールバーに新しいツールが表示されます。`ToolContribution` + `Tool` + `Stroke` + `StrokeStyle` インターフェースの完全な仕様は [`canvas.tools`](../slots/canvas#canvas-tools) を、`CursorContribution` の形状と `--openpen-cursor-accent` テーマ規則は [`ui.cursors`](../slots/ui#ui-cursors) を参照してください。

---

## 4. `ctx.t()` と `ctx.notify()` を使った `setup` フックの追加

`locales/en.json` にはすべての翻訳可能な文字列を記載します。`name` と `description` キーは Modules マネージャー UI 向けに予約されており、実行時の文字列は別途追加します。

```json
{
  "name": "Highlighter",
  "description": "Highlights text on screen.",
  "notif": { "ready": "Highlighter loaded" }
}
```

```ts
import { defineModule } from '@openpen/module-api'
import HighlighterButton from './HighlighterButton.vue'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'

export default defineModule({
  id: '@yourscope/my-highlighter',
  version: '0.1.0',
  contributes: {
    controlBar: [{ id: 'highlighter', component: HighlighterButton }],
    locales: { en, 'zh-Hant': zhHant },
  },

  setup(ctx) {
    ctx.notify({
      message: ctx.t('notif.ready'),
      variant: 'success',
      duration: 1500,
    })
    ctx.onDispose(() => {
      // cancel timers, remove listeners, etc.
    })
  },
})
```

### `ctx` が提供するもの

| メソッド | 説明 |
|----------|------|
| `ctx.t(key, params?)` | この module のロケール名前空間で i18n キーを解決します。 |
| `ctx.notify(payload)` | オーバーレイウィンドウにトーストを表示します。`NotifyHandle` を返します。 |
| `ctx.getSettings<T>()` | この module の設定を返します。 |
| `ctx.callMain(action, payload?)` | この module のメインプロセスハンドラーのいずれかを呼び出します。 |
| `ctx.onDispose(fn)` | クリーンアップコールバックを登録します — module がアンロードされるときに呼び出されます。 |
| `ctx.moduleId` | この module の id 文字列です。 |
| `ctx.locale` | 現在アクティブなロケール (例: `'en'`)。読み取り専用です。 |

---

## 4a. Vue コンポーネントでの i18n

`ctx.t()` は Vue コンポーネントのテンプレート内でも使用できます。`useModuleContext()` でコンテキストを取得し、`setup()` 内と同様に `ctx.t()` を呼び出してください。

> **重要:** `useModuleContext()` に渡す引数は、`plugin.json` (および `defineModule({ id })`) の `id` フィールドと完全に一致する必要があります。不一致の場合、未登録の id を示すメッセージとともに実行時に `Error` がスローされます。推奨パターンとして、`MODULE_ID` 定数を 1 か所 (例: `src/module-id.ts`) で定義し、文字列を繰り返す代わりにそこからインポートするようにしてください。

```vue
<!-- HighlighterButton.vue -->
<script setup lang="ts">
import { useModuleContext } from '@openpen/module-api'

// Keys are automatically namespaced — no full path required.
const ctx = useModuleContext('@yourscope/my-highlighter')
</script>

<template>
  <button
    :aria-label="ctx.t('button.label')"
    :data-tip="ctx.t('button.label')"
    @click="activate"
  >
    <!-- icon SVG -->
  </button>
</template>
```

`locales/en.json` の内容:

```json
{
  "name": "Highlighter",
  "description": "Highlights text on screen.",
  "button": { "label": "Highlight" }
}
```

`ctx.t('button.label')` はグローバル i18n ストアの `yourscope.my-highlighter.button.label` を解決します。ロケールが変更されると、コンポーネントはリアクティブに再レンダリングされます。

> `vue-i18n` の `useI18n()` を直接呼び出して `t('button.label')` のような部分パスを渡さないでください。それはホストのロケールストアに対して解決されるため、plugin の名前空間ではなく、翻訳の代わりにキー文字列がサイレントに返されます。Vue コンポーネントからは必ず `useModuleContext().t()` を使用してください。

---

## 5. 開発ワークフロー

```bash
npm run dev      # watch mode — rebuilds dist/renderer.js on every save
```

OpenPen で変更を確認するには、コピーして再起動します。

```bash
npx openpen-cli plugin add .
# then restart OpenPen
```

ホットリロードのブリッジはありません。サイクルは「編集 → ビルド → インストール → 再起動」です。

---

## 6. 配布用パッケージの作成

plugin の共有準備ができたら、配布用の zip を作成します。

```bash
npm run build          # clean production build
npx openpen-cli pack       # creates: yourscope-my-highlighter-0.1.0.zip
                       # prints: sha256: <hex>
```

zip には `plugin.json`、`dist/`、`locales/` のみが含まれます。`src/`、`node_modules/`、lifecycle スクリプトは含まれません。

---

## 7. カタログへの公開

### ステップ 1 — GitHub Release の作成

```bash
gh release create v0.1.0 ./yourscope-my-highlighter-0.1.0.zip
```

### ステップ 2 — カタログ PR のオープン

```bash
npx openpen-cli publish
```

`openpen publish` は `plugin.json` を読み込み、GitHub Release の存在を確認し、認証済み GitHub ログインが plugin のスコープと一致することを検証し、sha256 を計算して、`OpenPen-plugins` カタログリポジトリに**Registration PR** をオープンします。

**その後の流れ:**

- カタログボットが PR を自動的に検証します (スコープ、id フォーマット、sha256、リリース URL)。
- メンテナーが Registration PR をレビューします — 初回の提出は人間によるレビューが必要です。
- マージ後、CI によって `plugins.json` が再生成され、OpenPen マーケットプレイスで plugin が検索可能になります。

### plugin の更新

以降のリリースでも流れは同じですが、ステップ 2 では Registration PR の代わりに**Update PR** がオープンされます。Update PR は検証が通ると、人間のレビューなしにボットによって自動マージされます。

```bash
# bump version in plugin.json, then:
npm run build
npx openpen-cli pack
gh release create v0.2.0 ./yourscope-my-highlighter-0.2.0.zip
npx openpen-cli publish
```

---

## 次のステップ

- [Module Architecture](../concepts/module-architecture.md) — 4 層設計と plugin の位置づけ
- [Trust Model](../concepts/trust-model.md) — plugin ができることとできないこと
- [Slot Reference](../slots/index.md) — すべての contribution slot
- [UIKit Reference](../uikit/index.md) — プリビルドの UI コンポーネント
- [Notify API](../reference/notify-api.md) — トースト通知と i18n
