/**
 * @openpen/module-api/host — Host interface contract
 *
 * Defines the surface the host (OpenPen renderer process) MUST implement
 * and inject via `registerHost()`. Module / plugin code consumes this surface
 * through the proxy exports in `./index.ts`, never importing this file
 * directly.
 *
 * This file MUST NOT import from outside `packages/module-api/src/`; the
 * point of the contract is that the SDK package owns the shape independent
 * of host implementation paths. Cross-boundary imports here would prevent
 * clean .d.ts emission (TS6059) when the package is built for publishing.
 */
import type { Ref, ComputedRef } from 'vue'
import type { Stroke, StrokeColor } from '../types/tool'
import type { SnapEdge } from '../inject-keys'

// ── History command shape ────────────────────────────────────────────────────

/**
 * Discriminated union for `pushCommand`. Modules wrap their state changes in
 * one of these so the host can undo / redo them through `hostCommands.history`.
 */
type StrokeAddCommand = { type: 'ADD_STROKE'; stroke: Stroke }
type StrokeRemoveCommand = { type: 'REMOVE_STROKE'; stroke: Stroke }
type StrokeClearAllCommand = { type: 'CLEAR_ALL'; strokes: Stroke[] }
export type HistoryCommand = StrokeAddCommand | StrokeRemoveCommand | StrokeClearAllCommand

// ── Contribution registry entries ────────────────────────────────────────────

/** Slot-entry shape returned by `getSlotEntries`. */
export interface ContributionEntry<T = unknown> {
  /** Module that registered this contribution. */
  moduleId: string
  /** Slot-specific contribution payload (typed by consumer). */
  contribution: T
}

// ── Color utilities ──────────────────────────────────────────────────────────

/**
 * Color manipulation helpers. Pure functions, no host state.
 *
 * NOTE: These pure helpers are exposed via injection for symmetry with the
 * rest of the host surface; a later refactor MAY lift them into the package
 * itself once the host-inversion is settled.
 */
export interface ColorUtilsAPI {
  /**
   * Resolve a `StrokeColor` to a canvas-compatible style value, expanding
   * linear-gradient descriptors via the provided context + endpoints.
   */
  resolveColorStyle: (
    ctx: CanvasRenderingContext2D,
    color: StrokeColor,
    startPoint: { x: number; y: number },
    endPoint: { x: number; y: number },
  ) => string | CanvasGradient
  hexToRgb: (hex: string) => [number, number, number]
  rgbToHex: (r: number, g: number, b: number) => string
  hsvToRgb: (h: number, s: number, v: number) => [number, number, number]
  rgbToHsv: (r: number, g: number, b: number) => [number, number, number]
  hexToHsv: (hex: string) => [number, number, number]
  hsvToHex: (h: number, s: number, v: number) => string
  isValidHex: (hex: string) => boolean
}

// ── Host commands ────────────────────────────────────────────────────────────

/** Imperative actions modules invoke against host infrastructure. */
export interface HostCommandsAPI {
  controlBar: { togglePin: () => void }
  canvas: { clear: () => void }
  history: { undo: () => void; redo: () => void }
  app: {
    toggleDrawingMode: () => void
    setDrawingMode: (enabled: boolean) => void
  }
}

// ── Stroke style composable ──────────────────────────────────────────────────

/** Return shape of `useStrokeStyle()`. */
export interface StrokeStyleAPI {
  color: Readonly<Ref<StrokeColor>>
  lineWidth: Readonly<Ref<number>>
  setColor: (color: StrokeColor) => void
  setLineWidth: (w: number) => void
}

// ── Popup anchor composable ──────────────────────────────────────────────────

export type PopupPlacement = 'below' | 'above' | 'left' | 'right'
export type PopupArrowDir = 'up' | 'down' | 'left' | 'right'

type RefOrComputed<T> = Ref<T> | ComputedRef<T>

export interface UsePopupAnchorOptions {
  triggerEl: RefOrComputed<HTMLElement | null>
  anchorEl?: RefOrComputed<HTMLElement | null>
  wrapperEl: RefOrComputed<HTMLElement | null>
  snapEdge: RefOrComputed<SnapEdge>
  popupEl?: RefOrComputed<HTMLElement | null>
  popupHeight: number | RefOrComputed<number>
  popupWidth: number | RefOrComputed<number>
  gap?: number
  safeMargin?: number
  arrowInset?: number
}

export interface UsePopupAnchorAPI {
  popupStyle: Readonly<Ref<Record<string, string>>>
  arrowDir: Readonly<Ref<PopupArrowDir>>
  arrowOffset: Readonly<Ref<string>>
  placement: Readonly<Ref<PopupPlacement>>
  updatePosition: () => void
}

export interface PopupRect {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface CalculatePopupAnchorOptions {
  triggerRect: PopupRect
  anchorRect?: PopupRect
  wrapperRect: PopupRect
  snapEdge: SnapEdge
  popupHeight?: number
  popupWidth?: number
  gap?: number
  arrowInset?: number
  safeMargin?: number
  availableSpace?: { above: number; below: number; left: number; right: number }
}

export interface CalculatePopupAnchorResult {
  placement: PopupPlacement
  arrowDir: PopupArrowDir
  arrowOffset: string
  popupStyle: Record<string, string>
}

// ── ModuleHost contract ──────────────────────────────────────────────────────

/**
 * The shape OpenPen's renderer process implements and registers at boot via
 * `registerHost(impl)`. All `@openpen/module-api/host` exports proxy through
 * `_useHost()` to fetch the registered implementation lazily.
 */
export interface ModuleHost {
  // Event bus
  emit: (event: string, payload?: unknown) => void
  on: (event: string, handler: (payload: unknown) => void) => () => void

  // Stroke store (read + history)
  getAllStrokes: () => Stroke[]
  removeStrokeById: (id: string) => boolean
  pushCommand: (command: HistoryCommand) => void

  // Host commands
  hostCommands: HostCommandsAPI

  // Color utilities
  colorUtils: ColorUtilsAPI

  // Stroke style
  useStrokeStyle: () => StrokeStyleAPI

  // Popup anchor
  usePopupAnchor: (options: UsePopupAnchorOptions) => UsePopupAnchorAPI
  calculatePopupAnchor: (options: CalculatePopupAnchorOptions) => CalculatePopupAnchorResult

  // Passthrough guard
  usePassthroughGuard: (target?: string | Ref<HTMLElement | null>) => void

  // Slot entries — reactive readonly ref so module components can render
  // contributions as they change.
  getSlotEntries: <T = unknown>(slotKey: string) => Readonly<Ref<readonly ContributionEntry<T>[]>>
}
