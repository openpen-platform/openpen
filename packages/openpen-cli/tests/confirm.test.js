/**
 * Unit tests for the install-confirm prompt helper.
 *
 * The helper is the readline-based prompt used when stdin is a TTY. Tests feed
 * PassThrough streams as input/output so we can drive 'y' / 'n' / empty / 'yes'
 * deterministically without spawning a child process.
 */

import { describe, it, expect } from 'vitest'
import { PassThrough } from 'node:stream'
import { promptInstallConfirm, extractYesFlag } from '../lib/confirm.js'

function makeStreams() {
  const input = new PassThrough()
  const output = new PassThrough()
  const written = []
  output.on('data', (chunk) => written.push(chunk.toString()))
  return { input, output, written }
}

describe('promptInstallConfirm', () => {
  it('resolves true when user types "y"', async () => {
    const { input, output, written } = makeStreams()
    const pending = promptInstallConfirm({ input, output, pluginId: '@foo/bar' })
    input.write('y\n')
    expect(await pending).toBe(true)
    expect(written.join('')).toContain('@foo/bar')
    expect(written.join('')).toContain('full host access')
  })

  it('resolves true when user types "Y" (case-insensitive)', async () => {
    const { input, output } = makeStreams()
    const pending = promptInstallConfirm({ input, output, pluginId: '@foo/bar' })
    input.write('Y\n')
    expect(await pending).toBe(true)
  })

  it('resolves true when user types "yes"', async () => {
    const { input, output } = makeStreams()
    const pending = promptInstallConfirm({ input, output, pluginId: '@foo/bar' })
    input.write('yes\n')
    expect(await pending).toBe(true)
  })

  it('resolves false when user types "n"', async () => {
    const { input, output } = makeStreams()
    const pending = promptInstallConfirm({ input, output, pluginId: '@foo/bar' })
    input.write('n\n')
    expect(await pending).toBe(false)
  })

  it('resolves false when user presses Enter on the empty prompt', async () => {
    const { input, output } = makeStreams()
    const pending = promptInstallConfirm({ input, output, pluginId: '@foo/bar' })
    input.write('\n')
    expect(await pending).toBe(false)
  })

  it('resolves false when user types a non-affirmative answer', async () => {
    const { input, output } = makeStreams()
    const pending = promptInstallConfirm({ input, output, pluginId: '@foo/bar' })
    input.write('maybe\n')
    expect(await pending).toBe(false)
  })

  it('resolves false when the input stream closes before any answer (Ctrl+D)', async () => {
    const { input, output } = makeStreams()
    const pending = promptInstallConfirm({ input, output, pluginId: '@foo/bar' })
    input.end()
    expect(await pending).toBe(false)
  })
})

describe('extractYesFlag', () => {
  it('returns yes=false and unchanged args when no flag is present', () => {
    expect(extractYesFlag(['@foo/bar'])).toEqual({ yes: false, rest: ['@foo/bar'] })
  })

  it('strips --yes and reports yes=true', () => {
    expect(extractYesFlag(['--yes', '@foo/bar'])).toEqual({ yes: true, rest: ['@foo/bar'] })
  })

  it('strips -y and reports yes=true', () => {
    expect(extractYesFlag(['-y', '@foo/bar'])).toEqual({ yes: true, rest: ['@foo/bar'] })
  })

  it('strips --yes regardless of position', () => {
    expect(extractYesFlag(['@foo/bar', '--yes'])).toEqual({ yes: true, rest: ['@foo/bar'] })
  })

  it('preserves the positional source argument', () => {
    expect(extractYesFlag(['./local/plugin/path', '-y'])).toEqual({
      yes: true,
      rest: ['./local/plugin/path'],
    })
  })
})
