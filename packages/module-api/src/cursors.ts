/**
 * Cursor compilation + sanitisation helpers shared by host runtime and
 * plugin SDK.
 *
 * Three closure layers gate every cursor entry before it reaches
 * `v-html`: R1–R12 shape validation here, DOMPurify content sanitisation
 * inside compileCursor, and a deep-clone + freeze in the contribution
 * store. Removing any one of them re-opens an attack surface the others
 * cannot close.
 */

import DOMPurify from 'dompurify'
import type {
  CursorContribution,
  CursorSpec,
  Hotspot,
  PngCursorSpec,
  SvgCursorSpec,
} from './types/contributions'

export interface CompiledCursor {
  /** Sanitised SVG / HTML fragment to mount as `innerHTML` on the cursor element. */
  svgMarkup: string
  /** Hotspot offset, in CSS pixels relative to the markup's top-left. */
  hotspot: Hotspot
  /** CSS keyword fallback retained for legacy callers. */
  fallbackCssKeyword: string
}

export interface CursorResolutionContext {
  /**
   * Hostname-encoded plugin id (`@acme/x` → `acme.x`) used to assemble
   * `openpen-plugin://<hostname>/<path>` URLs for relative-path specs.
   * Undefined for built-in modules — path-form specs without a hostname
   * resolve to `null` (host falls back to its default cursor).
   */
  pluginHostname?: string
  /** Injection point for tests; defaults to global `fetch`. */
  fetchImpl?: typeof fetch
}

/**
 * W3C CSS UI Level 3 cursor keywords. The legacy `cursor: string` form
 * MUST match one of these (case-insensitive after trim); everything else
 * is rejected by R2 / R12.
 */
export const SAFE_CURSOR_KEYWORDS: ReadonlySet<string> = new Set([
  'auto', 'default', 'none',
  'context-menu', 'help', 'pointer', 'progress', 'wait',
  'cell', 'crosshair', 'text', 'vertical-text',
  'alias', 'copy', 'move', 'no-drop', 'not-allowed', 'grab', 'grabbing',
  'e-resize', 'n-resize', 'ne-resize', 'nw-resize',
  's-resize', 'se-resize', 'sw-resize', 'w-resize',
  'ew-resize', 'ns-resize', 'nesw-resize', 'nwse-resize',
  'col-resize', 'row-resize', 'all-scroll',
  'zoom-in', 'zoom-out',
])

const FORBIDDEN_CSS_LOAD_PATTERN = /url\s*\(|image-set\s*\(|-webkit-image-set\s*\(/i

const DEFAULT_FALLBACK_KEYWORD = 'crosshair'

export function isSafeRelativePath(p: unknown): p is string {
  if (typeof p !== 'string' || p.length === 0) return false
  // Bare `:` catches scheme prefixes without `://` (e.g. `data:`).
  if (p.includes(':')) return false
  if (p.startsWith('/')) return false
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '..') return false
  }
  return true
}

export function pluginHostname(moduleId: string): string {
  return moduleId.replace(/^@/, '').replace(/\//g, '.')
}

export function pluginAssetUrl(moduleId: string, relativePath: string): string {
  if (!isSafeRelativePath(relativePath)) {
    throw new Error(`Unsafe asset path: ${relativePath}`)
  }
  return `openpen-plugin://${pluginHostname(moduleId)}/${relativePath}`
}

/**
 * Sanitise SVG markup before it reaches `v-html`. Rationale for each
 * flag: `USE_PROFILES: { svg: true }` covers script tags, on* handlers,
 * and javascript: hrefs; `FORBID_TAGS: ['foreignObject']` closes the
 * mXSS escape hatch the SVG profile alone does not; turning off
 * `ALLOW_UNKNOWN_PROTOCOLS` blocks `<use href="data:...">` and friends.
 */
export function sanitizeSvgMarkup(raw: string): string {
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { svg: true },
    FORBID_TAGS: ['foreignObject'],
    // Cursor SVGs use presentation attributes (fill/stroke/etc.), never
    // inline `style`. Forbidding it strips legacy `expression()` CSS
    // smuggling vectors (S7) without touching anything we draw.
    FORBID_ATTR: ['style'],
    ALLOW_UNKNOWN_PROTOCOLS: false,
  })
}

function resolveHotspot(spec: SvgCursorSpec | PngCursorSpec): Hotspot {
  const h = spec.hotspot
  if (!h || typeof h !== 'object') return { x: 0, y: 0 }
  const x = typeof h.x === 'number' && Number.isFinite(h.x) ? h.x : 0
  const y = typeof h.y === 'number' && Number.isFinite(h.y) ? h.y : 0
  return { x, y }
}

function resolveFallback(spec: SvgCursorSpec | PngCursorSpec): string {
  return typeof spec.fallback === 'string' && spec.fallback.length > 0
    ? spec.fallback
    : DEFAULT_FALLBACK_KEYWORD
}

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Convert a frozen, shape-validated CursorContribution.cursor into render
 * data ready for `v-html`. Returns `null` for legacy keyword strings
 * (caller falls back to the host default cursor) and for any spec the
 * sanitiser empties out completely.
 *
 * Async because path-form SVG specs are fetched through `openpen-plugin://`
 * at compile time; inline + PNG branches resolve synchronously inside the
 * returned Promise.
 */
export async function compileCursor(
  spec: CursorSpec,
  context: CursorResolutionContext = {},
): Promise<CompiledCursor | null> {
  if (typeof spec === 'string') return null
  if (!spec || typeof spec !== 'object') return null

  if ('svg' in spec && typeof spec.svg === 'string') {
    const hotspot = resolveHotspot(spec)
    const fallbackCssKeyword = resolveFallback(spec)
    const trimmed = spec.svg.trim()

    if (trimmed.startsWith('<')) {
      const sanitised = sanitizeSvgMarkup(trimmed)
      if (!sanitised) return null
      return { svgMarkup: sanitised, hotspot, fallbackCssKeyword }
    }

    if (!context.pluginHostname || !isSafeRelativePath(trimmed)) return null
    const url = `openpen-plugin://${context.pluginHostname}/${trimmed}`
    const fetchImpl = context.fetchImpl
      ?? (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : undefined)
    if (!fetchImpl) return null

    try {
      const resp = await fetchImpl(url)
      if (!resp.ok) return null
      const raw = await resp.text()
      const sanitised = sanitizeSvgMarkup(raw)
      if (!sanitised) return null
      return { svgMarkup: sanitised, hotspot, fallbackCssKeyword }
    } catch {
      return null
    }
  }

  if ('png' in spec && typeof spec.png === 'string') {
    const hotspot = resolveHotspot(spec)
    const fallbackCssKeyword = resolveFallback(spec)
    const trimmed = spec.png.trim()
    if (!context.pluginHostname || !isSafeRelativePath(trimmed)) return null
    const url = escapeHtmlAttr(`openpen-plugin://${context.pluginHostname}/${trimmed}`)
    const svgMarkup =
      `<img src="${url}" alt="" style="display:block;max-width:64px;max-height:64px;" />`
    return { svgMarkup, hotspot, fallbackCssKeyword }
  }

  return null
}

export type CursorSanitizeRule =
  | 'R1' | 'R2' | 'R3' | 'R4' | 'R5' | 'R6'
  | 'R7' | 'R8' | 'R9' | 'R10' | 'R11' | 'R12'

export interface CursorSanitizeDiagnostic {
  /** Contribution id, or `'<unknown>'` if `id` was missing / invalid. */
  id: string
  rule: CursorSanitizeRule
  reason: string
}

export interface CursorSanitizeOptions {
  /**
   * Built-in modules (host bundle) cannot use path forms because they
   * have no `openpen-plugin://<hostname>` namespace. R7 / R10 reject
   * such contributions for built-ins.
   */
  isBuiltin?: boolean
}

export interface CursorSanitizeResult {
  cleaned: CursorContribution[]
  diagnostics: CursorSanitizeDiagnostic[]
}

/**
 * Shape-validate raw cursor contributions before they reach the
 * contribution-store. This is the R1–R12 gate; SVG markup content is
 * sanitised later inside {@link compileCursor} via DOMPurify.
 */
export function sanitizeCursorContributions(
  cursors: unknown,
  options: CursorSanitizeOptions = {},
): CursorSanitizeResult {
  const cleaned: CursorContribution[] = []
  const diagnostics: CursorSanitizeDiagnostic[] = []

  if (!Array.isArray(cursors)) return { cleaned, diagnostics }

  for (const raw of cursors) {
    if (raw === null || typeof raw !== 'object') {
      diagnostics.push({ id: '<unknown>', rule: 'R1', reason: 'contribution is not an object' })
      continue
    }

    const entry = raw as { id?: unknown; cursor?: unknown }
    const id = typeof entry.id === 'string' && entry.id.length > 0 ? entry.id : '<unknown>'

    if (id === '<unknown>') {
      diagnostics.push({ id, rule: 'R1', reason: 'missing or empty `id`' })
      continue
    }

    const { cursor } = entry

    if (typeof cursor === 'string') {
      const trimmedLower = cursor.trim().toLowerCase()
      if (FORBIDDEN_CSS_LOAD_PATTERN.test(trimmedLower)) {
        diagnostics.push({
          id,
          rule: 'R12',
          reason: 'string contains url() / image-set() / -webkit-image-set(); loads external resource',
        })
        continue
      }
      if (!SAFE_CURSOR_KEYWORDS.has(trimmedLower)) {
        diagnostics.push({
          id,
          rule: 'R2',
          reason: `string '${trimmedLower}' is not in the safe CSS cursor keyword whitelist`,
        })
        continue
      }
      cleaned.push({ id, cursor: trimmedLower })
      continue
    }

    if (cursor === null || typeof cursor !== 'object' || Array.isArray(cursor)) {
      diagnostics.push({ id, rule: 'R1', reason: 'cursor field is neither string nor plain object' })
      continue
    }

    const cursorObj = cursor as Record<string, unknown>
    const hasSvg = Object.prototype.hasOwnProperty.call(cursorObj, 'svg')
    const hasPng = Object.prototype.hasOwnProperty.call(cursorObj, 'png')

    if (!hasSvg && !hasPng) {
      diagnostics.push({ id, rule: 'R3', reason: 'cursor object has neither `svg` nor `png` key' })
      continue
    }
    if (hasSvg && hasPng) {
      diagnostics.push({ id, rule: 'R4', reason: 'cursor object has both `svg` and `png` keys (ambiguous)' })
      continue
    }

    if (hasSvg) {
      const svg = cursorObj.svg
      if (typeof svg !== 'string') {
        diagnostics.push({ id, rule: 'R5', reason: '`svg` value is not a string' })
        continue
      }
      const trimmed = svg.trim()
      const isInline = trimmed.startsWith('<')
      if (!isInline) {
        if (!isSafeRelativePath(trimmed)) {
          diagnostics.push({
            id,
            rule: 'R6',
            reason: '`svg` value is non-inline and not a safe relative path',
          })
          continue
        }
        if (options.isBuiltin) {
          diagnostics.push({
            id,
            rule: 'R7',
            reason: 'built-in modules cannot use path-form `svg` (no openpen-plugin hostname)',
          })
          continue
        }
      }
    }

    if (hasPng) {
      const png = cursorObj.png
      if (typeof png !== 'string') {
        diagnostics.push({ id, rule: 'R8', reason: '`png` value is not a string' })
        continue
      }
      if (!isSafeRelativePath(png.trim())) {
        diagnostics.push({
          id,
          rule: 'R9',
          reason: '`png` value is not a safe relative path',
        })
        continue
      }
      if (options.isBuiltin) {
        diagnostics.push({
          id,
          rule: 'R10',
          reason: 'built-in modules cannot use `png` (no openpen-plugin hostname)',
        })
        continue
      }
    }

    if (cursorObj.hotspot !== undefined) {
      const h = cursorObj.hotspot as Record<string, unknown> | null
      const valid =
        h !== null &&
        typeof h === 'object' &&
        typeof h.x === 'number' && Number.isFinite(h.x) && h.x >= 0 &&
        typeof h.y === 'number' && Number.isFinite(h.y) && h.y >= 0
      if (!valid) {
        diagnostics.push({
          id,
          rule: 'R11',
          reason: '`hotspot` must be `{ x: number ≥ 0, y: number ≥ 0 }`',
        })
        continue
      }
    }

    // Output a strictly-allowlisted clone — only known primitive fields
    // pass through. Anything else (function / symbol / getter / circular
    // reference attached as an extra key) is dropped here so the
    // downstream `structuredClone` in the contribution-store cannot
    // throw and trigger a module-wide rollback.
    const cleanedCursor: SvgCursorSpec | PngCursorSpec = hasSvg
      ? { svg: (cursorObj.svg as string).trim() }
      : { png: (cursorObj.png as string).trim() }
    if (cursorObj.hotspot !== undefined) {
      const h = cursorObj.hotspot as { x: number; y: number }
      cleanedCursor.hotspot = { x: h.x, y: h.y }
    }
    if (typeof cursorObj.fallback === 'string') {
      cleanedCursor.fallback = cursorObj.fallback
    }
    cleaned.push({ id, cursor: cleanedCursor })
  }

  return { cleaned, diagnostics }
}
