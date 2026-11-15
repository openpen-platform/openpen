import { describe, it, expect } from 'vitest'
import { parseOwnerInfo } from '../lib/owner-info.js'

// `gh api users/<login> --jq '[.id, .login, .type] | @json'` prints the JSON text itself
// (gh does not quote a jq string result), e.g. `[67287285,"alice","User"]`.
describe('parseOwnerInfo', () => {
  it('parses the array printed by gh for a personal account', () => {
    expect(parseOwnerInfo('[67287285,"alice","User"]\n')).toEqual({
      ownerId: 67287285,
      ownerLogin: 'alice',
      ownerType: 'User',
    })
  })

  it('rejects output that is not the expected [id, login, type] array', () => {
    expect(() => parseOwnerInfo('67287285,alice,User')).toThrow(/owner info/i)
    expect(() => parseOwnerInfo('[1,"a"]')).toThrow(/owner info/i)
    expect(() => parseOwnerInfo('')).toThrow(/owner info/i)
  })
})

describe('publish wiring', () => {
  it('reads owner info only through parseOwnerInfo (no double JSON.parse of the gh output)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const url = await import('node:url')
    const bin = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../bin/openpen.js')
    const src = fs.readFileSync(bin, 'utf-8')
    expect(src).toMatch(/parseOwnerInfo\(ownerResult\.stdout\)/)
    expect(src).not.toMatch(/JSON\.parse\(JSON\.parse\(/)
  })
})
