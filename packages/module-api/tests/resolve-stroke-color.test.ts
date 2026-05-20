import { describe, it, expect } from 'vitest'
import { resolveStrokeColor } from '../src'
import type { StrokeColor } from '../src'

describe('resolveStrokeColor', () => {
  it('returns the string verbatim for solid colour input', () => {
    expect(resolveStrokeColor('#ff0000')).toBe('#ff0000')
    expect(resolveStrokeColor('rgba(0, 0, 0, 0.5)')).toBe('rgba(0, 0, 0, 0.5)')
  })

  it('returns the `from` stop for a linear gradient (not `to`)', () => {
    const gradient: StrokeColor = { type: 'linear', from: '#abcdef', to: '#123456' }
    expect(resolveStrokeColor(gradient)).toBe('#abcdef')
  })
})
