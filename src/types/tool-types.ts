/**
 * Re-export of the public `Tool` primitives from @openpen/module-api.
 *
 * This shim exists so existing host imports (`import type { Stroke }
 * from '../types/tool-types'`) continue to work without touching
 * dozens of files; the canonical definitions live in the SDK package
 * because plugins must be able to type their contributions.
 */
export type {
  Point,
  StrokeColor,
  StrokeStyle,
  Stroke,
  PointerModifiers,
  Tool,
} from '@openpen/module-api'
