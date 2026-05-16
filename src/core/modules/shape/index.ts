/**
 * Shape module — geometric tool + 10 built-in shape primitives.
 *
 * Contributes:
 *   - One canvas Tool ('shape') parameterised by the shared shape-state
 *     ref so ShapePopover can flip kind / filled without re-emitting tool-changed.
 *   - Ten built-in shapes (circle, ellipse, square, rect, roundrect,
 *     triangle, triangle-down, diamond, parallelogram, star) into the
 *     canvas.shapes slot so ShapePopover renders them.
 *   - A 'crosshair' cursor for ui.cursors.
 *
 * setup() subscribes to `tool-changed` events on the renderer event
 * bus: when the bus carries a `tool: 'shape'` payload (via the
 * IPC → applyToolConfig → eventBusEmit chain inside useCanvas), we
 * sync `currentShape` / `filled` so the next pointer-down builds a
 * tool with the user's selection. Without this hop the wrapper would
 * always create a 'rect' tool regardless of what ControlBar asked for.
 */
import {
  defineModule,
  type ShapeContribution,
  type Stroke,
  type StrokeStyle,
  type Tool,
} from '@openpen/module-api'
import { createShapeTool, renderShapeStroke, type ShapeKind } from './shape-tool'
import { currentShape, filled } from './shape-state'
import { shapeCursor, shapeCursorAnimated } from './cursor'

// Honour OS-level reduced-motion preference at module load.
const reducedMotion =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches
import { on as eventBusOn } from '@openpen/module-api/host'
import en from './locales/en.json'
import zhHant from './locales/zh-Hant.json'
import zhHans from './locales/zh-Hans.json'
import ja from './locales/ja.json'
import CircleIcon from './icons/CircleIcon.vue'
import EllipseIcon from './icons/EllipseIcon.vue'
import SquareIcon from './icons/SquareIcon.vue'
import RectIcon from './icons/RectIcon.vue'
import RoundRectIcon from './icons/RoundRectIcon.vue'
import TriangleIcon from './icons/TriangleIcon.vue'
import TriangleDownIcon from './icons/TriangleDownIcon.vue'
import DiamondIcon from './icons/DiamondIcon.vue'
import ParallelogramIcon from './icons/ParallelogramIcon.vue'
import StarIcon from './icons/StarIcon.vue'
import ShapeToolButton from './ShapeToolButton.vue'

let active: Tool | null = null
let unsubToolChanged: (() => void) | null = null

const toolWrapper: Tool = {
  needsPreviewRedraw: true,
  onPointerDown(ctx, point, style: StrokeStyle) {
    active = createShapeTool({ kind: currentShape.value as ShapeKind, filled: filled.value })
    active.onPointerDown(ctx, point, style)
  },
  onPointerMove(ctx, point, modifiers) {
    return active?.onPointerMove(ctx, point, modifiers)
  },
  onPointerUp(ctx, point, modifiers): Stroke | null {
    const r = active?.onPointerUp(ctx, point, modifiers) ?? null
    active = null
    return r
  },
}

const noopDraw = () => {}

const builtInShapes: ShapeContribution[] = [
  { id: 'circle',        icon: CircleIcon,        draw: noopDraw },
  { id: 'ellipse',       icon: EllipseIcon,       draw: noopDraw },
  { id: 'square',        icon: SquareIcon,        draw: noopDraw },
  { id: 'rect',          icon: RectIcon,          draw: noopDraw },
  { id: 'roundrect',     icon: RoundRectIcon,     draw: noopDraw },
  { id: 'triangle',      icon: TriangleIcon,      draw: noopDraw },
  { id: 'triangle-down', icon: TriangleDownIcon,  draw: noopDraw },
  { id: 'diamond',       icon: DiamondIcon,       draw: noopDraw },
  { id: 'parallelogram', icon: ParallelogramIcon, draw: noopDraw },
  { id: 'star',          icon: StarIcon,          draw: noopDraw },
]

export default defineModule({
  id: '@openpen/shape',
  metadata: {
    name: { en: 'Shape', 'zh-Hant': '形狀', 'zh-Hans': '形状', ja: '図形' },
    description: { en: 'Geometric shape tool with 10 built-in shapes.', 'zh-Hant': '幾何形狀工具，內建 10 種形狀。', 'zh-Hans': '几何形状工具，内置 10 种形状。', ja: '10 種類の内蔵図形を持つジオメトリツール。' },
  },
  setup() {
    unsubToolChanged?.()
    unsubToolChanged = eventBusOn('tool-changed', (payload) => {
      const p = payload as { tool?: string; shapeType?: ShapeKind; filled?: boolean }
      if (p?.tool !== 'shape') return
      if (p.shapeType) currentShape.value = p.shapeType
      if (typeof p.filled === 'boolean') filled.value = p.filled
    })
  },
  contributes: {
    tools: [
      {
        id: 'shape',
        ...toolWrapper,
        renderStroke: renderShapeStroke,
      },
    ],
    shapes: builtInShapes,
    cursors: [{
      id: 'shape',
      cursor: reducedMotion ? shapeCursor : shapeCursorAnimated,
    }],
    controlBar: [
      {
        id: 'shape',
        component: ShapeToolButton,
        defaultGroup: 'tools',
        groupHint: { separator: 'never' },
      },
    ],
    locales: { en, 'zh-Hant': zhHant, 'zh-Hans': zhHans, ja },
    lifecycle: {
      onQuit() {
        unsubToolChanged?.()
        unsubToolChanged = null
      },
    },
  },
})
