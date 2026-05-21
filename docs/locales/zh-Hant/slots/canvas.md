---
title: Canvas 插槽
description: 8 個用於繪圖工具、形狀、筆觸變換及畫布圖層的 contribution 插槽。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# Canvas 插槽

Canvas 插槽涵蓋繪圖畫面：由指標事件驅動的工具、形狀基本元素、筆觸樣式所有權、畫布圖層（背景與覆蓋層）、HTML 覆蓋層，以及後處理變換器。

## `canvas.tools` — ✅ 可用 {#canvas-tools}

- **Contribution 鍵**：`tools`
- **型別**：`ToolContribution[]`
- **用途**：由指標事件（`onPointerDown` / `onPointerMove` / `onPointerUp`）驅動的繪圖工具。

### Contribution 結構

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

以上所有型別都從 `@openpen/module-api` 重新匯出，可直接 import：

```ts
import type { Tool, Stroke, Point, StrokeStyle, StrokeColor, PointerModifiers } from '@openpen/module-api'
```

完整且經過型別檢查的參考實作請見 `packages/plugin-starter/src/demo-tool.ts`。將 `StrokeColor` 折疊為單一 CSS 字串後再指派給 `ctx.strokeStyle` 時，請使用 `@openpen/module-api` 提供的 `resolveStrokeColor(color)`。

## `canvas.shapes` — ✅ 可用 {#canvas-shapes}

- **Contribution 鍵**：`shapes`
- **型別**：`ShapeContribution[]`
- **用途**：形狀基本元素（`circle`、`square`、`rect`、`roundrect`，以及 plugin 提供的形狀，例如 `hexagon`、`flowchart-decision`）。

## `canvas.stroke.style` — ✅ 可用 {#canvas-stroke-style}

- **Contribution 鍵**：`strokeStyle`
- **型別**：`StrokeStyleContribution`
- **用途**：module 宣告它們寫入共用筆觸樣式 store 的哪些鍵（例如 `['lineWidth']`、`['color']`）。衝突偵測在驗證器階段執行。

## `canvas.history.commands` — ⏳ 保留中 {#canvas-history-commands}

- **Contribution 鍵**：`historyCommands`
- **型別**：`HistoryCommandContribution[]`
- **用途**：超出內建 `ADD_STROKE` / `REMOVE_STROKE` / `CLEAR_ALL` 之外的自訂復原/重做命令型別。
- **保留原因**：Canvas history adapter 尚未實作；復原/重做目前僅使用內建命令型別。

## `canvas.layers.background` — ✅ 可用 {#canvas-layers-background}

- **Contribution 鍵**：`backgroundLayers`
- **型別**：`CanvasLayerContribution[]`
- **用途**：渲染於筆觸下方（格線、浮水印、背景圖片）。每個 contribution 會取得一個帶有 canvas context 的渲染回呼。

## `canvas.layers.overlay` — ✅ 可用 {#canvas-layers-overlay}

- **Contribution 鍵**：`overlayLayers`
- **型別**：`CanvasLayerContribution[]`
- **用途**：渲染於筆觸上方（尺規、對齊參考線、選取框）。

## `canvas.html.overlay` — ✅ 可用 {#canvas-html-overlay}

- **Contribution 鍵**：`htmlOverlays`
- **型別**：`HtmlOverlayContribution[]`
- **用途**：在畫布上方掛載 HTML / Vue 元件（文字標注、圖片貼紙、輻射狀快捷選單）。此插槽為穩定狀態（非保留），原因在於若無此插槽，未來的文字標注 plugin 將迫使畫布進行重新設計。架構性插槽必須提早落地。

## `canvas.stroke.transformers` — ⏳ 保留中 {#canvas-stroke-transformers}

- **Contribution 鍵**：`strokeTransformers`
- **型別**：`StrokeTransformerContribution[]`
- **用途**：在筆觸建立後進行後處理（平滑化、點簡化、發光效果）。接收一個筆觸，回傳變換後的筆觸。
- **保留原因**：效能與排序語意需要真實 plugin 驗證後才能定案。
