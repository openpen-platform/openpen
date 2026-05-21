---
title: Canvas 插槽
description: 8 个用于绘图工具、形状、笔触变换和画布图层的 contribution 插槽。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# Canvas 插槽

Canvas 插槽覆盖绘图表面：由指针事件驱动的工具、形状基元、笔触样式所有权、画布图层（背景与覆盖层）、HTML 覆盖层，以及后处理变换器。

## `canvas.tools` — ✅ 可用 {#canvas-tools}

- **Contribution key**：`tools`
- **类型**：`ToolContribution[]`
- **用途**：由指针事件（`onPointerDown` / `onPointerMove` / `onPointerUp`）驱动的绘图工具。

### Contribution 形状

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

以上所有类型均从 `@openpen/module-api` 重新导出，可直接导入：

```ts
import type { Tool, Stroke, Point, StrokeStyle, StrokeColor, PointerModifiers } from '@openpen/module-api'
```

完整的、经过类型检查的参考实现，请参阅 `packages/plugin-starter/src/demo-tool.ts`。将 `StrokeColor` 折叠为单个 CSS 字符串后赋值给 `ctx.strokeStyle` 时，请使用 `@openpen/module-api` 中的 `resolveStrokeColor(color)`。

## `canvas.shapes` — ✅ 可用 {#canvas-shapes}

- **Contribution key**：`shapes`
- **类型**：`ShapeContribution[]`
- **用途**：形状基元（`circle`、`square`、`rect`、`roundrect`，以及 plugin 提供的形状，如 `hexagon`、`flowchart-decision`）。

## `canvas.stroke.style` — ✅ 可用 {#canvas-stroke-style}

- **Contribution key**：`strokeStyle`
- **类型**：`StrokeStyleContribution`
- **用途**：模块声明其写入共享笔触样式存储的键（例如 `['lineWidth']`、`['color']`）。验证时进行冲突检测。

## `canvas.history.commands` — ⏳ 预留 {#canvas-history-commands}

- **Contribution key**：`historyCommands`
- **类型**：`HistoryCommandContribution[]`
- **用途**：超出内置 `ADD_STROKE` / `REMOVE_STROKE` / `CLEAR_ALL` 之外的自定义撤销/重做命令类型。
- **预留原因**：画布历史适配器尚未实现；撤销/重做仅使用内置命令类型。

## `canvas.layers.background` — ✅ 可用 {#canvas-layers-background}

- **Contribution key**：`backgroundLayers`
- **类型**：`CanvasLayerContribution[]`
- **用途**：渲染于笔触下方（网格、水印、背景图片）。每个 contribution 获得一个带有画布上下文的渲染回调。

## `canvas.layers.overlay` — ✅ 可用 {#canvas-layers-overlay}

- **Contribution key**：`overlayLayers`
- **类型**：`CanvasLayerContribution[]`
- **用途**：渲染于笔触上方（标尺、吸附参考线、选择框）。

## `canvas.html.overlay` — ✅ 可用 {#canvas-html-overlay}

- **Contribution key**：`htmlOverlays`
- **类型**：`HtmlOverlayContribution[]`
- **用途**：在画布上方挂载 HTML / Vue 组件（文字注释、图片贴纸、径向快捷菜单）。此插槽稳定可用（非预留），因为若无此插槽，未来的文字注释 plugin 将迫使画布进行重新设计。架构性插槽必须提前落地。

## `canvas.stroke.transformers` — ⏳ 预留 {#canvas-stroke-transformers}

- **Contribution key**：`strokeTransformers`
- **类型**：`StrokeTransformerContribution[]`
- **用途**：在笔触创建后进行后处理（平滑、点简化、发光效果）。接收一个笔触，返回变换后的笔触。
- **预留原因**：性能与排序语义需要真实 plugin 验证后才能确定。
