/**
 * Unit tests for the main-process MCP painting tools, limits, screenshot view
 * forwarding, screenshot guard, and updated usage guide (electron/mcp/tools.js).
 *
 * Expected contract additions to electron/mcp/tools.js (per build-plan.md):
 * - Exported constants: MAX_ITEMS_PER_CALL, MAX_POINTS_PER_ITEM, STROKES_BEFORE_SCREENSHOT
 * - Built-in tools: openpen__paint_strokes, openpen__fill_regions (in BUILTIN_TOOL_NAMES,
 *   not in READ_ONLY_TOOL_NAMES)
 * - host.screenshot(displayId, { region?, grid? }) receives validated region / grid options
 *   and returns { data, mimeType, width, height, displayId, region?, scale?, grid? }
 */
import { describe, it, expect, vi } from 'vitest'
import {
  BUILTIN_TOOL_NAMES,
  READ_ONLY_TOOL_NAMES,
  MAX_ITEMS_PER_CALL,
  MAX_POINTS_PER_ITEM,
  STROKES_BEFORE_SCREENSHOT,
  SERVER_INSTRUCTIONS,
  createBuiltinTools,
} from '../../electron/mcp/tools.js'

const DISPLAY = { id: 7, pixelWidth: 1920, pixelHeight: 1080, scaleFactor: 1, isCursorDisplay: true }

function makeHost(overrides = {}) {
  let nextId = 1
  return {
    getState: () => ({ drawingMode: true, tool: 'freehand', displays: [DISPLAY] }),
    setDrawingMode: vi.fn(),
    setTool: vi.fn(),
    runOnOverlay: vi.fn(async (_displayId, command) => {
      if (command.type === 'paint') {
        return { ids: command.items.map(() => `paint-${nextId++}`) }
      }
      return { id: `stroke-${nextId++}` }
    }),
    screenshot: vi.fn(async (displayId, opts = {}) => ({
      data: 'PNG_BASE64',
      mimeType: 'image/png',
      width: opts?.region ? 1600 : 1920,
      height: opts?.region ? 800 : 1080,
      displayId,
      ...(opts?.region ? { region: opts.region, scale: 4 } : {}),
      ...(opts?.grid !== undefined ? { grid: opts.grid } : {}),
    })),
    ...overrides,
  }
}

const byName = (tools, name) => tools.find((t) => t.name === name)
const textOf = (res) => res.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n')
const jsonOf = (res) => JSON.parse(textOf(res))

function makeStroke(offset = 0, extra = {}) {
  return {
    points: [
      { x: 10 + offset, y: 20 },
      { x: 50 + offset, y: 60 },
    ],
    ...extra,
  }
}

function makePolygonRegion(offset = 0, extra = {}) {
  return {
    shape: 'polygon',
    points: [
      { x: 10 + offset, y: 10 },
      { x: 60 + offset, y: 10 },
      { x: 60 + offset, y: 60 },
    ],
    ...extra,
  }
}

describe('AC-4 batch painting tools (main side)', () => {
  it('AC-4: paint_strokes and fill_regions forward valid multi-item batches in order as one paint command and return ids and guard counters', async () => {
    expect(BUILTIN_TOOL_NAMES).toContain('openpen__paint_strokes')
    expect(BUILTIN_TOOL_NAMES).toContain('openpen__fill_regions')
    expect(READ_ONLY_TOOL_NAMES).not.toContain('openpen__paint_strokes')
    expect(READ_ONLY_TOOL_NAMES).not.toContain('openpen__fill_regions')

    const host = makeHost({
      getState: () => ({ drawingMode: false, tool: 'freehand', displays: [DISPLAY] }),
    })
    const tools = createBuiltinTools(host)
    const paintStrokes = byName(tools, 'openpen__paint_strokes')
    const fillRegions = byName(tools, 'openpen__fill_regions')
    expect(paintStrokes, 'openpen__paint_strokes registered').toBeDefined()
    expect(fillRegions, 'openpen__fill_regions registered').toBeDefined()

    const strokeRes = await paintStrokes.handler({
      strokes: [
        makeStroke(0, { color: '#ff0000', smooth: true, width: { start: 2, end: 10 }, opacity: { start: 0.2, end: 1 }, hardness: 0.5 }),
        makeStroke(10, { color: '#00ff00', width: 6 }),
        makeStroke(20, { color: '#0000ff', opacity: 0.5 }),
      ],
    })
    expect(strokeRes.isError).not.toBe(true)
    expect(host.setDrawingMode).toHaveBeenCalledWith(true)
    expect(host.runOnOverlay).toHaveBeenCalledTimes(1)

    const [strokeDisplayId, strokeCmd] = host.runOnOverlay.mock.calls[0]
    expect(strokeDisplayId).toBe(DISPLAY.id)
    expect(strokeCmd.type).toBe('paint')
    expect(strokeCmd.items).toHaveLength(3)
    expect(strokeCmd.items.map((item) => item.kind)).toEqual(['brush', 'brush', 'brush'])
    expect(strokeCmd.items.map((item) => item.color)).toEqual(['#ff0000', '#00ff00', '#0000ff'])
    expect(strokeCmd.items[0]).toMatchObject({
      kind: 'brush',
      points: [{ x: 10, y: 20 }, { x: 50, y: 60 }],
      color: '#ff0000',
      smooth: true,
      width: { start: 2, end: 10 },
      opacity: { start: 0.2, end: 1 },
      hardness: 0.5,
    })
    expect(strokeCmd.items[1]).toMatchObject({ kind: 'brush', color: '#00ff00', width: 6 })
    expect(strokeCmd.items[2]).toMatchObject({ kind: 'brush', color: '#0000ff', opacity: 0.5 })

    const strokeBody = jsonOf(strokeRes)
    expect(strokeBody.ids).toEqual(['paint-1', 'paint-2', 'paint-3'])
    expect(strokeBody.displayId).toBe(DISPLAY.id)
    expect(strokeBody.strokesSinceScreenshot).toBe(3)
    expect(strokeBody.guardLimit).toBe(STROKES_BEFORE_SCREENSHOT)

    const holePoints = [{ x: 20, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 40 }]
    const fillRes = await fillRegions.handler({
      regions: [
        makePolygonRegion(0, {
          color: '#112233',
          smooth: true,
          opacity: 0.8,
          hardness: 0.6,
          holes: [{ points: holePoints }],
        }),
        { shape: 'rect', x: 100, y: 100, width: 80, height: 40, color: '#445566' },
      ],
    })
    expect(fillRes.isError).not.toBe(true)
    expect(host.runOnOverlay).toHaveBeenCalledTimes(2)

    const [fillDisplayId, fillCmd] = host.runOnOverlay.mock.calls[1]
    expect(fillDisplayId).toBe(DISPLAY.id)
    expect(fillCmd.type).toBe('paint')
    expect(fillCmd.items).toHaveLength(2)
    expect(fillCmd.items.map((item) => item.kind)).toEqual(['fill', 'fill'])
    expect(fillCmd.items.map((item) => item.color)).toEqual(['#112233', '#445566'])
    expect(fillCmd.items[0]).toMatchObject({
      kind: 'fill',
      shape: 'polygon',
      points: [{ x: 10, y: 10 }, { x: 60, y: 10 }, { x: 60, y: 60 }],
      smooth: true,
      color: '#112233',
      opacity: 0.8,
      hardness: 0.6,
      holes: [{ points: holePoints }],
    })
    expect(fillCmd.items[1]).toMatchObject({
      kind: 'fill',
      shape: 'rect',
      x: 100,
      y: 100,
      width: 80,
      height: 40,
      color: '#445566',
    })

    const fillBody = jsonOf(fillRes)
    expect(fillBody.ids).toEqual(['paint-4', 'paint-5'])
    expect(fillBody.displayId).toBe(DISPLAY.id)
    expect(fillBody.strokesSinceScreenshot).toBe(5)
    expect(fillBody.guardLimit).toBe(STROKES_BEFORE_SCREENSHOT)
  })

  it('AC-4: a batch with any invalid item is rejected as a whole and leaves the canvas untouched', async () => {
    const host = makeHost()
    const tools = createBuiltinTools(host)
    const paintStrokes = byName(tools, 'openpen__paint_strokes')
    const fillRegions = byName(tools, 'openpen__fill_regions')
    expect(paintStrokes, 'openpen__paint_strokes registered').toBeDefined()
    expect(fillRegions, 'openpen__fill_regions registered').toBeDefined()

    // Middle stroke has a coordinate outside the display; first and third are valid.
    const badStrokeRes = await paintStrokes.handler({
      strokes: [
        makeStroke(0),
        { points: [{ x: 10, y: 10 }, { x: 5000, y: 10 }] },
        makeStroke(20),
      ],
    })
    expect(badStrokeRes.isError).toBe(true)
    expect(host.runOnOverlay).not.toHaveBeenCalled()

    // Second region is a polygon with fewer than 3 points; first region is valid.
    const badFillRes = await fillRegions.handler({
      regions: [
        makePolygonRegion(0),
        { shape: 'polygon', points: [{ x: 10, y: 10 }, { x: 20, y: 20 }] },
      ],
    })
    expect(badFillRes.isError).toBe(true)
    expect(host.runOnOverlay).not.toHaveBeenCalled()
  })
})

describe('AC-5 per-call item and point caps', () => {
  it('AC-5: paint_strokes and fill_regions reject batches exceeding MAX_ITEMS_PER_CALL, state the limit, and leave the canvas untouched', async () => {
    expect(MAX_ITEMS_PER_CALL).toBeTypeOf('number')
    expect(Number.isInteger(MAX_ITEMS_PER_CALL) && MAX_ITEMS_PER_CALL > 0).toBe(true)

    const host = makeHost()
    const tools = createBuiltinTools(host)
    const paintStrokes = byName(tools, 'openpen__paint_strokes')
    const fillRegions = byName(tools, 'openpen__fill_regions')
    expect(paintStrokes).toBeDefined()
    expect(fillRegions).toBeDefined()

    const tooManyStrokes = Array.from({ length: MAX_ITEMS_PER_CALL + 1 }, () => makeStroke())
    const strokeRes = await paintStrokes.handler({ strokes: tooManyStrokes })
    expect(strokeRes.isError).toBe(true)
    const strokeErr = textOf(strokeRes)
    expect(strokeErr).toContain(String(MAX_ITEMS_PER_CALL))
    expect(strokeErr).toMatch(/split|multiple|smaller|batch/i)
    expect(host.runOnOverlay).not.toHaveBeenCalled()

    const tooManyRegions = Array.from({ length: MAX_ITEMS_PER_CALL + 1 }, () => makePolygonRegion())
    const fillRes = await fillRegions.handler({ regions: tooManyRegions })
    expect(fillRes.isError).toBe(true)
    const fillErr = textOf(fillRes)
    expect(fillErr).toContain(String(MAX_ITEMS_PER_CALL))
    expect(fillErr).toMatch(/split|multiple|smaller|batch/i)
    expect(host.runOnOverlay).not.toHaveBeenCalled()
  })

  it('AC-5: paint_strokes and fill_regions reject an item exceeding MAX_POINTS_PER_ITEM, state the limit, and leave the canvas untouched', async () => {
    expect(MAX_POINTS_PER_ITEM).toBeTypeOf('number')
    expect(Number.isInteger(MAX_POINTS_PER_ITEM) && MAX_POINTS_PER_ITEM > 0).toBe(true)

    const host = makeHost()
    const tools = createBuiltinTools(host)
    const paintStrokes = byName(tools, 'openpen__paint_strokes')
    const fillRegions = byName(tools, 'openpen__fill_regions')
    expect(paintStrokes).toBeDefined()
    expect(fillRegions).toBeDefined()

    const tooManyPoints = Array.from({ length: MAX_POINTS_PER_ITEM + 1 }, (_, i) => ({
      x: i % 1000,
      y: Math.floor(i / 1000) % 500,
    }))

    const strokeRes = await paintStrokes.handler({ strokes: [{ points: tooManyPoints }] })
    expect(strokeRes.isError).toBe(true)
    expect(textOf(strokeRes)).toContain(String(MAX_POINTS_PER_ITEM))
    expect(host.runOnOverlay).not.toHaveBeenCalled()

    const fillRes = await fillRegions.handler({
      regions: [{ shape: 'polygon', points: tooManyPoints }],
    })
    expect(fillRes.isError).toBe(true)
    expect(textOf(fillRes)).toContain(String(MAX_POINTS_PER_ITEM))
    expect(host.runOnOverlay).not.toHaveBeenCalled()

    const holeRes = await fillRegions.handler({
      regions: [
        makePolygonRegion(0, {
          holes: [{ points: tooManyPoints }],
        }),
      ],
    })
    expect(holeRes.isError).toBe(true)
    expect(textOf(holeRes)).toContain(String(MAX_POINTS_PER_ITEM))
    expect(host.runOnOverlay).not.toHaveBeenCalled()
  })
})

describe('AC-6 screenshot region and grid options (main side)', () => {
  it('AC-6: screenshot forwards valid region and grid options to host and returns region, scale, and grid metadata with the image', async () => {
    expect(READ_ONLY_TOOL_NAMES).toContain('openpen__screenshot')
    const host = makeHost()
    const screenshot = byName(createBuiltinTools(host), 'openpen__screenshot')
    expect(screenshot).toBeDefined()

    const region = { x: 100, y: 200, width: 400, height: 200 }
    const res = await screenshot.handler({ region, grid: 50 })
    expect(res.isError).not.toBe(true)

    expect(host.screenshot).toHaveBeenCalledTimes(1)
    const [displayId, opts] = host.screenshot.mock.calls[0]
    expect(displayId).toBe(DISPLAY.id)
    expect(opts).toMatchObject({ region, grid: 50 })

    const img = res.content.find((c) => c.type === 'image')
    expect(img).toEqual({ type: 'image', data: 'PNG_BASE64', mimeType: 'image/png' })
    expect(jsonOf(res)).toEqual({
      displayId: DISPLAY.id,
      width: 1600,
      height: 800,
      region,
      scale: 4,
      grid: 50,
    })
  })

  it('AC-6: screenshot rejects out-of-bounds or non-positive region and non-positive grid without calling host.screenshot', async () => {
    const host = makeHost()
    const screenshot = byName(createBuiltinTools(host), 'openpen__screenshot')
    expect(screenshot).toBeDefined()

    const badCases = [
      { region: { x: 1800, y: 0, width: 200, height: 100 } },
      { region: { x: 10, y: 10, width: 0, height: 100 } },
      { region: { x: -10, y: 10, width: 100, height: 100 } },
      { grid: 0 },
      { grid: -50 },
    ]
    for (const args of badCases) {
      const res = await screenshot.handler(args)
      expect(res.isError, JSON.stringify(args)).toBe(true)
    }
    expect(host.screenshot).not.toHaveBeenCalled()
  })
})

describe('AC-7 screenshot guard for consecutive painting writes', () => {
  async function paintCount(tools, total) {
    const paintStrokes = byName(tools, 'openpen__paint_strokes')
    const fillRegions = byName(tools, 'openpen__fill_regions')
    let remaining = total
    let lastRes = null
    if (remaining >= 2) {
      lastRes = await fillRegions.handler({ regions: [makePolygonRegion()] })
      expect(lastRes.isError).not.toBe(true)
      remaining -= 1
    }
    while (remaining > 0) {
      const chunk = Math.min(remaining, MAX_ITEMS_PER_CALL)
      lastRes = await paintStrokes.handler({
        strokes: Array.from({ length: chunk }, () => makeStroke()),
      })
      expect(lastRes.isError).not.toBe(true)
      remaining -= chunk
    }
    return lastRes
  }

  it('AC-7: reaching STROKES_BEFORE_SCREENSHOT blocks the next paint/fill call with a screenshot prompt while draw_* remains allowed', async () => {
    expect(STROKES_BEFORE_SCREENSHOT).toBeTypeOf('number')
    expect(Number.isInteger(STROKES_BEFORE_SCREENSHOT) && STROKES_BEFORE_SCREENSHOT > 0).toBe(true)
    expect(MAX_ITEMS_PER_CALL).toBeTypeOf('number')

    const host = makeHost()
    const tools = createBuiltinTools(host)
    const paintStrokes = byName(tools, 'openpen__paint_strokes')
    const fillRegions = byName(tools, 'openpen__fill_regions')
    const drawLine = byName(tools, 'openpen__draw_line')
    expect(paintStrokes).toBeDefined()
    expect(fillRegions).toBeDefined()

    const filled = await paintCount(tools, STROKES_BEFORE_SCREENSHOT)
    expect(jsonOf(filled).strokesSinceScreenshot).toBe(STROKES_BEFORE_SCREENSHOT)
    expect(jsonOf(filled).guardLimit).toBe(STROKES_BEFORE_SCREENSHOT)

    const overlayCallsAtCap = host.runOnOverlay.mock.calls.length

    const blockedStroke = await paintStrokes.handler({ strokes: [makeStroke()] })
    expect(blockedStroke.isError).toBe(true)
    const errText = textOf(blockedStroke)
    expect(errText).toContain(String(STROKES_BEFORE_SCREENSHOT))
    expect(errText).toMatch(/screenshot/i)
    expect(host.runOnOverlay).toHaveBeenCalledTimes(overlayCallsAtCap)

    const blockedFill = await fillRegions.handler({ regions: [makePolygonRegion()] })
    expect(blockedFill.isError).toBe(true)
    expect(textOf(blockedFill)).toMatch(/screenshot/i)
    expect(host.runOnOverlay).toHaveBeenCalledTimes(overlayCallsAtCap)

    // Existing annotation tools are neither counted nor blocked by the painting guard.
    const lineRes = await drawLine.handler({ x1: 10, y1: 10, x2: 100, y2: 10 })
    expect(lineRes.isError).not.toBe(true)
    expect(host.runOnOverlay).toHaveBeenCalledTimes(overlayCallsAtCap + 1)
  })

  it('AC-7: a failed screenshot keeps the guard blocked, while a successful screenshot (including region) resets the counter', async () => {
    expect(STROKES_BEFORE_SCREENSHOT).toBeTypeOf('number')
    expect(MAX_ITEMS_PER_CALL).toBeTypeOf('number')

    let failNextShot = true
    const host = makeHost({
      screenshot: vi.fn(async (displayId, opts = {}) => {
        if (failNextShot) throw new Error('capture busy')
        return {
          data: 'PNG_BASE64',
          mimeType: 'image/png',
          width: 400,
          height: 400,
          displayId,
          ...(opts?.region ? { region: opts.region, scale: 4 } : {}),
        }
      }),
    })
    const tools = createBuiltinTools(host)
    const paintStrokes = byName(tools, 'openpen__paint_strokes')
    const drawRect = byName(tools, 'openpen__draw_rect')
    const screenshot = byName(tools, 'openpen__screenshot')
    expect(paintStrokes).toBeDefined()

    await paintCount(tools, STROKES_BEFORE_SCREENSHOT)
    const callsBeforeBlocked = host.runOnOverlay.mock.calls.length

    const failedShot = await screenshot.handler({})
    expect(failedShot.isError).toBe(true)

    const stillBlocked = await paintStrokes.handler({ strokes: [makeStroke()] })
    expect(stillBlocked.isError).toBe(true)
    expect(host.runOnOverlay).toHaveBeenCalledTimes(callsBeforeBlocked)

    failNextShot = false
    const okShot = await screenshot.handler({ region: { x: 0, y: 0, width: 100, height: 100 } })
    expect(okShot.isError).not.toBe(true)

    const afterReset = await paintStrokes.handler({ strokes: [makeStroke()] })
    expect(afterReset.isError).not.toBe(true)
    expect(jsonOf(afterReset).strokesSinceScreenshot).toBe(1)

    // draw_* calls do not increment the painting guard counter.
    await drawRect.handler({ x: 10, y: 10, width: 50, height: 50 })
    const secondAfterReset = await paintStrokes.handler({ strokes: [makeStroke()] })
    expect(secondAfterReset.isError).not.toBe(true)
    expect(jsonOf(secondAfterReset).strokesSinceScreenshot).toBe(2)
  })

  it('AC-7 regression: a failed paint that overlapped with a successful screenshot does not drive strokesSinceScreenshot below zero', async () => {
    let rejectPendingPaint
    let pending = true
    const host = makeHost({
      runOnOverlay: vi.fn((_displayId, command) => {
        if (pending && command.type === 'paint') {
          pending = false
          return new Promise((_resolve, reject) => {
            rejectPendingPaint = reject
          })
        }
        return Promise.resolve({ ids: command.items.map((_, i) => `ok-${i}`) })
      }),
    })
    const tools = createBuiltinTools(host)
    const paintStrokes = byName(tools, 'openpen__paint_strokes')
    const screenshot = byName(tools, 'openpen__screenshot')

    // Start a 3-stroke paint that stays in flight while a screenshot succeeds.
    const inflightPaint = paintStrokes.handler({
      strokes: [makeStroke(0), makeStroke(10), makeStroke(20)],
    })
    const shotRes = await screenshot.handler({})
    expect(shotRes.isError).not.toBe(true)

    // Now the earlier paint fails; its rollback must not push the guard counter negative.
    rejectPendingPaint(new Error('overlay crashed'))
    const failedPaint = await inflightPaint
    expect(failedPaint.isError).toBe(true)

    const nextPaint = await paintStrokes.handler({ strokes: [makeStroke(30)] })
    expect(nextPaint.isError).not.toBe(true)
    const body = jsonOf(nextPaint)
    expect(body.strokesSinceScreenshot).toBeGreaterThanOrEqual(0)
    expect(body.strokesSinceScreenshot).toBe(1)
  })
})

describe('AC-8 usage guide Painting section and updated descriptions', () => {
  it('AC-8: get_guide includes a Painting section with workflow, tool mapping, and reference-image rules (observe only; no pasting, tracing, or pixel-to-stroke scripts)', async () => {
    const tools = createBuiltinTools(makeHost())
    const res = await byName(tools, 'openpen__get_guide').handler({})
    expect(res.isError).not.toBe(true)
    const guide = textOf(res)

    const headingMatch = guide.match(/^##\s+Painting\b[^\n]*\n/m)
    expect(headingMatch, '## Painting section present').not.toBeNull()
    const afterHeading = guide.slice(headingMatch.index + headingMatch[0].length)
    const nextHeading = afterHeading.search(/^##\s+/m)
    const paintingSection = nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading)

    // Tool mapping inside Painting section
    expect(paintingSection).toContain('openpen__paint_strokes')
    expect(paintingSection).toContain('openpen__fill_regions')
    expect(paintingSection).toMatch(/\bsmooth\b/i)
    expect(paintingSection).toMatch(/\bundo\b/i)

    // Painting workflow stages in order, stroke budgets, and per-stage screenshot check
    const findAfter = (re, from, label) => {
      const rel = paintingSection.slice(from).search(re)
      expect(rel, label).toBeGreaterThanOrEqual(0)
      return from + rel
    }
    const stage1 = findAfter(/\b(composition|palette)\b/i, 0, 'stage 1: composition / palette')
    const stage2 = findAfter(
      /\b(fill_regions|large\s+(?:color|colour|flat)\s+(?:area|areas|block|blocks|shape|shapes|mass|masses)|base\s+(?:color|colour|fill|shape)s?|block[- ]?in)\b/i,
      stage1 + 1,
      'stage 2: large colour areas / fill_regions',
    )
    const stage3 = findAfter(
      /\b(light|lighting|shadow|shadows|shading|values?|form|volume)\b/i,
      stage2 + 1,
      'stage 3: light / shadow / values / form',
    )
    const stage4 = findAfter(
      /\b(detail|details|highlight|highlights)\b/i,
      stage3 + 1,
      'stage 4: detail / highlight',
    )
    const stage5 = findAfter(
      /\b(finish|finishing|refine|refining)\b/i,
      stage4 + 1,
      'stage 5: finish / refine',
    )
    expect(
      paintingSection.slice(stage5),
      'stage 5 forbids adding new elements',
    ).toMatch(/\b(not|never|don't|do not|no|without|avoid)\b[^\n.]*\b(add|adding|new)\b|\bonly\s+(fix|adjust|correct|refine|polish|tweak)\b/i)
    expect(
      paintingSection,
      'per-stage stroke budget with numbers',
    ).toMatch(/\bbudget\b[^\n.]*\d|\bstrokes?\b[^\n.]*\d|\d+\s*(?:[-–—]|to)\s*\d+\s*strokes?|\d+\s*strokes?/i)
    expect(paintingSection, 'check screenshot across stages').toMatch(/screenshot/i)

    // Reference image rule: observing is allowed; no pasting, tracing, or pixel-to-stroke scripts
    expect(paintingSection).toMatch(/reference/i)
    expect(paintingSection).toMatch(/observ|look|study|inspect/i)
    expect(paintingSection).toMatch(/\b(not|never|don't|do not|no)\b[^\n.]*\bpast(e|ing)\b|\bpast(e|ing)\b[^\n.]*\b(not|never|prohibit|forbid)/i)
    expect(paintingSection).toMatch(/\b(not|never|don't|do not|no)\b[^\n.]*\btrac(e|ing)\b|\btrac(e|ing)\b[^\n.]*\b(not|never|prohibit|forbid)/i)
    expect(paintingSection).toMatch(
      /\b(not|never|don't|do not|no)\b[^\n.]*(?:(?:script|program|code)[^\n.]*pixel[^\n.]*stroke|pixel[- ]to[- ]stroke|convert[^\n.]*pixel[^\n.]*stroke)|(?:script|program|code)[^\n.]*pixel[^\n.]*stroke[^\n.]*\b(not|never|prohibit|forbid)/i,
    )
  })

  it('AC-8: guide and tool descriptions remove obsolete "no curve / no opacity" claims and obey length and isolation limits', async () => {
    expect(SERVER_INSTRUCTIONS.length).toBeLessThanOrEqual(1000)

    const tools = createBuiltinTools(makeHost())
    const guide = textOf(await byName(tools, 'openpen__get_guide').handler({}))
    expect(guide).not.toMatch(/there is no curve tool/i)
    expect(guide).not.toMatch(/there is no separate opacity parameter/i)
    expect(guide).not.toMatch(/looking for a curve or opacity tool; none exists/i)

    const drawFreehand = byName(tools, 'openpen__draw_freehand')
    expect(drawFreehand.description).not.toMatch(/there is no curve tool/i)

    const otherShortNames = BUILTIN_TOOL_NAMES
      .map((n) => n.replace(/^openpen__/, ''))
      .filter((n) => n.includes('_'))

    for (const toolName of ['openpen__paint_strokes', 'openpen__fill_regions']) {
      const tool = byName(tools, toolName)
      expect(tool, `${toolName} registered`).toBeDefined()
      const own = toolName.replace(/^openpen__/, '')
      expect(tool.description.length).toBeGreaterThan(0)
      expect(tool.description.length).toBeLessThanOrEqual(2048)
      expect(tool.description).not.toContain('openpen__')
      expect(tool.description).not.toMatch(/\b(MUST|NEVER|ALWAYS|IMPORTANT|CRITICAL|WARNING|REQUIRED|FORBIDDEN)\b/)
      for (const other of otherShortNames.filter((n) => n !== own)) {
        expect(tool.description, `${own} must not reference ${other}`).not.toContain(other)
      }
    }
  })
})
