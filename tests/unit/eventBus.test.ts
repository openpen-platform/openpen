import { describe, it, expect, beforeEach, vi } from 'vitest'
import { emit, on, off, clearEventBus } from '../../src/core/runtime/event-bus'

describe('event-bus', () => {
  beforeEach(() => {
    clearEventBus()
  })

  it('delivers payloads to subscribers', () => {
    const handler = vi.fn()
    on('stroke-added', handler)
    emit('stroke-added', { id: 's1' })
    expect(handler).toHaveBeenCalledWith({ id: 's1' })
  })

  it('supports multiple subscribers per event', () => {
    const a = vi.fn()
    const b = vi.fn()
    on('tool-changed', a)
    on('tool-changed', b)
    emit('tool-changed', { tool: 'freehand' })
    expect(a).toHaveBeenCalledWith({ tool: 'freehand' })
    expect(b).toHaveBeenCalledWith({ tool: 'freehand' })
  })

  it('keeps events isolated', () => {
    const a = vi.fn()
    const b = vi.fn()
    on('a-event', a)
    on('b-event', b)
    emit('a-event', 1)
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).not.toHaveBeenCalled()
  })

  it('on returns an unsubscribe function', () => {
    const handler = vi.fn()
    const unsub = on('e', handler)
    emit('e', 1)
    unsub()
    emit('e', 2)
    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(1)
  })

  it('off removes a specific handler', () => {
    const a = vi.fn()
    const b = vi.fn()
    on('e', a)
    on('e', b)
    off('e', a)
    emit('e', 1)
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledOnce()
  })

  it('off is a no-op for unknown event / handler', () => {
    const handler = vi.fn()
    expect(() => off('never-subscribed', handler)).not.toThrow()
  })

  it('emit with no subscribers is a silent no-op', () => {
    expect(() => emit('lonely', 'x')).not.toThrow()
  })

  it('does not deliver events emitted before subscription (no replay buffer)', () => {
    emit('past', 1)
    const handler = vi.fn()
    on('past', handler)
    expect(handler).not.toHaveBeenCalled()
  })

  it('catches and logs subscriber errors so other subscribers still run', () => {
    const consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = vi.fn(() => {
      throw new Error('boom')
    })
    const ok = vi.fn()
    on('e', failing)
    on('e', ok)
    emit('e', 1)
    expect(failing).toHaveBeenCalled()
    expect(ok).toHaveBeenCalled()
    expect(consoleErr).toHaveBeenCalled()
    consoleErr.mockRestore()
  })

  it('clearEventBus removes every subscriber', () => {
    const a = vi.fn()
    const b = vi.fn()
    on('e1', a)
    on('e2', b)
    clearEventBus()
    emit('e1', 1)
    emit('e2', 2)
    expect(a).not.toHaveBeenCalled()
    expect(b).not.toHaveBeenCalled()
  })
})
