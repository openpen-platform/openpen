import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import { createI18n } from 'vue-i18n'
import McpTab from '../../src/components/settings/McpTab.vue'
import en from '../../src/i18n/en'
import { DEFAULT_SETTINGS } from '../../src/types/settings'
import type { AppSettings } from '../../src/types/settings'

let wrapper: VueWrapper | undefined

async function mountTab(status: McpServerStatus, mcp: Partial<AppSettings['mcp']> = {}) {
  vi.stubGlobal('openPenApi', {
    getModuleManifests: vi.fn().mockResolvedValue([]),
    getMcpStatus: vi.fn().mockResolvedValue(status),
    onMcpStatusChanged: vi.fn(() => () => {}),
  })
  const draft = reactive<AppSettings>({
    ...DEFAULT_SETTINGS,
    mcp: { ...DEFAULT_SETTINGS.mcp, enabledPlugins: [], enabled: true, apiKey: 'opk_' + 'a'.repeat(32), ...mcp },
  })
  const i18n = createI18n({ legacy: false, locale: 'en', messages: { en } })
  wrapper = mount(McpTab, { props: { draft }, global: { plugins: [i18n] } })
  await flushPromises()
  return { tab: wrapper, draft }
}

afterEach(() => {
  wrapper?.unmount()
  wrapper = undefined
  vi.unstubAllGlobals()
})

describe('MCP port field', () => {
  it('starts at the default 17639 and keeps an out-of-range port out of the draft, reporting it under the field', async () => {
    const { tab, draft } = await mountTab({ running: true, url: 'http://127.0.0.1:17639/mcp', error: null })
    const input = tab.get('[data-testid="mcp-port-input"]')
    expect((input.element as HTMLInputElement).value).toBe('17639')
    expect(draft.mcp.port).toBe(17639)
    expect(tab.find('[data-testid="mcp-port-default"]').exists()).toBe(false)

    await input.setValue('80')
    await input.trigger('blur')
    expect(draft.mcp.port).toBe(17639)
    expect(tab.get('[data-testid="mcp-port-invalid"]').text()).toContain('1024')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(tab.get('[data-testid="mcp-endpoint"]').text()).toBe('http://127.0.0.1:17639/mcp')

    await input.setValue('27640')
    expect(draft.mcp.port).toBe(27640)
    expect(tab.find('[data-testid="mcp-port-invalid"]').exists()).toBe(false)
    expect(tab.get('[data-testid="mcp-endpoint"]').text()).toBe('http://127.0.0.1:27640/mcp')
    expect(tab.get('[data-testid="mcp-port-default"]').text()).toContain('17639')
  })
})

describe('MCP port in use', () => {
  it('names the port that failed (not the built-in default) and marks the field, even with the switch off', async () => {
    const { tab } = await mountTab(
      { running: false, url: null, error: 'port_in_use', port: 27639, pendingEnable: true },
      { enabled: false, port: 27639 },
    )
    const banner = tab.get('[data-testid="mcp-error-banner"]').text()
    expect(banner).toContain('27639')
    expect(banner).not.toContain('17639')
    expect(tab.get('[data-testid="mcp-port-input"]').attributes('aria-invalid')).toBe('true')
    expect(tab.find('[data-testid="mcp-retry-btn"]').exists()).toBe(true)
  })
})

// Regressions (review): what Save sends after the field was edited.
describe('MCP port field regressions', () => {
  it('puts the previous port back when a valid half-typed value turns invalid', async () => {
    const { tab, draft } = await mountTab({ running: true, url: 'http://127.0.0.1:17639/mcp', error: null })
    const input = tab.get('[data-testid="mcp-port-input"]')
    await input.setValue('1234')
    expect(draft.mcp.port).toBe(1234)
    await input.setValue('123')
    expect(draft.mcp.port).toBe(17639)
    expect(tab.get('[data-testid="mcp-endpoint"]').text()).toBe('http://127.0.0.1:17639/mcp')
  })

  it('after a failed first enable, shows the switch on so that a new port and Save start the server', async () => {
    const { tab, draft } = await mountTab(
      { running: false, url: null, error: 'port_in_use', port: 27639, pendingEnable: true },
      { enabled: false, port: 27639 },
    )
    expect(draft.mcp.enabled).toBe(true)
    await tab.get('[data-testid="mcp-port-input"]').setValue('27640')
    expect(draft.mcp).toMatchObject({ enabled: true, port: 27640 })
    // The user may still turn it off; it is not switched on again.
    draft.mcp.enabled = false
    await flushPromises()
    expect(draft.mcp.enabled).toBe(false)
  })
})
