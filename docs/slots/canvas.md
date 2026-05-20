---
title: Canvas slots
description: 8 contribution slots for drawing tools, shapes, stroke transforms, and canvas layers.
---

# Canvas slots

Canvas slots cover the drawing surface: tools driven by pointer events, shape
primitives, stroke style ownership, canvas layers (background and overlay), HTML
overlays, and post-processing transformers.

## `canvas.tools` — ✅ available {#canvas-tools}

- **Contribution key**: `tools`
- **Type**: `ToolContribution[]`
- **Purpose**: Drawing tools driven by pointer events (`onPointerDown` / `onPointerMove` / `onPointerUp`).

### Contribution shape

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

All of these types are re-exported from `@openpen/module-api` for direct import:

```ts
import type { Tool, Stroke, Point, StrokeStyle, StrokeColor, PointerModifiers } from '@openpen/module-api'
```

See `packages/plugin-starter/src/demo-tool.ts` for a complete, type-checked reference implementation. Use `resolveStrokeColor(color)` from `@openpen/module-api` to fold a `StrokeColor` into a single CSS string when assigning to `ctx.strokeStyle`.

## `canvas.shapes` — ✅ available {#canvas-shapes}

- **Contribution key**: `shapes`
- **Type**: `ShapeContribution[]`
- **Purpose**: Shape primitives (`circle`, `square`, `rect`, `roundrect`, plus plugin-provided shapes like `hexagon`, `flowchart-decision`).

## `canvas.stroke.style` — ✅ available {#canvas-stroke-style}

- **Contribution key**: `strokeStyle`
- **Type**: `StrokeStyleContribution`
- **Purpose**: Modules declare which keys of the shared stroke style store they write to (e.g. `['lineWidth']`, `['color']`). Conflict detection at validator time.

## `canvas.history.commands` — ⏳ reserved {#canvas-history-commands}

- **Contribution key**: `historyCommands`
- **Type**: `HistoryCommandContribution[]`
- **Purpose**: Custom undo/redo command types beyond the built-in `ADD_STROKE` / `REMOVE_STROKE` / `CLEAR_ALL`.
- **Why reserved**: Canvas history adapter not yet implemented; undo/redo uses built-in command types only.

## `canvas.layers.background` — ✅ available {#canvas-layers-background}

- **Contribution key**: `backgroundLayers`
- **Type**: `CanvasLayerContribution[]`
- **Purpose**: Render below strokes (grids, watermarks, background images). Each contribution gets a render callback with the canvas context.

## `canvas.layers.overlay` — ✅ available {#canvas-layers-overlay}

- **Contribution key**: `overlayLayers`
- **Type**: `CanvasLayerContribution[]`
- **Purpose**: Render above strokes (rulers, snap guides, selection boxes).

## `canvas.html.overlay` — ✅ available {#canvas-html-overlay}

- **Contribution key**: `htmlOverlays`
- **Type**: `HtmlOverlayContribution[]`
- **Purpose**: Mount HTML / Vue components above the canvas (text annotations, image stickers, radial QuickMenu). This slot is stable (not reserved) because without it, future text-annotation plugins would force a canvas redesign. Architectural slots must land early.

## `canvas.stroke.transformers` — ⏳ reserved {#canvas-stroke-transformers}

- **Contribution key**: `strokeTransformers`
- **Type**: `StrokeTransformerContribution[]`
- **Purpose**: Post-process strokes after creation (smoothing, point simplification, glow effects). Receives a stroke, returns a transformed stroke.
- **Why reserved**: Performance and ordering semantics need real plugins to validate before committing.
