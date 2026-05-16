import { describe, it, expect } from 'vitest'
import {
  compileCursor,
  isSafeRelativePath,
  pluginHostname,
  pluginAssetUrl,
  sanitizeCursorContributions,
  SAFE_CURSOR_KEYWORDS,
} from '../src/cursors'

describe('isSafeRelativePath', () => {
  it.each([
    'foo.svg',
    'assets/foo.svg',
    'deeply/nested/path.png',
    'a/b/c',
  ])('accepts %s', (p) => {
    expect(isSafeRelativePath(p)).toBe(true)
  })

  it.each([
    '',
    '/abs/path',
    'http://evil/x',
    'https://evil/x',
    'data:image/svg+xml,foo',
    'file:///etc/passwd',
    'openpen-plugin://other/x',
    '../escape.png',
    'a/../escape.png',
    'a//b.png',
    'a/b/..',
  ])('rejects %s', (p) => {
    expect(isSafeRelativePath(p)).toBe(false)
  })

  it.each([null, undefined, 0, false, [], {}])('rejects non-string %p', (p) => {
    expect(isSafeRelativePath(p as unknown as string)).toBe(false)
  })
})

describe('pluginHostname', () => {
  it.each([
    ['@acme/laser', 'acme.laser'],
    ['@scope/name-b', 'scope.name-b'],
    ['acme/laser', 'acme.laser'],
    ['foo', 'foo'],
    ['@a/b/c', 'a.b.c'],
  ])('encodes %s → %s', (input, expected) => {
    expect(pluginHostname(input)).toBe(expected)
  })
})

describe('pluginAssetUrl', () => {
  it('builds openpen-plugin URL for safe inputs', () => {
    expect(pluginAssetUrl('@acme/x', 'a/b.png')).toBe('openpen-plugin://acme.x/a/b.png')
  })

  it.each(['../escape', '/abs', 'http://x', 'a/../b'])('throws on unsafe path %s', (p) => {
    expect(() => pluginAssetUrl('@acme/x', p)).toThrow(/unsafe asset path/i)
  })
})

describe('compileCursor', () => {
  it('returns null for legacy string form', async () => {
    expect(await compileCursor('crosshair')).toBeNull()
    expect(await compileCursor('pointer')).toBeNull()
  })

  it('returns null for null / undefined / non-object', async () => {
    expect(await compileCursor(null as never)).toBeNull()
    expect(await compileCursor(undefined as never)).toBeNull()
    expect(await compileCursor(42 as never)).toBeNull()
  })

  it('compiles inline SVG with default hotspot + fallback', async () => {
    const result = await compileCursor({ svg: '<svg><circle cx="2" cy="2" r="1"/></svg>' })
    expect(result).not.toBeNull()
    expect(result!.hotspot).toEqual({ x: 0, y: 0 })
    expect(result!.fallbackCssKeyword).toBe('crosshair')
    expect(result!.svgMarkup).toContain('<circle')
  })

  it('compiles inline SVG with explicit hotspot + custom fallback', async () => {
    const result = await compileCursor({
      svg: '<svg><path d="M0 0"/></svg>',
      hotspot: { x: 4, y: 8 },
      fallback: 'pointer',
    })
    expect(result).not.toBeNull()
    expect(result!.hotspot).toEqual({ x: 4, y: 8 })
    expect(result!.fallbackCssKeyword).toBe('pointer')
  })

  it('trims leading whitespace before deciding inline vs path', async () => {
    const result = await compileCursor({ svg: '   <svg></svg>' })
    expect(result).not.toBeNull()
    expect(result!.svgMarkup).toContain('<svg')
  })

  it('handles non-ASCII / unicode content in inline SVG', async () => {
    const result = await compileCursor({
      svg: '<svg><text>✏️ 繪</text></svg>',
    })
    expect(result).not.toBeNull()
  })

  it('returns null for path SVG when no plugin context is supplied', async () => {
    expect(await compileCursor({ svg: 'assets/foo.svg' })).toBeNull()
  })

  it('fetches + sanitises path SVG via the resolution context', async () => {
    const fetchImpl = (async (input: string) => ({
      ok: true,
      text: async () => '<svg><rect width="10" height="10"/></svg>',
      url: input,
    })) as unknown as typeof fetch
    const result = await compileCursor(
      { svg: 'assets/foo.svg', hotspot: { x: 2, y: 2 } },
      { pluginHostname: 'acme.x', fetchImpl },
    )
    expect(result).not.toBeNull()
    expect(result!.svgMarkup).toContain('<rect')
    expect(result!.hotspot).toEqual({ x: 2, y: 2 })
  })

  it('returns null when path SVG fetch fails', async () => {
    const fetchImpl = (async () => ({ ok: false, text: async () => '' })) as unknown as typeof fetch
    const result = await compileCursor(
      { svg: 'assets/missing.svg' },
      { pluginHostname: 'acme.x', fetchImpl },
    )
    expect(result).toBeNull()
  })

  it('compiles PNG to an <img> wrapper', async () => {
    const result = await compileCursor(
      { png: 'assets/stamp.png', hotspot: { x: 16, y: 30 } },
      { pluginHostname: 'acme.x' },
    )
    expect(result).not.toBeNull()
    expect(result!.svgMarkup).toContain('<img')
    expect(result!.svgMarkup).toContain('src="openpen-plugin://acme.x/assets/stamp.png"')
    expect(result!.hotspot).toEqual({ x: 16, y: 30 })
  })

  it('returns null for PNG without plugin context', async () => {
    expect(await compileCursor({ png: 'assets/stamp.png' })).toBeNull()
  })

  it('returns null for unsafe PNG path', async () => {
    expect(await compileCursor(
      { png: '../escape.png' },
      { pluginHostname: 'acme.x' },
    )).toBeNull()
  })
})

describe('SAFE_CURSOR_KEYWORDS whitelist', () => {
  it('contains canonical keywords', () => {
    expect(SAFE_CURSOR_KEYWORDS.has('crosshair')).toBe(true)
    expect(SAFE_CURSOR_KEYWORDS.has('pointer')).toBe(true)
    expect(SAFE_CURSOR_KEYWORDS.has('none')).toBe(true)
    expect(SAFE_CURSOR_KEYWORDS.has('grab')).toBe(true)
  })

  it('excludes non-keywords', () => {
    expect(SAFE_CURSOR_KEYWORDS.has('url(foo.png)')).toBe(false)
    expect(SAFE_CURSOR_KEYWORDS.has('javascript:alert(1)')).toBe(false)
    expect(SAFE_CURSOR_KEYWORDS.has('expression(evil())')).toBe(false)
  })
})

describe('sanitizeCursorContributions — R1 invalid shape', () => {
  it('drops non-array input gracefully', () => {
    const { cleaned, diagnostics } = sanitizeCursorContributions(null)
    expect(cleaned).toEqual([])
    expect(diagnostics).toEqual([])
  })

  it('drops non-object entries', () => {
    const { cleaned, diagnostics } = sanitizeCursorContributions(['foo', 42, null])
    expect(cleaned).toEqual([])
    expect(diagnostics).toHaveLength(3)
    expect(diagnostics.every((d) => d.rule === 'R1')).toBe(true)
  })

  it('drops entries with missing or empty id', () => {
    const { cleaned, diagnostics } = sanitizeCursorContributions([
      { cursor: 'crosshair' },
      { id: '', cursor: 'crosshair' },
      { id: 42, cursor: 'crosshair' },
    ])
    expect(cleaned).toEqual([])
    expect(diagnostics).toHaveLength(3)
    expect(diagnostics.every((d) => d.rule === 'R1')).toBe(true)
  })
})

describe('sanitizeCursorContributions — R2 / R12 string-form gate', () => {
  it('accepts whitelisted keywords (case-insensitive, trimmed)', () => {
    const { cleaned, diagnostics } = sanitizeCursorContributions([
      { id: 't1', cursor: 'crosshair' },
      { id: 't2', cursor: '  POINTER  ' },
      { id: 't3', cursor: 'none' },
    ])
    expect(cleaned).toHaveLength(3)
    expect(cleaned[1].cursor).toBe('pointer')
    expect(diagnostics).toEqual([])
  })

  it('R2 rejects unknown keywords', () => {
    const { cleaned, diagnostics } = sanitizeCursorContributions([
      { id: 't1', cursor: 'something-funky' },
    ])
    expect(cleaned).toEqual([])
    expect(diagnostics[0]).toMatchObject({ id: 't1', rule: 'R2' })
  })

  it('R12 rejects url() / image-set() / -webkit-image-set()', () => {
    const cases = [
      'url("evil.png") 0 0, crosshair',
      'image-set("a.png" 1x, "b.png" 2x), pointer',
      '-webkit-image-set(url("a.png") 1x), pointer',
      'URL(  http://evil  )',
    ]
    const { cleaned, diagnostics } = sanitizeCursorContributions(
      cases.map((cursor, i) => ({ id: `t${i}`, cursor })),
    )
    expect(cleaned).toEqual([])
    expect(diagnostics).toHaveLength(cases.length)
    expect(diagnostics.every((d) => d.rule === 'R12')).toBe(true)
  })
})

describe('sanitizeCursorContributions — R3 / R4 object shape', () => {
  it('R3 drops object with neither svg nor png', () => {
    const { cleaned, diagnostics } = sanitizeCursorContributions([
      { id: 't1', cursor: { hotspot: { x: 0, y: 0 } } },
    ])
    expect(cleaned).toEqual([])
    expect(diagnostics[0]).toMatchObject({ id: 't1', rule: 'R3' })
  })

  it('R4 drops object with both svg and png', () => {
    const { cleaned, diagnostics } = sanitizeCursorContributions([
      { id: 't1', cursor: { svg: '<svg/>', png: 'a.png' } },
    ])
    expect(cleaned).toEqual([])
    expect(diagnostics[0]).toMatchObject({ id: 't1', rule: 'R4' })
  })
})

describe('sanitizeCursorContributions — R5..R7 SVG variants', () => {
  it('R5 drops non-string svg value', () => {
    const { diagnostics } = sanitizeCursorContributions([
      { id: 't1', cursor: { svg: 123 } },
    ])
    expect(diagnostics[0]).toMatchObject({ id: 't1', rule: 'R5' })
  })

  it('R6 drops path-form svg with unsafe path', () => {
    const { diagnostics } = sanitizeCursorContributions([
      { id: 't1', cursor: { svg: '../escape.svg' } },
      { id: 't2', cursor: { svg: 'http://evil/x.svg' } },
    ])
    expect(diagnostics.map((d) => d.rule)).toEqual(['R6', 'R6'])
  })

  it('R7 drops path-form svg for built-in modules', () => {
    const { diagnostics } = sanitizeCursorContributions(
      [{ id: 't1', cursor: { svg: 'assets/foo.svg' } }],
      { isBuiltin: true },
    )
    expect(diagnostics[0]).toMatchObject({ id: 't1', rule: 'R7' })
  })

  it('accepts inline svg + safe path-form svg for plugin modules', () => {
    const { cleaned, diagnostics } = sanitizeCursorContributions([
      { id: 'inline', cursor: { svg: '<svg><path d="M0 0"/></svg>' } },
      { id: 'path', cursor: { svg: 'assets/foo.svg' } },
    ])
    expect(cleaned).toHaveLength(2)
    expect(diagnostics).toEqual([])
  })
})

describe('sanitizeCursorContributions — R8..R10 PNG variants', () => {
  it('R8 drops non-string png value', () => {
    const { diagnostics } = sanitizeCursorContributions([
      { id: 't1', cursor: { png: 5 } },
    ])
    expect(diagnostics[0]).toMatchObject({ id: 't1', rule: 'R8' })
  })

  it('R9 drops unsafe png path', () => {
    const { diagnostics } = sanitizeCursorContributions([
      { id: 't1', cursor: { png: '../escape.png' } },
      { id: 't2', cursor: { png: 'data:image/png;base64,…' } },
    ])
    expect(diagnostics.map((d) => d.rule)).toEqual(['R9', 'R9'])
  })

  it('R10 drops png for built-in modules', () => {
    const { diagnostics } = sanitizeCursorContributions(
      [{ id: 't1', cursor: { png: 'assets/x.png' } }],
      { isBuiltin: true },
    )
    expect(diagnostics[0]).toMatchObject({ id: 't1', rule: 'R10' })
  })
})

describe('sanitizeCursorContributions — R11 hotspot shape', () => {
  it('accepts well-formed hotspot', () => {
    const { cleaned, diagnostics } = sanitizeCursorContributions([
      { id: 't1', cursor: { svg: '<svg/>', hotspot: { x: 4, y: 8 } } },
      { id: 't2', cursor: { svg: '<svg/>', hotspot: { x: 0, y: 0 } } },
    ])
    expect(cleaned).toHaveLength(2)
    expect(diagnostics).toEqual([])
  })

  it.each([
    { x: -1, y: 0 },
    { x: 0, y: -1 },
    { x: NaN, y: 0 },
    { x: 'a', y: 0 },
    { x: 0 },
  ] as const)('rejects malformed hotspot %p', (hotspot) => {
    const { diagnostics } = sanitizeCursorContributions([
      { id: 't1', cursor: { svg: '<svg/>', hotspot } },
    ])
    expect(diagnostics[0]).toMatchObject({ id: 't1', rule: 'R11' })
  })
})

describe('sanitizeCursorContributions — canonicalised output is structuredClone-safe', () => {
  it('drops unknown extra keys (function / symbol / undefined) from the cleaned cursor', () => {
    const hostile: Record<string, unknown> = {
      svg: '<svg/>',
      hotspot: { x: 0, y: 0 },
      onLoad: () => 'never get to host',
      privateSym: Symbol('plugin-internal'),
      ignored: undefined,
    }
    const { cleaned } = sanitizeCursorContributions([{ id: 't1', cursor: hostile }])
    expect(cleaned).toHaveLength(1)
    const cursor = cleaned[0].cursor as unknown as Record<string, unknown>
    expect(Object.keys(cursor).sort()).toEqual(['hotspot', 'svg'])
    expect(cursor.onLoad).toBeUndefined()
    expect(cursor.privateSym).toBeUndefined()
  })

  it('outputs an object that structuredClone can copy without throwing', () => {
    const cyclic: Record<string, unknown> = { svg: '<svg/>' }
    cyclic.self = cyclic
    const { cleaned } = sanitizeCursorContributions([{ id: 't1', cursor: cyclic }])
    expect(cleaned).toHaveLength(1)
    // structuredClone would throw on the original (cycle) — succeed on cleaned.
    expect(() => structuredClone(cleaned[0])).not.toThrow()
  })

  it('survives cursor objects with thrown-getter properties', () => {
    const explosive = Object.create(null) as Record<string, unknown>
    explosive.svg = '<svg/>'
    Object.defineProperty(explosive, 'trap', {
      get() {
        throw new Error('plugin tried to weaponise the contribution object')
      },
      enumerable: true,
    })
    // Sanitize must not invoke unknown getters; only allowlisted keys are
    // read. Hostile `trap` getter never fires.
    expect(() =>
      sanitizeCursorContributions([{ id: 't1', cursor: explosive }]),
    ).not.toThrow()
  })

  it('clones the hotspot object (mutating the input afterwards does not affect output)', () => {
    const hotspot = { x: 4, y: 8 }
    const { cleaned } = sanitizeCursorContributions([
      { id: 't1', cursor: { svg: '<svg/>', hotspot } },
    ])
    hotspot.x = 999
    const cursor = cleaned[0].cursor as { hotspot: { x: number; y: number } }
    expect(cursor.hotspot.x).toBe(4)
  })

  it('PNG path also produces a structuredClone-safe canonical output', () => {
    const hostile: Record<string, unknown> = {
      png: 'assets/x.png',
      hotspot: { x: 16, y: 16 },
      doFancyThing: () => null,
    }
    const { cleaned } = sanitizeCursorContributions([{ id: 't1', cursor: hostile }])
    const cursor = cleaned[0].cursor as unknown as Record<string, unknown>
    expect(Object.keys(cursor).sort()).toEqual(['hotspot', 'png'])
    expect(() => structuredClone(cleaned[0])).not.toThrow()
  })
})
