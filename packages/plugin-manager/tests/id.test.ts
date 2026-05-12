import { describe, it, expect } from 'vitest'
import { parsePluginId, pluginsDirFor, PLUGIN_ID_RE } from '../src/id.ts'
import path from 'node:path'

describe('PLUGIN_ID_RE', () => {
  it('accepts a valid scoped id', () => {
    expect(PLUGIN_ID_RE.test('@alice/todo-app')).toBe(true)
  })

  it('accepts scope and name with digits and hyphens', () => {
    expect(PLUGIN_ID_RE.test('@org123/my-plugin-v2')).toBe(true)
  })

  it('rejects a bare id (no scope)', () => {
    expect(PLUGIN_ID_RE.test('todo-app')).toBe(false)
  })

  it('rejects uppercase in scope', () => {
    expect(PLUGIN_ID_RE.test('@Alice/todo')).toBe(false)
  })

  it('rejects uppercase in name', () => {
    expect(PLUGIN_ID_RE.test('@alice/Todo')).toBe(false)
  })

  it('rejects empty string', () => {
    expect(PLUGIN_ID_RE.test('')).toBe(false)
  })

  it('rejects multi-segment path', () => {
    expect(PLUGIN_ID_RE.test('@a/b/c')).toBe(false)
  })

  it('rejects leading hyphen in name', () => {
    expect(PLUGIN_ID_RE.test('@alice/-todo')).toBe(false)
  })

  it('rejects leading hyphen in scope', () => {
    expect(PLUGIN_ID_RE.test('@-alice/todo')).toBe(false)
  })
})

describe('parsePluginId', () => {
  it('splits valid id correctly', () => {
    expect(parsePluginId('@alice/todo-app')).toEqual({ scope: 'alice', name: 'todo-app' })
  })

  it('throws on invalid id', () => {
    expect(() => parsePluginId('bare-id')).toThrow(/Invalid plugin id/)
  })

  it('throws on empty string', () => {
    expect(() => parsePluginId('')).toThrow(/Invalid plugin id/)
  })

  it('throws on uppercase', () => {
    expect(() => parsePluginId('@Alice/Todo')).toThrow(/Invalid plugin id/)
  })
})

describe('pluginsDirFor', () => {
  it('builds correct path under base dir', () => {
    const result = pluginsDirFor('@alice/notes', '/base/plugins')
    expect(result).toBe(path.join('/base/plugins', '@alice', 'notes'))
  })
})
