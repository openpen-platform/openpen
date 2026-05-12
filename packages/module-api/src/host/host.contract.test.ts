/**
 * host.contract.test.ts
 *
 * PURPOSE: Verify that @openpen/module-api/host re-exports the expected
 * API shapes for each service. When a host service API changes, CI catches
 * the breakage before downstream module code silently breaks.
 *
 * This is NOT a behavioral test — it only asserts that required exports
 * exist and have the expected types (function / object shape).
 *
 * Contract test — verifies the host sub-module public API surface is stable.
 */
import { describe, expect, it } from 'vitest'

describe('@openpen/module-api/host contract', () => {
  // ── Stroke Style ────────────────────────────────────────────────────────────

  describe('useStrokeStyle', () => {
    it('is exported as a function', async () => {
      const { useStrokeStyle } = await import('./index')
      expect(typeof useStrokeStyle).toBe('function')
    })
  })

  // ── Color Utilities ─────────────────────────────────────────────────────────

  describe('color utils', () => {
    it('exports resolveColorStyle as a function', async () => {
      const { resolveColorStyle } = await import('./index')
      expect(typeof resolveColorStyle).toBe('function')
    })

    it('exports hexToRgb and rgbToHex as functions', async () => {
      const { hexToRgb, rgbToHex } = await import('./index')
      expect(typeof hexToRgb).toBe('function')
      expect(typeof rgbToHex).toBe('function')
    })

    it('exports hsvToRgb, rgbToHsv, hexToHsv, hsvToHex as functions', async () => {
      const { hsvToRgb, rgbToHsv, hexToHsv, hsvToHex } = await import('./index')
      expect(typeof hsvToRgb).toBe('function')
      expect(typeof rgbToHsv).toBe('function')
      expect(typeof hexToHsv).toBe('function')
      expect(typeof hsvToHex).toBe('function')
    })

    it('exports isValidHex as a function', async () => {
      const { isValidHex } = await import('./index')
      expect(typeof isValidHex).toBe('function')
    })

    it('hexToRgb returns correct RGB for a known hex', async () => {
      const { hexToRgb } = await import('./index')
      expect(hexToRgb('#ff0000')).toEqual([255, 0, 0])
    })

    it('isValidHex accepts 6-digit hex and rejects invalid', async () => {
      const { isValidHex } = await import('./index')
      expect(isValidHex('#818cf8')).toBe(true)
      expect(isValidHex('818cf8')).toBe(false)
      expect(isValidHex('#xyz')).toBe(false)
    })
  })

  // ── Stroke Store ────────────────────────────────────────────────────────────

  describe('stroke store', () => {
    it('exports getAllStrokes, removeStrokeById, pushCommand as functions', async () => {
      const { getAllStrokes, removeStrokeById, pushCommand } = await import('./index')
      expect(typeof getAllStrokes).toBe('function')
      expect(typeof removeStrokeById).toBe('function')
      expect(typeof pushCommand).toBe('function')
    })

    it('getAllStrokes returns an array', async () => {
      const { getAllStrokes } = await import('./index')
      const result = getAllStrokes()
      expect(Array.isArray(result)).toBe(true)
    })
  })

  // ── Popup Anchor ────────────────────────────────────────────────────────────

  describe('popup anchor', () => {
    it('exports usePopupAnchor and calculatePopupAnchor as functions', async () => {
      const { usePopupAnchor, calculatePopupAnchor } = await import('./index')
      expect(typeof usePopupAnchor).toBe('function')
      expect(typeof calculatePopupAnchor).toBe('function')
    })

    it('calculatePopupAnchor returns expected shape for a basic input', async () => {
      const { calculatePopupAnchor } = await import('./index')
      const result = calculatePopupAnchor({
        triggerRect: { top: 100, left: 100, right: 150, bottom: 130, width: 50, height: 30 },
        wrapperRect: { top: 0, left: 0, right: 800, bottom: 800, width: 800, height: 800 },
        snapEdge: null,
        popupWidth: 160,
        popupHeight: 96,
      })
      expect(result).toHaveProperty('placement')
      expect(result).toHaveProperty('arrowDir')
      expect(result).toHaveProperty('arrowOffset')
      expect(result).toHaveProperty('popupStyle')
      expect(typeof result.popupStyle.top).toBe('string')
      expect(typeof result.popupStyle.left).toBe('string')
    })
  })

  // ── Passthrough Guard ───────────────────────────────────────────────────────

  describe('usePassthroughGuard', () => {
    it('is exported as a function', async () => {
      const { usePassthroughGuard } = await import('./index')
      expect(typeof usePassthroughGuard).toBe('function')
    })
  })

  // ── Host Commands ───────────────────────────────────────────────────────────

  describe('hostCommands', () => {
    it('is exported as an object', async () => {
      const { hostCommands } = await import('./index')
      expect(typeof hostCommands).toBe('object')
      expect(hostCommands).not.toBeNull()
    })

    it('exposes controlBar.togglePin as a function', async () => {
      const { hostCommands } = await import('./index')
      expect(typeof hostCommands.controlBar.togglePin).toBe('function')
    })

    it('exposes canvas.clear as a function', async () => {
      const { hostCommands } = await import('./index')
      expect(typeof hostCommands.canvas.clear).toBe('function')
    })

    it('exposes history.undo and history.redo as functions', async () => {
      const { hostCommands } = await import('./index')
      expect(typeof hostCommands.history.undo).toBe('function')
      expect(typeof hostCommands.history.redo).toBe('function')
    })

    it('exposes app.toggleDrawingMode and app.setDrawingMode as functions', async () => {
      const { hostCommands } = await import('./index')
      expect(typeof hostCommands.app.toggleDrawingMode).toBe('function')
      expect(typeof hostCommands.app.setDrawingMode).toBe('function')
    })
  })
})
