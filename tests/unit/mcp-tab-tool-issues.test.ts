import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createI18n } from 'vue-i18n'
import McpTab from '../../src/components/settings/McpTab.vue'
import en from '../../src/i18n/en'
import { DEFAULT_SETTINGS } from '../../src/types/settings'

const whiteboard = '@openpen/whiteboard'
const stepMarker = '@openpen/step-marker'
const arrow = '@openpen/arrow'
const longName = 'numbered_step_'.repeat(10)
const manifests = [whiteboard, stepMarker, arrow].map(id => ({
  id, name: id.split('/')[1], version: '1.0.0', rendererEntry: null,
}))

const issueSelector = (id: string) => `[data-testid="mcp-plugin-issues-${id}"]`
const detailsSelector = (id: string) => `[data-testid="mcp-plugin-issues-list-${id}"]`
const rowSelector = (id: string) => `[data-testid="mcp-plugin-row-${id}"]`

let wrapper: VueWrapper | undefined

async function openPluginList() {
  vi.stubGlobal('openPenApi', {
    getModuleManifests: vi.fn().mockResolvedValue(manifests),
    getMcpStatus: vi.fn().mockResolvedValue({
      running: true,
      url: 'http://127.0.0.1:8731/mcp',
      error: null,
      pluginToolIssues: {
        [whiteboard]: [{ tool: 'toggle', fullName: 'openpen.whiteboard__toggle', reason: 'duplicate' }],
        [stepMarker]: [
          { tool: 'next step', fullName: 'openpen.step-marker__next step', reason: 'invalid_chars' },
          { tool: longName, fullName: `openpen.step-marker__${longName}`, reason: 'too_long' },
        ],
      },
    }),
    onMcpStatusChanged: vi.fn(() => () => {}),
  })

  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  const tab = mount(McpTab, {
    props: {
      draft: reactive({
        ...DEFAULT_SETTINGS,
        mcp: {
          ...DEFAULT_SETTINGS.mcp,
          enabled: true,
          readOnly: false,
          exposeAll: false,
          enabledPlugins: manifests.map(({ id }) => id),
        },
      }),
    },
    global: { plugins: [i18n] },
  })
  wrapper = tab
  await flushPromises()
  await tab.get('[data-testid="mcp-plugins-disclose"]').trigger('click')
  return tab
}

function showsDetails(row: ReturnType<VueWrapper['get']>, id: string) {
  const details = row.find(detailsSelector(id))
  return details.exists() && details.isVisible()
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})

describe('MCP plugin tool issue labels', () => {
  it('AC-2 counts blocked tools and reveals their names and reasons on demand', async () => {
    const tab = await openPluginList()
    const cases = [
      {
        pluginId: whiteboard,
        label: '1 tool not exposed',
        entries: [/^toggle\s*[—–:-]?\s*same name as a tool already exposed$/],
      },
      {
        pluginId: stepMarker,
        label: '2 tools not exposed',
        entries: [
          /^next step\s*[—–:-]?\s*name contains a character that isn't allowed$/,
          new RegExp(`^${longName}\\s*[—–:-]?\\s*name is longer than 128 characters$`),
        ],
      },
    ]

    for (const mode of ['Choose', 'All plugins', 'Read-only']) {
      if (mode === 'All plugins') {
        const all = tab.get('[data-testid="mcp-expose-all"]')
        await all.trigger('click')
        expect(all.attributes('aria-checked')).toBe('true')
      }
      if (mode === 'Read-only') {
        await tab.get('[data-testid="mcp-expose-choose"]').trigger('click')
        const readOnly = tab.get('[data-testid="mcp-access-readonly"]')
        await readOnly.trigger('click')
        expect(readOnly.attributes('aria-checked')).toBe('true')
        expect(tab.find('[data-testid="mcp-plugins-disclose"]').exists()).toBe(false)
      }
      if (mode !== 'Choose') {
        expect(tab.find(rowSelector(arrow)).exists(), `${mode} hides ${arrow}`).toBe(false)
      }
      for (const { pluginId, label, entries } of cases) {
        const row = tab.find(rowSelector(pluginId))
        expect.soft(row.exists() && row.isVisible(), `${mode} shows ${pluginId}`).toBe(true)
        if (!row.exists()) continue
        if (mode !== 'Choose') {
          expect(row.find(`[data-testid="mcp-plugin-toggle-${pluginId}"]`).exists()).toBe(false)
        }
        const chip = row.get(issueSelector(pluginId))
        expect(chip.isVisible()).toBe(true)
        expect(chip.text()).toBe(label)
        expect(showsDetails(row, pluginId)).toBe(false)

        await chip.trigger('click')
        expect(showsDetails(row, pluginId)).toBe(true)
        const details = row.get(detailsSelector(pluginId))
        for (const entry of entries) {
          const reasonRow = details.findAll('*').reverse().find(element => entry.test(element.text()))
          expect(reasonRow?.isVisible(), `Visible issue row matching ${entry}`).toBe(true)
          if (!reasonRow) continue
          const hiddenElements = new Set(reasonRow.findAll('*')
            .filter(element => !element.isVisible())
            .map(element => element.element))
          const visibleText = (node: Node): string => {
            if (node instanceof Element && hiddenElements.has(node)) return ''
            if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
            return Array.from(node.childNodes, visibleText).join('')
          }
          expect(visibleText(reasonRow.element)).toMatch(entry)
        }

        await chip.trigger('click')
        expect(showsDetails(row, pluginId)).toBe(false)
        expect(chip.isVisible()).toBe(true)
        expect(chip.text()).toBe(label)
      }
    }
  })

  it('AC-2 shows no issue label or details in a plugin row without issues', async () => {
    const tab = await openPluginList()
    const row = tab.get(rowSelector(arrow))

    expect(row.find(issueSelector(arrow)).exists()).toBe(false)
    expect(row.find(detailsSelector(arrow)).exists()).toBe(false)
  })
})
