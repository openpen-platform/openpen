/**
 * Renderers for the MCP painting strokes (`mcp-paint-brush`, `mcp-paint-fill`).
 *
 * Both are host built-ins: CanvasEngine looks them up before any module
 * renderer, so a plugin registering the same tool id cannot replace them. They
 * are pure functions of (ctx, stroke) and draw in the ctx's current coordinate
 * space (overlay CSS pixels), so they work with the stroke cache and the
 * incremental repaint exactly like any other renderStroke.
 *
 * Soft edges are stacked translucent passes (never shadowBlur or ctx.filter):
 * plain strokes and fills behave the same on every platform and on transparent
 * windows.
 *
 * Seams: two separate draw calls that meet along an edge, or overlap while
 * translucent, leave a visible line or a darker band. So a translucent ribbon
 * is one fill of one union path (quads wound the same way rasterise as one
 * region). Opacity that changes along a stroke is applied on an offscreen
 * surface by thinning: the opaque ribbon is erased by a few small factors
 * (one per bit of a level number), each over the quads whose level has that
 * bit, so the factors multiply to the opacity of every quad. Each erase region
 * is a run of consecutive quads, so no two regions ever abut along an edge.
 * Cost is linear in the number of samples, which is capped.
 */
import type { Point, Stroke } from '@openpen/module-api'
import { resolveColorStyle } from './color-utils'

export const PAINT_BRUSH_TOOL_ID = 'mcp-paint-brush'
export const PAINT_FILL_TOOL_ID = 'mcp-paint-fill'

interface Range { start: number; end: number }

interface CubicSegment { p0: Point; cp1: Point; cp2: Point; p1: Point }

/** Fewest and most stacked passes that make up a soft brush edge (about one pass per pixel of rim). */
const MIN_FEATHER_PASSES = 6
const MAX_FEATHER_PASSES = 24
/** Narrowest opaque core a soft brush keeps, as a share of the full width. */
const MIN_CORE_RATIO = 0.1
/** Longest soft-edge band inside a fill, in overlay CSS pixels. */
const MAX_FILL_FEATHER = 24
/** Largest offscreen surface side in device pixels; larger shapes are drawn in tiles. */
const TILE_SIDE = 2048
/** Relative opacity step between neighbouring levels of a fading stroke (1.25 %: far below what the eye sees). */
const RAMP_LAMBDA = 0.0125
/** Highest level, i.e. the deepest fade a stroke can show (about 1 / 600 of its top opacity). */
const MAX_RAMP_LEVEL = 511
/** Most pieces a ramp stroke is cut into, so its cost is bounded however many points it has. */
const MAX_RAMP_PIECES = 500
/** Fewest and most rings of a soft fill edge (about one per pixel of rim). */
const MIN_FILL_RINGS = 8
const MAX_FILL_RINGS = 32
/** How long to wait before trying to create an offscreen canvas again after it failed. */
const OFFSCREEN_RETRY_MS = 1000

// ── Parameter reading ────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function isRange(value: unknown): value is Range {
  return typeof value === 'object' && value !== null &&
    Number.isFinite((value as Range).start) && Number.isFinite((value as Range).end)
}

function readHardness(stroke: Stroke): number {
  const h = stroke.hardness
  return typeof h === 'number' && Number.isFinite(h) ? clamp(h, 0, 1) : 1
}

function readWidth(stroke: Stroke): Range {
  const w = stroke.width
  const fallback = Math.max(0.1, stroke.style?.lineWidth ?? 4)
  if (isRange(w)) return { start: Math.max(0.1, w.start), end: Math.max(0.1, w.end) }
  if (typeof w === 'number' && Number.isFinite(w)) return { start: Math.max(0.1, w), end: Math.max(0.1, w) }
  return { start: fallback, end: fallback }
}

function readOpacity(stroke: Stroke): Range {
  const range = stroke.opacityRange
  if (isRange(range)) return { start: clamp(range.start, 0, 1), end: clamp(range.end, 0, 1) }
  const o = stroke.opacity
  const v = typeof o === 'number' && Number.isFinite(o) ? clamp(o, 0, 1) : 1
  return { start: v, end: v }
}

/**
 * Split a CSS colour into an opaque colour and its own alpha, so the stroke's
 * opacity and the colour's alpha are applied exactly once, together. Formats
 * that carry alpha: #rgba, #rrggbbaa, rgba()/hsla() (comma or slash syntax)
 * and `transparent`; anything else is taken as opaque.
 */
function splitColorAlpha(color: string): { css: string; alpha: number } {
  const v = color.trim().toLowerCase()
  if (v === 'transparent') return { css: '#000000', alpha: 0 }
  const hex = /^#([0-9a-f]{3,8})$/.exec(v)
  if (hex) {
    const d = hex[1]
    if (d.length === 4) return { css: `#${d.slice(0, 3)}`, alpha: parseInt(d[3] + d[3], 16) / 255 }
    if (d.length === 8) return { css: `#${d.slice(0, 6)}`, alpha: parseInt(d.slice(6), 16) / 255 }
    return { css: color, alpha: 1 }
  }
  const fn = /^(rgb|hsl)a?\(\s*(.*?)\s*\)$/.exec(v)
  if (!fn) return { css: color, alpha: 1 }
  const parseAlpha = (text: string): number => {
    const n = parseFloat(text)
    if (!Number.isFinite(n)) return 1
    return clamp(text.trim().endsWith('%') ? n / 100 : n, 0, 1)
  }
  const body = fn[2]
  const slash = body.indexOf('/')
  if (slash >= 0) return { css: `${fn[1]}(${body.slice(0, slash).trim()})`, alpha: parseAlpha(body.slice(slash + 1)) }
  const parts = body.split(',').map((s) => s.trim())
  if (parts.length === 4) return { css: `${fn[1]}(${parts.slice(0, 3).join(', ')})`, alpha: parseAlpha(parts[3]) }
  return { css: color, alpha: 1 }
}

/** The stroke's colour as something fillStyle / strokeStyle accepts, plus the alpha that came with it. */
function resolvePaint(ctx: CanvasRenderingContext2D, stroke: Stroke, a: Point, b: Point): { color: string | CanvasGradient; alpha: number } {
  const resolved = resolveColorStyle(ctx, stroke.style.color, a, b)
  if (typeof resolved !== 'string') return { color: resolved, alpha: 1 }
  const { css, alpha } = splitColorAlpha(resolved)
  return { color: css, alpha }
}

// ── Curve geometry ───────────────────────────────────────────────────────────

/**
 * Drop points that repeat the one before them (and, for a closed contour, a
 * last point that repeats the first). A repeat has no direction, so left in it
 * would bend the smoothed curve into a corner.
 */
function cleanPoints(points: Point[], closed: boolean): Point[] {
  const out: Point[] = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || Math.abs(p.x - last.x) > 1e-9 || Math.abs(p.y - last.y) > 1e-9) out.push(p)
  }
  if (closed && out.length > 1) {
    const first = out[0]
    const last = out[out.length - 1]
    if (Math.abs(first.x - last.x) <= 1e-9 && Math.abs(first.y - last.y) <= 1e-9) out.pop()
  }
  return out
}

/**
 * Cubic Bezier segments of a curve that passes through every control point.
 * The handle at each point points along the line through its two neighbours
 * and is a third of the adjoining chord long, so the tangent direction is the
 * same on both sides of a point (no corner) and uneven spacing does not make
 * the curve loop or overshoot. Expects points from cleanPoints.
 */
function smoothSegments(points: Point[], closed: boolean): CubicSegment[] {
  const n = points.length
  const at = (i: number): Point => (closed ? points[((i % n) + n) % n] : points[clamp(i, 0, n - 1)])
  const count = closed ? n : n - 1
  const handle = (i: number): Point => {
    const prev = at(i - 1)
    const next = at(i + 1)
    const dx = next.x - prev.x
    const dy = next.y - prev.y
    const len = Math.hypot(dx, dy)
    return len > 1e-9 ? { x: dx / len, y: dy / len } : { x: 0, y: 0 }
  }
  const segments: CubicSegment[] = []
  for (let i = 0; i < count; i++) {
    const a = at(i)
    const b = at(i + 1)
    const chord = Math.hypot(b.x - a.x, b.y - a.y) / 3
    const da = handle(i)
    const db = handle(i + 1)
    segments.push({
      p0: a,
      cp1: { x: a.x + da.x * chord, y: a.y + da.y * chord },
      cp2: { x: b.x - db.x * chord, y: b.y - db.y * chord },
      p1: b,
    })
  }
  return segments
}

function cubicAt(s: CubicSegment, t: number): Point {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * s.p0.x + b * s.cp1.x + c * s.cp2.x + d * s.p1.x,
    y: a * s.p0.y + b * s.cp1.y + c * s.cp2.y + d * s.p1.y,
  }
}

/** The path a brush follows as a polyline: the points themselves, or the smoothed curve sampled finely. */
function flattenPath(points: Point[], smooth: boolean): Point[] {
  if (!smooth || points.length < 3) return points
  const out: Point[] = [points[0]]
  for (const seg of smoothSegments(points, false)) {
    const hull = Math.hypot(seg.cp1.x - seg.p0.x, seg.cp1.y - seg.p0.y) +
      Math.hypot(seg.cp2.x - seg.cp1.x, seg.cp2.y - seg.cp1.y) +
      Math.hypot(seg.p1.x - seg.cp2.x, seg.p1.y - seg.cp2.y)
    const steps = clamp(Math.ceil(hull / 3), 4, 48)
    for (let i = 1; i <= steps; i++) out.push(cubicAt(seg, i / steps))
  }
  return out
}

function polylineLength(poly: Point[]): number {
  let total = 0
  for (let i = 1; i < poly.length; i++) total += Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y)
  return total
}

interface Sample extends Point { t: number }

/**
 * Cut the polyline into pieces no longer than `step`, keeping every original
 * vertex so corners are never cut. `t` is the share of the total length
 * covered up to the sample.
 */
function sampleAlong(poly: Point[], total: number, step: number): Sample[] {
  const samples: Sample[] = [{ x: poly[0].x, y: poly[0].y, t: 0 }]
  let done = 0
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]
    const b = poly[i]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len === 0) continue
    const pieces = Math.max(1, Math.ceil(len / step))
    for (let k = 1; k <= pieces; k++) {
      const f = k / pieces
      samples.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t: (done + len * f) / total })
    }
    done += len
  }
  return samples
}

/** `count + 1` samples spaced evenly by arc length (corners are not kept: for smooth curves that are already dense). */
function sampleUniform(poly: Point[], total: number, count: number): Sample[] {
  const samples: Sample[] = []
  let seg = 1
  let acc = 0
  let segLen = Math.hypot(poly[1].x - poly[0].x, poly[1].y - poly[0].y)
  for (let k = 0; k <= count; k++) {
    const target = (total * k) / count
    while (seg < poly.length - 1 && acc + segLen < target) {
      acc += segLen
      seg++
      segLen = Math.hypot(poly[seg].x - poly[seg - 1].x, poly[seg].y - poly[seg - 1].y)
    }
    const f = segLen > 0 ? clamp((target - acc) / segLen, 0, 1) : 0
    const a = poly[seg - 1]
    const b = poly[seg]
    samples.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, t: k / count })
  }
  return samples
}

interface Bounds { minX: number; minY: number; maxX: number; maxY: number }

function boundsOf(points: Point[]): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

// ── Soft edge ────────────────────────────────────────────────────────────────

interface Pass {
  /** Share of the full width this pass spans (1 = the whole stroke). */
  ratio: number
  alpha: number
}

/** Opacity profile of a soft edge: 0 at the rim, 1 at the core, steep at first so the fade reads. */
function rollOff(s: number): number {
  return s * (2 - s)
}

/**
 * Passes that draw a stroke with a soft edge, widest first, each narrower than
 * the last. The opaque core is `hardness` of the width; from there the opacity
 * rolls off towards the rim (see rollOff), so the fade is clearly visible while
 * the rim still sits at the requested width. There is about one pass per pixel
 * of rim so the rings are not visible as steps. Pass alphas are chosen so that,
 * composited in order, each ring ends up with the opacity of that curve.
 */
function featherPasses(alpha: number, hardness: number, width: number): Pass[] {
  if (hardness >= 0.999) return [{ ratio: 1, alpha }]
  const core = Math.max(hardness, MIN_CORE_RATIO)
  const count = clamp(Math.ceil(((1 - core) * width) / 2), MIN_FEATHER_PASSES, MAX_FEATHER_PASSES)
  const passes: Pass[] = []
  let covered = 0
  for (let k = 0; k < count; k++) {
    // Ring k lies between this pass's radius and the next one's; s runs 0 (rim) to 1 (core).
    const s = (k + 0.5) / (count - 1)
    const target = k === count - 1 ? alpha : alpha * rollOff(s)
    // Alpha a with 1 - (1 - covered)(1 - a) = target.
    const a = covered >= 1 ? 0 : clamp(1 - (1 - target) / (1 - covered), 0, 1)
    covered = target
    passes.push({ ratio: 1 - (1 - core) * k / (count - 1), alpha: a })
  }
  return passes
}

// ── Offscreen surface ────────────────────────────────────────────────────────

interface Scratch { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }

const scratchPool: Array<Scratch | undefined> = []
let offscreenRetryAt = 0

/**
 * Reusable offscreen canvas with room for the given size, cleared. It only
 * ever grows, so a run of strokes of different sizes does not reallocate it.
 * Null when no 2D context can be made; it is tried again after a short wait.
 */
function acquireScratch(slot: number, width: number, height: number): Scratch | null {
  if (typeof document === 'undefined' || width < 1 || height < 1) return null
  let scratch = scratchPool[slot]
  if (scratch && typeof scratch.ctx.isContextLost === 'function' && scratch.ctx.isContextLost()) {
    scratchPool[slot] = undefined
    scratch = undefined
  }
  if (!scratch) {
    if (Date.now() < offscreenRetryAt) return null
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) {
      offscreenRetryAt = Date.now() + OFFSCREEN_RETRY_MS
      return null
    }
    scratch = { canvas, ctx }
    scratchPool[slot] = scratch
  }
  const { canvas, ctx } = scratch
  if (canvas.width < width) canvas.width = width
  if (canvas.height < height) canvas.height = height
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.clearRect(0, 0, width, height)
  return scratch
}

interface Surface {
  /** Device pixels per user unit of the destination context. */
  scale: number
  /** Top-left of the surface in user units, aligned to the device pixel grid. */
  x: number
  y: number
  pixelWidth: number
  pixelHeight: number
}

function destinationScale(ctx: CanvasRenderingContext2D): number {
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : null
  const fromTransform = m ? Math.hypot(m.a, m.b) : 0
  if (fromTransform > 0 && Number.isFinite(fromTransform)) return fromTransform
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1
  return Number.isFinite(dpr) && dpr > 0 ? dpr : 1
}

/** Surfaces that together cover the box; one unless it is larger than TILE_SIDE device pixels. */
function surfacesFor(ctx: CanvasRenderingContext2D, box: Bounds): Surface[] {
  const scale = destinationScale(ctx)
  const x = Math.floor(box.minX * scale) / scale
  const y = Math.floor(box.minY * scale) / scale
  const totalW = Math.ceil((box.maxX - x) * scale) + 1
  const totalH = Math.ceil((box.maxY - y) * scale) + 1
  const surfaces: Surface[] = []
  for (let oy = 0; oy < totalH; oy += TILE_SIDE) {
    for (let ox = 0; ox < totalW; ox += TILE_SIDE) {
      surfaces.push({
        scale,
        x: x + ox / scale,
        y: y + oy / scale,
        pixelWidth: Math.min(TILE_SIDE, totalW - ox),
        pixelHeight: Math.min(TILE_SIDE, totalH - oy),
      })
    }
  }
  return surfaces
}

/** Point the scratch context at the surface, so drawing uses the same user units as the destination. */
function aimAt(scratch: Scratch, surface: Surface): void {
  scratch.ctx.setTransform(surface.scale, 0, 0, surface.scale, -surface.x * surface.scale, -surface.y * surface.scale)
}

function paste(ctx: CanvasRenderingContext2D, scratch: Scratch, surface: Surface): void {
  ctx.drawImage(
    scratch.canvas,
    0, 0, surface.pixelWidth, surface.pixelHeight,
    surface.x, surface.y, surface.pixelWidth / surface.scale, surface.pixelHeight / surface.scale,
  )
}

// ── Union paths ──────────────────────────────────────────────────────────────

/**
 * Add a polygon to the path wound the same way as every other shape added with
 * these helpers, so that one fill() draws their union with no double coverage
 * where they overlap and no seam where they meet.
 */
function addPolygon(c: CanvasRenderingContext2D, flat: number[]): void {
  const n = flat.length / 2
  let area2 = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    area2 += flat[2 * i] * flat[2 * j + 1] - flat[2 * j] * flat[2 * i + 1]
  }
  const reversed = area2 < 0
  for (let k = 0; k < n; k++) {
    const idx = reversed ? n - 1 - k : k
    if (k === 0) c.moveTo(flat[2 * idx], flat[2 * idx + 1])
    else c.lineTo(flat[2 * idx], flat[2 * idx + 1])
  }
  c.closePath()
}

function addDisc(c: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  if (!(r > 0)) return
  c.moveTo(x + r, y)
  c.ellipse(x, y, r, r, 0, 0, Math.PI * 2)
  c.closePath()
}

/** Per-segment geometry of a sampled stroke; `radius(i)` is the half width at sample i. */
interface Frame {
  samples: Sample[]
  /** Unit direction of each segment. */
  dx: number[]
  dy: number[]
  radius: (i: number) => number
}

function makeFrame(samples: Sample[], widthAt: (t: number) => number, scale: number, extra: number): Frame {
  const dx: number[] = []
  const dy: number[] = []
  for (let k = 0; k < samples.length - 1; k++) {
    const len = Math.hypot(samples[k + 1].x - samples[k].x, samples[k + 1].y - samples[k].y) || 1
    dx.push((samples[k + 1].x - samples[k].x) / len)
    dy.push((samples[k + 1].y - samples[k].y) / len)
  }
  return { samples, dx, dy, radius: (i) => Math.max(0, (widthAt(samples[i].t) * scale) / 2 + extra) }
}

/** Quad covering segment k (between samples k and k+1). */
function addQuad(c: CanvasRenderingContext2D, f: Frame, k: number): void {
  const a = f.samples[k]
  const b = f.samples[k + 1]
  const nx = -f.dy[k]
  const ny = f.dx[k]
  const ra = f.radius(k)
  const rb = f.radius(k + 1)
  addPolygon(c, [a.x + nx * ra, a.y + ny * ra, b.x + nx * rb, b.y + ny * rb, b.x - nx * rb, b.y - ny * rb, a.x - nx * ra, a.y - ny * ra])
}

/**
 * Fill the gap on the outside of a bend at sample j (between segments j-1 and
 * j) with a fan of radius r around the joint, so a bend keeps a round outline.
 */
function addFan(c: CanvasRenderingContext2D, f: Frame, j: number, r: number): void {
  const dax = f.dx[j - 1]
  const day = f.dy[j - 1]
  const dbx = f.dx[j]
  const dby = f.dy[j]
  const cross = dax * dby - day * dbx
  const side = cross > 0 ? -1 : 1
  // Normals of both segments on the outer side.
  const ax = -day * side
  const ay = dax * side
  const bx = -dby * side
  const by = dbx * side
  const phiA = Math.atan2(ay, ax)
  let delta = Math.atan2(ax * by - ay * bx, ax * bx + ay * by)
  if (Math.abs(delta) < 1e-3) return
  if (Math.abs(delta) > Math.PI - 1e-3) {
    // A full reversal: sweep through the side the stroke was heading to.
    const mid = phiA + Math.PI / 2
    delta = Math.cos(mid) * (dax - dbx) + Math.sin(mid) * (day - dby) >= 0 ? Math.PI : -Math.PI
  }
  const v = f.samples[j]
  const steps = Math.max(1, Math.ceil(Math.abs(delta) / 0.35))
  const flat = [v.x, v.y]
  for (let i = 0; i <= steps; i++) {
    const phi = phiA + (delta * i) / steps
    flat.push(v.x + Math.cos(phi) * r, v.y + Math.sin(phi) * r)
  }
  addPolygon(c, flat)
}

/** A half disc past the end of the stroke: `forward` is the unit direction pointing out of the stroke. */
function addCap(c: CanvasRenderingContext2D, x: number, y: number, fx: number, fy: number, r: number): void {
  if (!(r > 0)) return
  const base = Math.atan2(fy, fx)
  const flat: number[] = []
  const steps = 12
  for (let i = 0; i <= steps; i++) {
    const phi = base - Math.PI / 2 + (Math.PI * i) / steps
    flat.push(x + Math.cos(phi) * r, y + Math.sin(phi) * r)
  }
  addPolygon(c, flat)
}

/**
 * Path of a variable-width stroke along the samples, `scale` times as wide: a
 * quad per segment, round caps at both ends and a fan on the outside of every
 * joint. Each quad ends square to its own segment, so on the outside of any
 * bend, however slight, two neighbours leave a wedge that opens to a slit of
 * about radius x turn at the rim; the fan closes it. Filled once it is the
 * union of all of them.
 */
function traceRibbon(c: CanvasRenderingContext2D, samples: Sample[], widthAt: (t: number) => number, scale: number): void {
  const f = makeFrame(samples, widthAt, scale, 0)
  const n = samples.length
  c.beginPath()
  for (let k = 0; k < n - 1; k++) addQuad(c, f, k)
  addDisc(c, samples[0].x, samples[0].y, f.radius(0))
  addDisc(c, samples[n - 1].x, samples[n - 1].y, f.radius(n - 1))
  for (let j = 1; j < n - 1; j++) addFan(c, f, j, f.radius(j))
}

// ── Brush ────────────────────────────────────────────────────────────────────

function traceBrush(ctx: CanvasRenderingContext2D, points: Point[], smooth: boolean): void {
  ctx.beginPath()
  ctx.moveTo(points[0].x, points[0].y)
  if (smooth && points.length >= 3) {
    for (const seg of smoothSegments(points, false)) {
      ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p1.x, seg.p1.y)
    }
  } else {
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
  }
}

/**
 * Draw a brush stroke. A stroke whose width and opacity stay constant is one
 * path per feather pass. A width ramp at constant opacity is one filled
 * ribbon per pass. Opacity that changes along the stroke is drawn on an
 * offscreen surface (see renderFadingRibbon).
 */
export function renderPaintBrush(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  if (!stroke.points || stroke.points.length < 2) return
  const smooth = stroke.smooth === true
  const points = cleanPoints(stroke.points, false)
  const width = readWidth(stroke)
  const opacity = readOpacity(stroke)
  const hardness = readHardness(stroke)
  const { color, alpha: colorAlpha } = resolvePaint(ctx, stroke, stroke.points[0], stroke.points[stroke.points.length - 1])
  const a0 = opacity.start * colorAlpha
  const a1 = opacity.end * colorAlpha
  const maxWidth = Math.max(width.start, width.end)

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.strokeStyle = color
  ctx.fillStyle = color
  if (points.length < 2) {
    // Every point is the same: a dot as wide as the stroke starts.
    for (const pass of featherPasses(a0, hardness, width.start)) {
      ctx.globalAlpha = pass.alpha
      ctx.beginPath()
      addDisc(ctx, points[0].x, points[0].y, (width.start * pass.ratio) / 2)
      ctx.fill()
    }
  } else if (width.start === width.end && a0 === a1) {
    for (const pass of featherPasses(a0, hardness, width.start)) {
      ctx.globalAlpha = pass.alpha
      ctx.lineWidth = width.start * pass.ratio
      traceBrush(ctx, points, smooth)
      ctx.stroke()
    }
  } else {
    renderRamp(ctx, flattenPath(points, smooth), smooth, width, maxWidth, a0, a1, hardness, color)
  }
  ctx.restore()
}

function renderRamp(
  ctx: CanvasRenderingContext2D,
  poly: Point[],
  smooth: boolean,
  width: Range,
  maxWidth: number,
  a0: number,
  a1: number,
  hardness: number,
  color: string | CanvasGradient,
): void {
  const total = polylineLength(poly)
  // Fine enough that neither the width nor the opacity visibly steps, and never more than MAX_RAMP_PIECES.
  const pieces = clamp(Math.ceil(Math.max(total / 5, Math.abs(width.end - width.start) * 3, Math.abs(a1 - a0) * 80)), 2, MAX_RAMP_PIECES)
  // A smooth curve is already dense: space the samples evenly. A polyline keeps its corners.
  const samples = smooth ? sampleUniform(poly, total, pieces) : sampleAlong(poly, total, total / pieces)
  const widthAt = (t: number): number => width.start + (width.end - width.start) * t

  if (a0 === a1) {
    // Constant opacity: each pass is one fill of the whole ribbon.
    for (const pass of featherPasses(a0, hardness, maxWidth)) {
      ctx.globalAlpha = pass.alpha
      traceRibbon(ctx, samples, widthAt, pass.ratio)
      ctx.fill()
    }
    return
  }
  if (renderFadingRibbon(ctx, samples, widthAt, maxWidth, a0, a1, hardness, color)) return

  // No offscreen surface: segment by segment. Where the opacity is below 1 the
  // round ends overlap a little, so the joins may show slightly darker.
  ctx.fillStyle = color
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1]
    const b = samples[i]
    const t = (a.t + b.t) / 2
    for (const pass of featherPasses(a0 + (a1 - a0) * t, hardness, widthAt(t))) {
      ctx.globalAlpha = pass.alpha
      ctx.lineWidth = widthAt(t) * pass.ratio
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }
}

/**
 * A stroke whose opacity runs from a0 to a1 along its length, drawn without
 * seams or darker overlaps.
 *
 * 1. On an offscreen surface the whole ribbon is drawn once per feather pass at
 *    full opacity, so it carries only the soft-edge profile.
 * 2. Every segment gets an integer level j = round(ln(top / opacity) / L), so
 *    its opacity is top * e^(-L j). Write j in binary: the factor e^(-L j) is
 *    the product of e^(-L 2^b) over the set bits b. So for each bit b, the
 *    quads that have it are erased by the factor 1 - e^(-L 2^b), in one fill of
 *    one path. A run of consecutive quads is one connected region; the runs
 *    of a bit are separated by quads without the bit, so no edge is shared by
 *    two erases. The joint in front of each quad gets a fan on the outside of the bend, with that quad's level, and
 *    the stroke's two ends get a half disc, so the outline stays round.
 * 3. The result is pasted with `top` as globalAlpha.
 *
 * At most 9 erase fills per surface, and each quad is in at most 9 of them.
 * Returns false (having drawn nothing) when no offscreen surface can be made.
 */
function renderFadingRibbon(
  ctx: CanvasRenderingContext2D,
  samples: Sample[],
  widthAt: (t: number) => number,
  maxWidth: number,
  a0: number,
  a1: number,
  hardness: number,
  color: string | CanvasGradient,
): boolean {
  const top = Math.max(a0, a1)
  if (!(top > 0)) return true
  const n = samples.length
  const levels: number[] = []
  let maxLevel = 0
  for (let k = 0; k < n - 1; k++) {
    const t = (samples[k].t + samples[k + 1].t) / 2
    const a = a0 + (a1 - a0) * t
    const level = a > 0 ? clamp(Math.round(Math.log(top / a) / RAMP_LAMBDA), 0, MAX_RAMP_LEVEL) : MAX_RAMP_LEVEL
    levels.push(level)
    if (level > maxLevel) maxLevel = level
  }
  const bitCount = maxLevel > 0 ? Math.floor(Math.log2(maxLevel)) + 1 : 0

  const margin = maxWidth / 2 + 2
  const box = boundsOf(samples)
  const surfaces = surfacesFor(ctx, { minX: box.minX - margin, minY: box.minY - margin, maxX: box.maxX + margin, maxY: box.maxY + margin })
  const profile = featherPasses(1, hardness, maxWidth)
  const erase = makeFrame(samples, widthAt, 1, 1)
  let painted = false
  for (const surface of surfaces) {
    const scratch = acquireScratch(0, surface.pixelWidth, surface.pixelHeight)
    // Only the first tile may report failure (nothing is drawn yet, the caller falls back).
    if (!scratch) {
      if (painted) continue
      return false
    }
    painted = true
    aimAt(scratch, surface)
    const sctx = scratch.ctx
    sctx.fillStyle = color
    for (const pass of profile) {
      sctx.globalAlpha = pass.alpha
      traceRibbon(sctx, samples, widthAt, pass.ratio)
      sctx.fill()
    }
    sctx.globalCompositeOperation = 'destination-out'
    sctx.fillStyle = '#000'
    for (let bit = 0; bit < bitCount; bit++) {
      const has = (k: number): boolean => k >= 0 && k < n - 1 && ((levels[k] >> bit) & 1) === 1
      let any = false
      sctx.beginPath()
      for (let k = 0; k < n - 1; k++) {
        if (!has(k)) continue
        any = true
        addQuad(sctx, erase, k)
        // The wedge at the joint before this quad takes this quad's level, so it never sits at a run boundary unerased.
        if (k > 0) addFan(sctx, erase, k, erase.radius(k))
      }
      if (!any) continue
      if (has(0)) addCap(sctx, samples[0].x, samples[0].y, -erase.dx[0], -erase.dy[0], erase.radius(0))
      if (has(n - 2)) addCap(sctx, samples[n - 1].x, samples[n - 1].y, erase.dx[n - 2], erase.dy[n - 2], erase.radius(n - 1))
      sctx.globalAlpha = 1 - Math.exp(-RAMP_LAMBDA * 2 ** bit)
      sctx.fill()
    }
    sctx.globalCompositeOperation = 'source-over'
    sctx.globalAlpha = 1
    ctx.save()
    ctx.globalAlpha = top
    paste(ctx, scratch, surface)
    ctx.restore()
  }
  return true
}

// ── Fill ─────────────────────────────────────────────────────────────────────

interface HoleData { points: Point[]; smooth?: boolean }

function readHoles(stroke: Stroke): HoleData[] {
  const raw = stroke.holes
  if (!Array.isArray(raw)) return []
  return raw.filter((h): h is HoleData => !!h && Array.isArray((h as HoleData).points) && (h as HoleData).points.length >= 3)
}

function traceClosed(ctx: CanvasRenderingContext2D, rawPoints: Point[], smooth: boolean): void {
  const points = cleanPoints(rawPoints, true)
  if (points.length < 2) return
  ctx.moveTo(points[0].x, points[0].y)
  if (smooth && points.length >= 3) {
    for (const seg of smoothSegments(points, true)) {
      ctx.bezierCurveTo(seg.cp1.x, seg.cp1.y, seg.cp2.x, seg.cp2.y, seg.p1.x, seg.p1.y)
    }
  } else {
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y)
  }
  ctx.closePath()
}

/** Add the fill's outer contour and every hole to the current path as separate subpaths. */
function traceFill(ctx: CanvasRenderingContext2D, stroke: Stroke, holes: HoleData[]): void {
  const points = stroke.points
  ctx.beginPath()
  if (stroke.shapeType === 'rect' || stroke.shapeType === 'ellipse') {
    const a = points[0]
    const b = points[1]
    const x = Math.min(a.x, b.x)
    const y = Math.min(a.y, b.y)
    const w = Math.abs(b.x - a.x)
    const h = Math.abs(b.y - a.y)
    if (stroke.shapeType === 'rect') {
      ctx.rect(x, y, w, h)
    } else {
      // moveTo first so the ellipse starts its own subpath instead of joining the previous one.
      ctx.moveTo(x + w, y + h / 2)
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
      ctx.closePath()
    }
  } else {
    traceClosed(ctx, points, stroke.smooth === true)
  }
  for (const hole of holes) traceClosed(ctx, hole.points, hole.smooth === true)
}

/** Outer bounds of the fill, control handles included so a smooth contour never leaves the box. */
function fillBounds(stroke: Stroke): Bounds {
  const all: Point[] = []
  const contour = (raw: Point[], smooth: boolean): void => {
    const points = cleanPoints(raw, true)
    all.push(...points)
    if (smooth && points.length >= 3) {
      for (const seg of smoothSegments(points, true)) all.push(seg.cp1, seg.cp2)
    }
  }
  if (stroke.shapeType === 'rect' || stroke.shapeType === 'ellipse') all.push(...stroke.points.slice(0, 2))
  else contour(stroke.points, stroke.smooth === true)
  for (const hole of readHoles(stroke)) contour(hole.points, hole.smooth === true)
  return boundsOf(all)
}

/**
 * Fill a closed contour (polygon, smooth polygon, rectangle or ellipse) with
 * the stroke's colour. Holes are extra subpaths filled with the even-odd rule,
 * so they stay empty. With hardness below 1 the opacity fades in from the
 * edges (outer contour and holes alike); the shape never grows past its outline.
 */
export function renderPaintFill(ctx: CanvasRenderingContext2D, stroke: Stroke): void {
  const points = stroke.points
  if (!points || points.length < 2) return
  if (stroke.shapeType !== 'rect' && stroke.shapeType !== 'ellipse' && points.length < 3) return
  const holes = readHoles(stroke)
  const hardness = readHardness(stroke)
  const { color, alpha: colorAlpha } = resolvePaint(ctx, stroke, points[0], points[points.length - 1])
  const alpha = readOpacity(stroke).start * colorAlpha
  const rule: CanvasFillRule | undefined = holes.length > 0 ? 'evenodd' : undefined

  if (hardness < 0.999 && renderSoftFill(ctx, stroke, holes, color, alpha, hardness)) return

  ctx.save()
  ctx.fillStyle = color
  ctx.globalAlpha = alpha
  traceFill(ctx, stroke, holes)
  if (rule) ctx.fill(rule)
  else ctx.fill()
  ctx.restore()
}

/**
 * Soft edge: the shape is drawn opaque on an offscreen surface, then thinned
 * towards its edges (the outline and every hole) by nested bands. Clipped to
 * the shape, a stroke of half-width d along the outline covers exactly the
 * strip of depth d inside it. Erasing the strips for d = F/K .. F by small
 * factors (they multiply where strips overlap) leaves the opacity rolling off
 * from 0 at the edge to full at depth F, in K steps of about a pixel. The
 * shape never grows past its outline and a hole stays empty. One fill, one
 * clip and K strokes per surface; no mask surface and no per-ring image copy.
 * Returns false when no offscreen surface exists (the caller then fills hard).
 */
function renderSoftFill(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  holes: HoleData[],
  color: string | CanvasGradient,
  alpha: number,
  hardness: number,
): boolean {
  const b = fillBounds(stroke)
  const feather = (1 - hardness) * Math.min(MAX_FILL_FEATHER, 0.5 * Math.min(b.maxX - b.minX, b.maxY - b.minY))
  if (!(feather > 0.5)) return false
  const rule: CanvasFillRule = holes.length > 0 ? 'evenodd' : 'nonzero'
  const rings = clamp(Math.ceil(feather), MIN_FILL_RINGS, MAX_FILL_RINGS)
  // Opacity left at the middle of strip i (i = 1 at the edge .. rings at the core), and the factor that strip erases.
  const keep = (i: number): number => (i > rings ? 1 : rollOff((i - 0.5) / rings))
  const surfaces = surfacesFor(ctx, { minX: b.minX - 2, minY: b.minY - 2, maxX: b.maxX + 2, maxY: b.maxY + 2 })
  let painted = false
  for (const surface of surfaces) {
    const scratch = acquireScratch(1, surface.pixelWidth, surface.pixelHeight)
    if (!scratch) {
      if (painted) continue
      return false
    }
    painted = true
    aimAt(scratch, surface)
    const sctx = scratch.ctx
    sctx.fillStyle = color
    traceFill(sctx, stroke, holes)
    sctx.fill(rule)
    sctx.save()
    sctx.clip(rule)
    sctx.globalCompositeOperation = 'destination-out'
    sctx.strokeStyle = '#000'
    sctx.lineJoin = 'round'
    for (let i = 1; i <= rings; i++) {
      const erase = 1 - keep(i) / keep(i + 1)
      if (erase <= 0) continue
      sctx.globalAlpha = erase
      sctx.lineWidth = (2 * feather * i) / rings
      sctx.stroke()
    }
    sctx.restore()
    ctx.save()
    ctx.globalAlpha = alpha
    paste(ctx, scratch, surface)
    ctx.restore()
  }
  return true
}
