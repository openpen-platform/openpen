/**
 * Main-process checks on marketplace listing fields and images: what a plugin
 * author wrote is untrusted, so hostile fields are dropped and bad image bytes
 * never reach the renderer.
 */
import { describe, it, expect } from 'vitest'
import { withListing, createListingImageLoader } from '../../electron/marketplace-listing.js'

const RAW = 'https://raw.githubusercontent.com/alice/ruler/v1.2.0'

function row(overrides = {}) {
  return {
    id: '@alice/ruler', scope: 'alice', name: 'ruler', description: 'A ruler.',
    repo: 'https://github.com/alice/ruler',
    releaseUrl: 'https://github.com/alice/ruler/releases/download/v1.2.0/ruler-1.2.0.zip',
    latestVersion: '1.2.0',
    icon: `${RAW}/.github/marketplace/icon.png`,
    screenshots: [
      { src: `${RAW}/.github/marketplace/cover.png`, alt: 'A ruler on a page.' },
      { src: `${RAW}/.github/readme-demo.gif`, alt: 'A ruler is dragged.' },
    ],
    descriptionLocalized: { 'zh-Hant': '尺規', 'zh-Hans': '尺规' },
    ...overrides,
  }
}

const PNG_HEAD = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
function png(w, h, size = 64) {
  const b = Buffer.alloc(size)
  Buffer.from(PNG_HEAD).copy(b, 0)
  b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20)
  b.writeUInt32BE(0, 33); b.write('IEND', 37, 'latin1')
  return new Uint8Array(b)
}

describe('marketplace listing (main process)', () => {
  it('drops hostile listing fields and refuses images that are disguised or too large', async () => {
    const listed = withListing(row({
      name: 'ruler‮',
      description: 'evil\u0007 <img src=x onerror=alert(1)>',
      icon: 'https://evil.example/icon.png',
      screenshots: [
        { src: `${RAW}/../../bob/other/v1/x.png`, alt: 'Escapes the repo.' },
        { src: `${RAW}/.github/readme-demo.gif`, alt: 'Demo.' },
      ],
      descriptionLocalized: { 'zh-Hant': '好‮', fr: 'non' },
    }))
    expect(listed.icon).toBeUndefined()
    expect(listed.screenshots).toBeUndefined()
    expect(listed.name).toBe('ruler')
    expect(listed.description).toBe('evil <img src=x onerror=alert(1)>')
    expect(listed.descriptionLocalized).toEqual({ 'zh-Hant': '好' })
    // The same row without the hostile parts keeps every field.
    const clean = withListing(row())
    expect(clean.icon).toBe(`${RAW}/.github/marketplace/icon.png`)
    expect(clean.screenshots).toHaveLength(2)
    // A screenshot on another host drops the list, so no image ever comes from outside the repo.
    expect(withListing(row({ screenshots: [{ src: 'https://evil.example/cover.png', alt: 'Outside.' }] })).screenshots).toBeUndefined()
    // An image from another tag than the release is refused too.
    expect(withListing(row({ icon: 'https://raw.githubusercontent.com/alice/ruler/v9.9.9/icon.png' })).icon).toBeUndefined()

    const files = {
      [`${RAW}/.github/marketplace/icon.png`]: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'),
      [`${RAW}/.github/marketplace/cover.png`]: png(960, 675, 6 * 1024 * 1024),
      [`${RAW}/.github/readme-demo.gif`]: png(960, 675),
    }
    const requested = []
    const load = createListingImageLoader({
      lookup: () => withListing(row()),
      download: async (url) => { requested.push(url); return files[url] },
    })
    expect(await load('@alice/ruler', 'icon')).toMatchObject({ ok: false })
    expect(await load('@alice/ruler', 0)).toMatchObject({ ok: false, error: 'image too large' })
    expect(await load('@alice/ruler', 1)).toMatchObject({ ok: false, error: 'image format does not match its file name' })
    expect(await load('@alice/ruler', 4)).toMatchObject({ ok: false, error: 'no such image' })
    expect(requested.every((u) => u.startsWith(`${RAW}/`))).toBe(true)
  })

  it('checks each use of a shared file: a file loaded as a screenshot is still refused as the icon', async () => {
    const shared = `${RAW}/.github/marketplace/cover.png`
    const entry = withListing(row({ icon: shared }))
    const load = createListingImageLoader({ lookup: () => entry, download: async () => png(960, 675, 300 * 1024) })
    expect(await load('@alice/ruler', 0)).toMatchObject({ ok: true, mime: 'image/png' })
    expect(await load('@alice/ruler', 'icon')).toMatchObject({ ok: false, error: 'image too large' })
  })
})
