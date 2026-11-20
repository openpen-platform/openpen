import { describe, expect, it } from 'vitest'
import { createBuiltinTools, filterTools } from '../../electron/mcp/tools.js'

describe('plugin tool exposure', () => {
  it('AC-7 keeps the built-ins and only the explicitly selected plugin', () => {
    const builtin = createBuiltinTools({})
    const arrow = { name: 'openpen.arrow__draw', pluginId: '@openpen/arrow' }
    const ruler = { name: 'openpen.ruler__measure', pluginId: '@openpen/ruler' }

    expect(filterTools([...builtin, arrow, ruler], {
      exposeAll: false,
      enabledPlugins: [arrow.pluginId],
    }).map(({ name }) => name).sort()).toEqual([...builtin, arrow].map(({ name }) => name).sort())
  })
})

describe('plugin tool naming', () => {
  it('AC-2 rejects a plugin tool that duplicates a built-in name or an earlier plugin tool', async () => {
    const { buildPluginTools } = await import('../../electron/mcp/plugin-tools.js')
    const pluginId = '@openpen/arrow'
    const fullName = 'openpen.arrow__draw'
    const report = {
      pluginId,
      name: 'draw',
      description: 'Draw an arrow.',
      inputJsonSchema: { type: 'object', properties: {} },
      annotations: {},
    }
    const { tools, issues } = buildPluginTools([report], { builtinNames: [fullName] })

    expect(tools).toEqual([])
    const duplicateIssue = { [pluginId]: [{ tool: 'draw', fullName, reason: 'duplicate' }] }
    expect(issues).toEqual(duplicateIssue)

    const repeated = buildPluginTools([
      report,
      { ...report, description: 'Draw a second arrow.' },
    ], { builtinNames: [] })
    expect(repeated.tools).toEqual([
      expect.objectContaining({ name: fullName, description: report.description }),
    ])
    expect(repeated.issues).toEqual(duplicateIssue)
  })
})
