import { describe, it, expect, vi } from 'vitest'

// Mock heavy host dependencies so pure helpers can be imported in isolation.
vi.mock('@openpen/module-api/host', () => ({
  getAllStrokes: vi.fn(() => []),
  removeStrokeById: vi.fn(() => false),
  pushCommand: vi.fn(),
}))
vi.mock('../../runtime/event-bus', () => ({
  emit: vi.fn(),
}))

import {
  dist,
  pointToSegmentDistance,
  hitShape,
  hitStroke,
} from './stroke-eraser-tool'
import type { Point, Stroke } from '@openpen/module-api'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pt(x: number, y: number): Point {
  return { x, y }
}

function makeStroke(overrides: Partial<Stroke> = {}): Stroke {
  return {
    id: 'test-stroke',
    tool: 'freehand',
    points: [],
    style: { color: '#000', lineWidth: 2, lineCap: 'round', lineJoin: 'round' },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// dist
// ---------------------------------------------------------------------------

describe('dist', () => {
  it('returns 0 for identical points', () => {
    expect(dist(pt(3, 4), pt(3, 4))).toBeCloseTo(0, 5)
  })

  it('returns correct Euclidean distance', () => {
    expect(dist(pt(0, 0), pt(3, 4))).toBeCloseTo(5, 5)
  })

  it('is symmetric', () => {
    expect(dist(pt(1, 2), pt(4, 6))).toBeCloseTo(dist(pt(4, 6), pt(1, 2)), 5)
  })
})

// ---------------------------------------------------------------------------
// pointToSegmentDistance
// ---------------------------------------------------------------------------

describe('pointToSegmentDistance', () => {
  it('returns ~0 when p is exactly on segment midpoint', () => {
    const a = pt(0, 0)
    const b = pt(10, 0)
    const mid = pt(5, 0)
    expect(pointToSegmentDistance(mid, a, b)).toBeCloseTo(0, 5)
  })

  it('degenerate segment (a===b) returns dist(p, a)', () => {
    const a = pt(3, 4)
    const b = pt(3, 4)
    const p = pt(0, 0)
    expect(pointToSegmentDistance(p, a, b)).toBeCloseTo(dist(p, a), 5)
  })

  it('clamps to endpoint a when projection t < 0', () => {
    // p is "behind" a (past the a end)
    const a = pt(5, 0)
    const b = pt(10, 0)
    const p = pt(0, 0) // projection would be t = -1
    expect(pointToSegmentDistance(p, a, b)).toBeCloseTo(dist(p, a), 5)
  })

  it('clamps to endpoint b when projection t > 1', () => {
    // p is "beyond" b (past the b end)
    const a = pt(0, 0)
    const b = pt(5, 0)
    const p = pt(10, 0) // projection would be t = 2
    expect(pointToSegmentDistance(p, a, b)).toBeCloseTo(dist(p, b), 5)
  })

  it('returns perpendicular distance of 5 for point 5px above segment midpoint', () => {
    const a = pt(0, 0)
    const b = pt(10, 0)
    const p = pt(5, 5) // 5px above midpoint
    expect(pointToSegmentDistance(p, a, b)).toBeCloseTo(5, 5)
  })

  it('handles vertical segment correctly', () => {
    const a = pt(0, 0)
    const b = pt(0, 10)
    const p = pt(3, 5) // 3px to the right of midpoint
    expect(pointToSegmentDistance(p, a, b)).toBeCloseTo(3, 5)
  })
})

// ---------------------------------------------------------------------------
// hitShape
// ---------------------------------------------------------------------------

describe('hitShape', () => {
  it('returns false for degenerate w=0 h=0 stroke', () => {
    const stroke = makeStroke({
      tool: 'shape',
      points: [pt(5, 5), pt(5, 5)],
      filled: false,
    })
    expect(hitShape(pt(5, 5), stroke, 5)).toBe(false)
  })

  it('filled=true: point inside bbox returns true', () => {
    const stroke = makeStroke({
      tool: 'shape',
      points: [pt(0, 0), pt(100, 100)],
      filled: true,
    })
    expect(hitShape(pt(50, 50), stroke, 0)).toBe(true)
  })

  it('filled=true: point outside expanded bbox returns false (bbox-prune path)', () => {
    const stroke = makeStroke({
      tool: 'shape',
      points: [pt(0, 0), pt(100, 100)],
      filled: true,
    })
    // extraRadius=5, so expanded bbox is [-5, -5] to [105, 105]
    // Point at (200, 200) is outside
    expect(hitShape(pt(200, 200), stroke, 5)).toBe(false)
  })

  it('filled=false: point at center of empty rect returns false', () => {
    const stroke = makeStroke({
      tool: 'shape',
      points: [pt(0, 0), pt(100, 100)],
      filled: false,
      style: { color: '#000', lineWidth: 2, lineCap: 'round', lineJoin: 'round' },
    })
    // Center (50, 50) is far from all 4 edges — min edge dist = 50, tolerance = 0 + 1 = 1
    expect(hitShape(pt(50, 50), stroke, 0)).toBe(false)
  })

  it('filled=false: point on edge within tolerance returns true', () => {
    const stroke = makeStroke({
      tool: 'shape',
      points: [pt(0, 0), pt(100, 100)],
      filled: false,
      style: { color: '#000', lineWidth: 2, lineCap: 'round', lineJoin: 'round' },
    })
    // Point on left edge (x=0), y=50. edge dist=0, tolerance = extraRadius(5) + lineWidth/2(1) = 6
    expect(hitShape(pt(0, 50), stroke, 5)).toBe(true)
  })

  it('filled=false: point just outside edge beyond extraRadius+lineWidth/2 returns false', () => {
    const stroke = makeStroke({
      tool: 'shape',
      points: [pt(0, 0), pt(100, 100)],
      filled: false,
      style: { color: '#000', lineWidth: 2, lineCap: 'round', lineJoin: 'round' },
    })
    // extraRadius=0, lineWidth=2 so half=1, tolerance=1
    // Point at x=-2 from left edge: edge dist = 2 > tolerance 1 → false
    expect(hitShape(pt(-2, 50), stroke, 0)).toBe(false)
  })

  it('handles reversed point order (b < a)', () => {
    // bbox is always normalized via Math.min
    const stroke = makeStroke({
      tool: 'shape',
      points: [pt(100, 100), pt(0, 0)],
      filled: true,
    })
    expect(hitShape(pt(50, 50), stroke, 0)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// hitStroke
// ---------------------------------------------------------------------------

describe('hitStroke', () => {
  it('returns false for empty points array', () => {
    const stroke = makeStroke({ points: [] })
    expect(hitStroke(pt(0, 0), stroke, 5)).toBe(false)
  })

  it('single-point stroke: p within radius+lineWidth/2 returns true', () => {
    const stroke = makeStroke({
      points: [pt(10, 10)],
      style: { color: '#000', lineWidth: 4, lineCap: 'round', lineJoin: 'round' },
    })
    // extraRadius=5, lineWidth=4, half=2, tolerance=7
    // dist from pt(10,10) to pt(14,10) = 4 <= 7 → true
    expect(hitStroke(pt(14, 10), stroke, 5)).toBe(true)
  })

  it('single-point stroke: p outside radius+lineWidth/2 returns false', () => {
    const stroke = makeStroke({
      points: [pt(10, 10)],
      style: { color: '#000', lineWidth: 4, lineCap: 'round', lineJoin: 'round' },
    })
    // extraRadius=5, lineWidth=4, half=2, tolerance=7
    // dist from pt(10,10) to pt(20,10) = 10 > 7 → false
    expect(hitStroke(pt(20, 10), stroke, 5)).toBe(false)
  })

  it('polyline stroke: p near one of the segments returns true', () => {
    const stroke = makeStroke({
      points: [pt(0, 0), pt(100, 0), pt(100, 100)],
      style: { color: '#000', lineWidth: 2, lineCap: 'round', lineJoin: 'round' },
    })
    // Point 3px above segment from (0,0)→(100,0), extraRadius=5, half=1, tolerance=6
    // perpendicular dist = 3 <= 6 → true
    expect(hitStroke(pt(50, 3), stroke, 5)).toBe(true)
  })

  it('polyline stroke: p far from all segments returns false', () => {
    const stroke = makeStroke({
      points: [pt(0, 0), pt(100, 0)],
      style: { color: '#000', lineWidth: 2, lineCap: 'round', lineJoin: 'round' },
    })
    // extraRadius=0, half=1, tolerance=1. Point 50px away → false
    expect(hitStroke(pt(50, 50), stroke, 0)).toBe(false)
  })

  it('shape stroke: delegates to hitShape (positive case)', () => {
    const stroke = makeStroke({
      tool: 'shape',
      points: [pt(0, 0), pt(100, 100)],
      filled: true,
    })
    // Inside the filled bbox → true
    expect(hitStroke(pt(50, 50), stroke, 0)).toBe(true)
  })

  it('eraser tool strokes are NOT skipped by hitStroke itself (only createStrokeEraserTool skips them)', () => {
    // hitStroke doesn't filter by tool — that filtering happens in eraseAt()
    const stroke = makeStroke({
      tool: 'eraser',
      points: [pt(0, 0), pt(100, 0)],
      style: { color: '#000', lineWidth: 2, lineCap: 'round', lineJoin: 'round' },
    })
    expect(hitStroke(pt(50, 0), stroke, 5)).toBe(true)
  })
})
