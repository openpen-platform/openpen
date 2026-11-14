import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import drawingHotkeys from './index'
import { TOOL_HOTKEYS, COLOR_HOTKEYS } from './hotkeys'
import { BUILT_IN_MODULES } from '../registry'
import { DEFAULT_SHORTCUTS } from '../../../../shared/settings-defaults.js'
import { registerContribution, resetContributionStore } from '../../runtime/contribution-store'
import { on as eventBusOn } from '../../runtime/event-bus'

const shortcuts = () => drawingHotkeys.contributes?.shortcuts ?? []

describe('drawing-hotkeys module', () => {
  it('is registered as a built-in module', () => {
    expect(BUILT_IN_MODULES.map((m) => m.id)).toContain('@openpen/drawing-hotkeys')
  })

  it('contributes one shortcut per tool and per preset color', () => {
    expect(shortcuts()).toHaveLength(TOOL_HOTKEYS.length + COLOR_HOTKEYS.length)
  })

  it('scopes every shortcut to drawing mode so keys are untouched outside it', () => {
    for (const s of shortcuts()) expect(s.scope).toBe('drawing')
  })

  it('lists every shortcut in settings: labelled and customizable', () => {
    for (const s of shortcuts()) {
      expect(s.userCustomizable).toBe(true)
      expect(typeof (s.label as Record<string, string>).en).toBe('string')
    }
  })

  it('uses no key twice among its own defaults', () => {
    const keys = shortcuts().map((s) => s.keys.toLowerCase())
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('does not collide with any built-in app shortcut default', () => {
    const builtin = Object.values(DEFAULT_SHORTCUTS).map((k) => String(k).toLowerCase())
    for (const s of shortcuts()) expect(builtin).not.toContain(s.keys.toLowerCase())
  })

  it('targets tool ids that built-in modules actually contribute', () => {
    const contributed = new Set(
      BUILT_IN_MODULES.flatMap((m) => (m.contributes?.tools ?? []).map((t) => t.id)),
    )
    for (const t of TOOL_HOTKEYS) expect(contributed).toContain(t.toolId)
  })

  it('maps colors 1-8 to the eight swatches of the color picker', () => {
    expect(COLOR_HOTKEYS.map((c) => c.keys)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8'])
    expect(COLOR_HOTKEYS.map((c) => c.color)).toEqual([
      '#F87171', '#FB923C', '#FBBF24', '#34D399', '#60A5FA', '#818CF8', '#F472B6', '#FFFFFF',
    ])
  })
})

describe('drawing-hotkeys handlers', () => {
  const setActiveTool = vi.fn()
  const setStrokeStyle = vi.fn()
  let toolChanged: unknown[]
  let styleChanged: unknown[]
  let offTool: () => void
  let offStyle: () => void

  beforeEach(() => {
    resetContributionStore()
    setActiveTool.mockClear()
    setStrokeStyle.mockClear()
    ;(window as unknown as { openPenApi: unknown }).openPenApi = { setActiveTool, setStrokeStyle }
    for (const t of TOOL_HOTKEYS) {
      registerContribution('canvas.tools', '@openpen/test', { id: t.toolId, onPointerDown: () => undefined })
    }
    toolChanged = []
    styleChanged = []
    offTool = eventBusOn('tool-changed', (p) => { toolChanged.push(p) })
    offStyle = eventBusOn('stroke-style-changed', (p) => { styleChanged.push(p) })
  })

  afterEach(() => {
    offTool()
    offStyle()
    delete (window as unknown as { openPenApi?: unknown }).openPenApi
    resetContributionStore()
  })

  it('a tool key switches the tool locally and relays it so every control bar lights up', () => {
    const eraser = shortcuts().find((s) => s.id === 'tool-eraser')!
    eraser.handler()
    expect(toolChanged).toEqual([{ tool: 'eraser' }])
    expect(setActiveTool).toHaveBeenCalledWith({ tool: 'eraser' })
  })

  it('a color key sets the stroke color and broadcasts it', () => {
    const blue = shortcuts().find((s) => s.id === 'color-blue')!
    blue.handler()
    expect(styleChanged).toEqual([{ color: '#60A5FA' }])
    expect(setStrokeStyle).toHaveBeenCalledWith(expect.objectContaining({ color: '#60A5FA' }))
  })
})
