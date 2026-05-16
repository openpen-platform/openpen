/**
 * DOMPurify configuration tests for cursor SVG sanitisation.
 *
 * The intent is NOT to re-validate DOMPurify itself (cure53 does that) but
 * to lock in OUR use of it: wrong config, missing import, accidental
 * sanitiser bypass at a call site, or forgotten foreignObject forbid
 * would all break these tests.
 */
import { describe, it, expect } from 'vitest'
import { sanitizeSvgMarkup, compileCursor } from '../src/cursors'

describe('sanitizeSvgMarkup — known SVG XSS attack vectors', () => {
  it('S1: strips inline <script>', () => {
    const evil = '<svg><script>fetch("/secrets")</script><circle r="1"/></svg>'
    const cleaned = sanitizeSvgMarkup(evil)
    expect(cleaned.toLowerCase()).not.toContain('<script')
    expect(cleaned.toLowerCase()).not.toContain('fetch')
    expect(cleaned.toLowerCase()).toContain('<circle')
  })

  it('S2: strips on* event handlers (onload, onerror, onclick, onmouseover)', () => {
    const evil = '<svg onload="alert(1)" onmouseover="x()"><circle onclick="y()" onerror="z()" r="1"/></svg>'
    const cleaned = sanitizeSvgMarkup(evil).toLowerCase()
    expect(cleaned).not.toContain('onload')
    expect(cleaned).not.toContain('onerror')
    expect(cleaned).not.toContain('onclick')
    expect(cleaned).not.toContain('onmouseover')
    expect(cleaned).toContain('<circle')
  })

  it('S3: strips <foreignObject> (mXSS escape hatch)', () => {
    const evil = '<svg><foreignObject><iframe src="https://evil"></iframe></foreignObject></svg>'
    const cleaned = sanitizeSvgMarkup(evil).toLowerCase()
    expect(cleaned).not.toContain('foreignobject')
    expect(cleaned).not.toContain('<iframe')
  })

  it('S4: strips javascript: protocol from <image href>', () => {
    const evil = '<svg><image href="javascript:alert(1)" /></svg>'
    const cleaned = sanitizeSvgMarkup(evil).toLowerCase()
    expect(cleaned).not.toContain('javascript:')
  })

  it('S5: strips external https:// href on <use>', () => {
    const evil = '<svg><use href="https://evil/x.svg#payload"/></svg>'
    const cleaned = sanitizeSvgMarkup(evil).toLowerCase()
    expect(cleaned).not.toContain('https://evil')
  })

  it('S6: strips javascript: from xlink:href on <a>', () => {
    const evil = '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><a xlink:href="javascript:alert(1)"><circle r="1"/></a></svg>'
    const cleaned = sanitizeSvgMarkup(evil).toLowerCase()
    expect(cleaned).not.toContain('javascript:')
  })

  it('S7: strips inline CSS expression()', () => {
    const evil = '<svg><circle r="1" style="width: expression(alert(1))"/></svg>'
    const cleaned = sanitizeSvgMarkup(evil).toLowerCase()
    expect(cleaned).not.toContain('expression(')
  })

  it('S8: neutralises CDATA-smuggled script (script tag escaped to text)', () => {
    // DOMPurify decodes the CDATA and html-escapes the contained `<script>`
    // tags. The literal characters survive in text-node form (e.g.
    // `&lt;script&gt;alert(1)&lt;/script&gt;`), but no live script element
    // is constructed, so the payload cannot execute.
    const evil = '<svg><![CDATA[<script>alert(1)</script>]]></svg>'
    const cleaned = sanitizeSvgMarkup(evil).toLowerCase()
    expect(cleaned).not.toContain('<script')
    // Inserting the cleaned markup as innerHTML MUST NOT create a script node.
    const div = document.createElement('div')
    div.innerHTML = cleaned
    expect(div.querySelector('script')).toBeNull()
  })

  it('S9: strips javascript: smuggled through <animate values>', () => {
    const evil =
      '<svg><a><animate attributeName="href" values="javascript:alert(1)" /></a></svg>'
    const cleaned = sanitizeSvgMarkup(evil).toLowerCase()
    expect(cleaned).not.toContain('javascript:')
  })

  it('S10: defangs encoded payloads (DOMPurify default behaviour)', () => {
    const evil = '<svg><script>&#x6A;&#x61;&#x76;&#x61;script:alert(1)</script></svg>'
    const cleaned = sanitizeSvgMarkup(evil).toLowerCase()
    expect(cleaned).not.toContain('<script')
  })
})

describe('sanitizeSvgMarkup — happy paths', () => {
  it('preserves a safe <path> with fill/stroke/d/stroke-width', () => {
    const safe = '<svg><path d="M2 2 L4 4" fill="#fff" stroke="#000" stroke-width="2"/></svg>'
    const cleaned = sanitizeSvgMarkup(safe)
    expect(cleaned).toContain('<path')
    expect(cleaned).toContain('M2 2 L4 4')
    expect(cleaned.toLowerCase()).toContain('stroke')
  })

  it('preserves the host default cursor markup', () => {
    const defaultCursor =
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
      '<path d="M12 3v18 M3 12h18" stroke="#111111" stroke-width="1.5" stroke-linecap="round" fill="none"/>' +
      '<path d="M12 3v18 M3 12h18" stroke="#ffffff" stroke-width="3" stroke-linecap="round" fill="none" opacity="0.6"/>' +
      '</svg>'
    const cleaned = sanitizeSvgMarkup(defaultCursor)
    expect(cleaned).toContain('<path')
    expect(cleaned).toContain('M12 3v18')
    expect(cleaned).toContain('M3 12h18')
  })
})

describe('compileCursor wires sanitisation at the call site', () => {
  it('inline malicious SVG returns CompiledCursor whose svgMarkup is sanitised', async () => {
    const result = await compileCursor({
      svg: '<svg onload="alert(1)"><script>evil()</script><circle r="1"/></svg>',
    })
    expect(result).not.toBeNull()
    const md = result!.svgMarkup.toLowerCase()
    expect(md).not.toContain('onload')
    expect(md).not.toContain('<script')
    expect(md).not.toContain('evil')
    expect(md).toContain('<circle')
  })

  it('inline SVG that DOMPurify reduces to empty returns null', async () => {
    const result = await compileCursor({ svg: '<script>alert(1)</script>' })
    expect(result).toBeNull()
  })

  it('inline malicious SVG does not execute onload when mounted via innerHTML', () => {
    const evil = '<svg><img src="x" onerror="(globalThis as any).__pwned = true"/></svg>'
    const cleaned = sanitizeSvgMarkup(evil)
    const div = document.createElement('div')
    div.innerHTML = cleaned
    expect((globalThis as unknown as Record<string, unknown>).__pwned).toBeUndefined()
  })
})
