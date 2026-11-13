---
title: Canvas 插槽
description: 8 个用于绘图工具、形状、笔触变换和画布图层的 contribution 插槽。
translationType: machine-pending-review
translatedFrom: 281ee6c
translatedAt: 2026-09-30T13:07:35Z
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
   * Whole-stroke opacity in 0..1; omitted means fully opaque. The host's
   * default polyline renderer applies it as `globalAlpha` and clamps values
   * outside 0..1 back into range (non-finite values are ignored); a tool with
   * its own `renderStroke` reads and applies it itself. A tool without
   * `renderStroke` that stores an `opacity` key gets it applied by the default
   * renderer, so the value must be a number.
   */
  opacity?: number
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

## 宿主笔触服务 {#host-stroke-service}

大多数工具从 `onPointerUp` 返回已完成的 `Stroke`，由宿主代为提交。有些工具在该同步返回**之外**完成笔触，例如打开编辑器的异步放置类文字注释工具、端点需分两步确认的箭头，或在对话框之后放置的步骤标记，这类工具需要自行提交笔触。宿主笔触服务提供这条提交路径，以及读取与历史记录的访问能力，从 `@openpen/module-api/host` 导入：

```ts
import { commitStroke, getAllStrokes, removeStrokeById, pushCommand } from '@openpen/module-api/host'
```

### `commitStroke(stroke)`

原子地提交一个已完成的笔触：将其追加到笔触存储，记录一条 `ADD_STROKE` 历史命令，并请求画布重绘，全部在一次调用中完成。

```ts
// Async-placement tool: stroke is finalised after a deferred interaction.
async function placeText(point: Point, style: StrokeStyle) {
  const text = await openTextEditor(point)
  if (text === null) return // user cancelled — commit nothing
  commitStroke({
    id: crypto.randomUUID(),
    tool: 'text',
    points: [point],
    style,
    text,
  })
}
```

- **等价性**：`commitStroke(stroke)` 在语义上与在同步的 `onPointerUp` 中返回同一个 `stroke` 完全相同。两者都会追加该笔触并推入一条 `ADD_STROKE` 命令，因此结果完整参与撤销/重做：一次撤销恰好移除被提交的笔触，一次重做将其恢复。
- **非幂等**：每次调用都会追加一个笔触和一条历史记录。对同一个对象调用两次 `commitStroke(stroke)` 会添加**两个**笔触。每个已完成的笔触应当仅提交一次；请在异步路径上防范重复触发。
- **不做清理（完全信任）**：笔触的结构由调用方负责。v1 中宿主不做任何校验，请提供有效的 `Stroke`（唯一的 `id`、与你的 contribution 匹配的 `tool`、格式正确的 `points` / `style`）。

### `getAllStrokes()` / `removeStrokeById(id)` / `pushCommand(command)`

其余的读取与历史记录接口，供检查或修改现有笔触的工具使用（例如笔触橡皮擦）：

- `getAllStrokes(): Stroke[]` — 按 z 轴顺序返回当前的笔触。
- `removeStrokeById(id): boolean` — 按 id 移除笔触；返回是否移除了某个笔触。配合 `pushCommand` 使用，可使移除操作支持撤销。
- `pushCommand(command)` — 记录一条历史命令（`ADD_STROKE` / `REMOVE_STROKE` / `CLEAR_ALL`），使该操作参与撤销/重做。

对于画布范围的操作（清空全部、撤销、重做），请使用宿主命令，而非直接修改存储；这些辅助函数不属于本服务。

## 切换工具 {#activate-tool}

module 若要自行切换工具（通常是在 `system.shortcuts` 的 handler 中），请调用 `activateTool`，不要直接操作宿主 IPC。它从主入口 `@openpen/module-api` 导入（plugin 运行时的 import map 不提供 `/host`）：

```ts
import { activateTool } from '@openpen/module-api'

function activateTool(toolId: string): void
```

- **效果**：`toolId` 成为当前使用的工具。所有显示器上对应的控制栏按钮亮起、先前工具的按钮熄灭，所有画布也切换为该工具。
- **未知 id**：`toolId` 必须是某个 `canvas.tools` contribution 的 `id`（内置或任一已加载 module 提供均可）。其他 id 会被忽略：不改变任何状态，并在 console 输出一条警告。
- **调用位置**：module 代码中任何地方均可，包括快捷键的 `handler`。示例：

控制栏只会渲染 `ui.control-bar`（`contributes.controlBar`）的条目；工具的 `icon` 不会自动生成按钮。因此示例附带一个按钮组件，通过 `ACTIVE_TOOL_KEY` 读取当前工具，任何切换都会让它亮起：

```ts
// index.ts
import { defineModule, activateTool, resolveStrokeColor } from '@openpen/module-api'
import type { Point, Stroke, StrokeStyle } from '@openpen/module-api'
import ArrowButton from './ArrowButton.vue'

let points: Point[] = []
let style: StrokeStyle | null = null

export default defineModule({
  id: '@acme/arrow',
  version: '1.0.0',
  contributes: {
    tools: [
      {
        id: 'arrow',
        label: 'Arrow',
        onPointerDown(_ctx, point, s) {
          points = [point]
          style = { ...s }
        },
        onPointerMove(ctx, point) {
          const prev = points[points.length - 1]
          if (!style || !prev) return
          points.push(point)
          ctx.strokeStyle = resolveStrokeColor(style.color)
          ctx.lineWidth = style.lineWidth
          ctx.beginPath()
          ctx.moveTo(prev.x, prev.y)
          ctx.lineTo(point.x, point.y)
          ctx.stroke()
        },
        onPointerUp(_ctx, point): Stroke | null {
          if (!style) return null
          return { id: crypto.randomUUID(), tool: 'arrow', points: [...points, point], style }
        },
      },
    ],
    // The control bar renders only `controlBar` items, so the tool's button is declared here.
    controlBar: [{ id: 'arrow', component: ArrowButton, defaultGroup: 'tools' }],
    shortcuts: [
      {
        id: 'pick-arrow',
        keys: 'CommandOrControl+Alt+A',
        scope: 'global',
        handler: () => activateTool('arrow'),
      },
    ],
  },
})
```

```vue
<!-- ArrowButton.vue -->
<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { ACTIVE_TOOL_KEY, activateTool } from '@openpen/module-api'
import { AppButton } from '@openpen/module-api/uikit'

// The control bar provides the current tool id; it follows every switch,
// including those made by a shortcut or by `activateTool` in another window.
const activeTool = inject(ACTIVE_TOOL_KEY, ref(''))
const isActive = computed(() => activeTool.value === 'arrow')
</script>

<template>
  <AppButton :active="isActive" tooltip="Arrow" aria-label="Arrow" @click="activateTool('arrow')">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M5 19L19 5M9 5h10v10" />
    </svg>
  </AppButton>
</template>
```

## `canvas.stroke.transformers` — ⏳ 预留 {#canvas-stroke-transformers}

- **Contribution key**：`strokeTransformers`
- **类型**：`StrokeTransformerContribution[]`
- **用途**：在笔触创建后进行后处理（平滑、点简化、发光效果）。接收一个笔触，返回变换后的笔触。
- **预留原因**：性能与排序语义需要真实 plugin 验证后才能确定。
