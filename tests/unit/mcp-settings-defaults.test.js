import { describe, it, expect } from 'vitest'
import { DEFAULT_SETTINGS } from '../../shared/settings-defaults.js'

describe('AC-20 fresh install => MCP switch off', () => {
  it('AC-20 DEFAULT_SETTINGS.mcp.enabled is false', () => {
    expect(DEFAULT_SETTINGS.mcp?.enabled).toBe(false)
  })

  it('AC-20 other MCP defaults match the contract (no key yet, read & draw, expose all)', () => {
    expect(DEFAULT_SETTINGS.mcp).toMatchObject({ apiKey: '', readOnly: false, exposeAll: true, enabledPlugins: [] })
  })
})
