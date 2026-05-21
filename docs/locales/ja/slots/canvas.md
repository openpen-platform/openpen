---
title: Canvas スロット
description: 描画ツール、シェイプ、ストローク変換、キャンバスレイヤーに対応する8つの contribution スロット。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# Canvas スロット

Canvas スロットは描画サーフェスを担います。ポインターイベントで駆動されるツール、シェイププリミティブ、ストロークスタイルの所有権、キャンバスレイヤー (背景とオーバーレイ)、HTML オーバーレイ、そしてポストプロセス変換器が含まれます。

## `canvas.tools` — ✅ 利用可能 {#canvas-tools}

- **Contribution キー**: `tools`
- **型**: `ToolContribution[]`
- **目的**: ポインターイベント (`onPointerDown` / `onPointerMove` / `onPointerUp`) で駆動される描画ツールです。

### Contribution の形状

```ts
interface ToolContribution extends Tool {
  /** Tool id. Cursor contributions reference this via `CursorContribution.id`. */
  id: string
  /** Human-readable label for tooltips / a11y. */
  label?: string | LocaleMap
  /**
   * Inline SVG markup for the tool's control-bar button icon. Host
   * renders via `v-html`. Plugins providing a custom Vue button
   * component (via `ui.control-bar`) can omit this.
   */
  icon?: string
  /**
   * Custom redraw renderer. Called on history replay (undo / redo,
   * canvas restoration) with each Stroke this tool produced. Omit
   * for polyline-style tools — the canvas engine falls back to a
   * default polyline render through `stroke.points`.
   */
  renderStroke?: (canvasCtx: CanvasRenderingContext2D, stroke: Stroke) => void
}

interface Tool {
  /**
   * Pointer pressed. Tools that draw incrementally (most do) record
   * the first point here. `canvasCtx` is the live canvas — tools MAY
   * draw immediately (e.g. a dot at the press point) but must NOT
   * return the Stroke yet.
   */
  onPointerDown(
    canvasCtx: CanvasRenderingContext2D,
    point: Point,
    style: StrokeStyle,
  ): void
  /**
   * Pointer moved with the button held. Most tools draw the next
   * segment of the stroke here using the live `canvasCtx`. Return
   * `true` to request a full canvas redraw (e.g. a stroke-eraser
   * just deleted an existing stroke and the canvas state changed).
   */
  onPointerMove(
    canvasCtx: CanvasRenderingContext2D,
    point: Point,
    modifiers?: PointerModifiers,
  ): void | boolean
  /**
   * Pointer released. Return the completed Stroke for the host to
   * push into the history store, or `null` to discard it (e.g. an
   * eraser tool that does not accumulate persistent state).
   */
  onPointerUp(
    canvasCtx: CanvasRenderingContext2D,
    point: Point,
    modifiers?: PointerModifiers,
  ): Stroke | null
  /**
   * When `true`, the canvas engine clears + redraws all previous
   * strokes on every `onPointerMove` before the tool draws this
   * frame's segment. Use for tools that show a live preview that
   * mutates with pointer position (e.g. a rectangle tool dragging
   * the opposite corner). Default `false` — most tools draw
   * incrementally and don't need this.
   */
  needsPreviewRedraw?: boolean
  /**
   * Optional companion to `needsPreviewRedraw`. Called every
   * pointermove AFTER the canvas has been cleared + redrawn with
   * historical strokes, just before `onPointerMove`. Use to draw
   * an in-progress preview that does not persist into history.
   */
  renderPreview?(canvasCtx: CanvasRenderingContext2D): void
}

interface Stroke {
  /** Globally unique id. `crypto.randomUUID()` is the conventional source. */
  id: string
  /** MUST match the `ToolContribution.id` that produced this stroke. */
  tool: string
  points: Point[]
  style: StrokeStyle
  /**
   * Tool-specific state. Tools MAY store arbitrary keys during the
   * pointer handlers; those keys survive into `renderStroke`.
   * TypeScript cannot infer the shape — cast at the read site.
   */
  [extraKey: string]: unknown
}

interface Point { x: number; y: number }

type StrokeColor =
  | string
  | { type: 'linear'; from: string; to: string }

interface StrokeStyle {
  /**
   * Solid color or linear gradient. Tools that render the stroke
   * themselves MUST handle both branches — pick `color.from` for
   * the gradient start when CanvasRenderingContext2D needs a single
   * colour string.
   */
  color: StrokeColor
  lineWidth: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
}

interface PointerModifiers {
  shiftKey?: boolean
}
```

これらの型はすべて `@openpen/module-api` から直接インポートできるよう再エクスポートされています。

```ts
import type { Tool, Stroke, Point, StrokeStyle, StrokeColor, PointerModifiers } from '@openpen/module-api'
```

完全な型チェック済みのリファレンス実装は `packages/plugin-starter/src/demo-tool.ts` を参照してください。`StrokeColor` を `ctx.strokeStyle` に代入する際に単一の CSS 文字列へ変換するには、`@openpen/module-api` の `resolveStrokeColor(color)` を使用します。

## `canvas.shapes` — ✅ 利用可能 {#canvas-shapes}

- **Contribution キー**: `shapes`
- **型**: `ShapeContribution[]`
- **目的**: シェイププリミティブ (`circle`、`square`、`rect`、`roundrect`、加えて `hexagon`、`flowchart-decision` などの plugin 提供シェイプ) です。

## `canvas.stroke.style` — ✅ 利用可能 {#canvas-stroke-style}

- **Contribution キー**: `strokeStyle`
- **型**: `StrokeStyleContribution`
- **目的**: 共有ストロークスタイルストアの中で各 module が書き込むキー (例: `['lineWidth']`、`['color']`) を宣言します。バリデーター実行時に競合が検出されます。

## `canvas.history.commands` — ⏳ 予約済み {#canvas-history-commands}

- **Contribution キー**: `historyCommands`
- **型**: `HistoryCommandContribution[]`
- **目的**: 組み込みの `ADD_STROKE` / `REMOVE_STROKE` / `CLEAR_ALL` を超えるカスタムの undo/redo コマンド型です。
- **予約の理由**: キャンバス履歴アダプターが未実装のため、undo/redo は組み込みコマンド型のみを使用しています。

## `canvas.layers.background` — ✅ 利用可能 {#canvas-layers-background}

- **Contribution キー**: `backgroundLayers`
- **型**: `CanvasLayerContribution[]`
- **目的**: ストロークより下にレンダリングします (グリッド、ウォーターマーク、背景画像)。各 contribution はキャンバスコンテキストを受け取るレンダリングコールバックを取得します。

## `canvas.layers.overlay` — ✅ 利用可能 {#canvas-layers-overlay}

- **Contribution キー**: `overlayLayers`
- **型**: `CanvasLayerContribution[]`
- **目的**: ストロークより上にレンダリングします (ルーラー、スナップガイド、選択ボックス)。

## `canvas.html.overlay` — ✅ 利用可能 {#canvas-html-overlay}

- **Contribution キー**: `htmlOverlays`
- **型**: `HtmlOverlayContribution[]`
- **目的**: キャンバスの上に HTML / Vue コンポーネントをマウントします (テキストアノテーション、画像ステッカー、ラジアル QuickMenu)。このスロットは安定版 (予約済みではない) です。これがなければ、将来のテキストアノテーション plugin がキャンバスの再設計を強いることになるためです。アーキテクチャ上のスロットは早期に実装する必要があります。

## `canvas.stroke.transformers` — ⏳ 予約済み {#canvas-stroke-transformers}

- **Contribution キー**: `strokeTransformers`
- **型**: `StrokeTransformerContribution[]`
- **目的**: 生成後にストロークをポストプロセスします (スムージング、ポイント簡略化、グロウエフェクト)。ストロークを受け取り、変換されたストロークを返します。
- **予約の理由**: パフォーマンスと順序付けのセマンティクスは、コミット前に実際の plugin で検証する必要があります。
