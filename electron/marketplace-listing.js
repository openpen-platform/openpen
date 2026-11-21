/**
 * Marketplace listing fields (icon, screenshots, descriptionLocalized) on
 * catalog entries, and the plugin images they point to.
 *
 * Everything a plugin author writes is untrusted, including what the catalog
 * already checked: the catalog file itself travels over the network and a
 * community entry is never reviewed by a person. This module re-checks the
 * fields before the renderer sees them and checks every image's bytes before
 * they reach the renderer. Rules: hq specs/plugin-spec.md, "市集展示欄位" and
 * "插件提供的文字與圖片".
 *
 * Kept free of `electron` imports so the rules can be unit-tested.
 */

export const RAW_ORIGIN = 'https://raw.githubusercontent.com'
const MAX_SCREENSHOTS = 5
const MAX_ALT = 200
const MAX_LOCALIZED = 80
const MAX_NAME = 64
const MAX_DESCRIPTION = 300
const LOCALES = ['zh-Hant', 'zh-Hans']

/** Byte caps per image kind; the catalog uses the same numbers. */
export const MAX_ICON_BYTES = 256 * 1024
export const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024
/** Pixel caps: an icon is 256x256 by rule, a screenshot at least 960 wide. */
const MAX_ICON_SIDE = 512
const MAX_SCREENSHOT_SIDE = 4096

// C0/C1 control characters, bidirectional overrides/isolates and marks.
const UNSAFE_TEXT_RE = /[\u0000-\u001F\u007F-\u009F؜‎‏‪-‮⁦-⁩]/g
const IMAGE_EXT = { '.png': 'png', '.jpg': 'jpeg', '.jpeg': 'jpeg', '.gif': 'gif' }
const MIME = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif' }

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/**
 * Plain text for display: control and bidirectional characters removed, then
 * cut to `max` code points. Returns '' for anything that is not a string.
 *
 * @param {unknown} v
 * @param {number} max
 * @returns {string}
 */
export function cleanText(v, max) {
  if (typeof v !== 'string') return ''
  const chars = [...v.replace(UNSAFE_TEXT_RE, '').trim()]
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('')
}

/**
 * The GitHub owner, repo and release tag an entry's images may come from:
 * owner and repo from `repo`, the tag from the release download URL.
 *
 * @param {{ repo?: unknown, releaseUrl?: unknown }} entry
 * @returns {{ owner: string, repo: string, tag: string } | null}
 */
export function releaseSource(entry) {
  const repo = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)\/?$/i.exec(typeof entry?.repo === 'string' ? entry.repo : '')
  if (!repo) return null
  let url
  try { url = new URL(String(entry.releaseUrl)) } catch { return null }
  if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null
  const parts = url.pathname.split('/').slice(1)
  // /<owner>/<repo>/releases/download/<tag>/<file>
  if (parts.length !== 6 || parts[2] !== 'releases' || parts[3] !== 'download') return null
  if (parts[0].toLowerCase() !== repo[1].toLowerCase() || parts[1].toLowerCase() !== repo[2].toLowerCase()) return null
  let tag
  try { tag = decodeURIComponent(parts[4]) } catch { return null }
  if (!tag) return null
  return { owner: repo[1], repo: repo[2], tag }
}

/**
 * Check one image URL against the entry's own repo and release tag. Returns
 * the image format its extension promises, or null when the URL is refused.
 *
 * @param {unknown} value
 * @param {{ owner: string, repo: string, tag: string }} source
 * @returns {'png' | 'jpeg' | 'gif' | null}
 */
export function imageUrlFormat(value, source) {
  if (typeof value !== 'string' || !source) return null
  let url
  try { url = new URL(value) } catch { return null }
  if (url.origin !== RAW_ORIGIN || url.username || url.password || url.search || url.hash) return null
  // The raw path, before URL parsing removed any "..": a parsed URL has already resolved them away.
  const rawPath = value.slice(RAW_ORIGIN.length)
  if (!rawPath.startsWith('/')) return null
  const segs = rawPath.slice(1).split('/')
  if (segs.length < 4) return null
  let decoded
  try { decoded = segs.map((s) => decodeURIComponent(s)) } catch { return null }
  if (decoded.some((s) => !s || s === '.' || s === '..' || s.includes('/') || s.includes('\\') || new RegExp(UNSAFE_TEXT_RE.source).test(s))) return null
  const [owner, repo, tag] = decoded
  if (owner.toLowerCase() !== source.owner.toLowerCase() || repo.toLowerCase() !== source.repo.toLowerCase()) return null
  if (tag !== source.tag) return null
  const m = /\.[A-Za-z]+$/.exec(decoded[decoded.length - 1])
  return m ? IMAGE_EXT[m[0].toLowerCase()] ?? null : null
}

/**
 * Copy an entry with its display text cleaned and its listing fields
 * re-checked. A field that breaks a rule is dropped; one bad screenshot drops
 * the whole list so the second image never stands in for the cover.
 *
 * @template {Record<string, any>} T
 * @param {T} entry       the entry the host will list
 * @param {Record<string, any>} [raw]  the catalog row it came from (defaults to entry)
 * @returns {T}
 */
export function withListing(entry, raw = entry) {
  const out = { ...entry }
  delete out.icon
  delete out.screenshots
  delete out.descriptionLocalized
  if (typeof entry.name === 'string') out.name = cleanText(entry.name, MAX_NAME)
  if (typeof entry.description === 'string') out.description = cleanText(entry.description, MAX_DESCRIPTION)

  if (isObject(raw?.descriptionLocalized)) {
    const loc = {}
    for (const k of LOCALES) {
      const text = cleanText(raw.descriptionLocalized[k], MAX_LOCALIZED)
      if (text) loc[k] = text
    }
    if (Object.keys(loc).length) out.descriptionLocalized = loc
  }

  const source = releaseSource(raw)
  if (source && imageUrlFormat(raw.icon, source) === 'png') out.icon = raw.icon

  const shots = raw?.screenshots
  if (source && Array.isArray(shots) && shots.length >= 1 && shots.length <= MAX_SCREENSHOTS) {
    const list = []
    for (const [i, item] of shots.entries()) {
      if (!isObject(item)) break
      const fmt = imageUrlFormat(item.src, source)
      if (!fmt || (i === 0 && fmt === 'gif')) break
      const alt = cleanText(item.alt, MAX_ALT)
      if (!alt) break
      list.push({ src: item.src, alt })
    }
    if (list.length === shots.length) out.screenshots = list
  }
  return out
}

/**
 * Attach listing fields to a parsed list, taking them from the raw catalog
 * rows with the same id (the community parser drops unknown fields).
 *
 * @template {{ id: string }} T
 * @param {T[]} entries
 * @param {unknown} rawRows
 * @returns {T[]}
 */
export function withListings(entries, rawRows) {
  const byId = new Map()
  if (Array.isArray(rawRows)) for (const r of rawRows) if (isObject(r) && typeof r.id === 'string' && !byId.has(r.id)) byId.set(r.id, r)
  return entries.map((e) => withListing(e, { ...e, ...(byId.get(e.id) ?? {}), id: e.id, repo: e.repo, releaseUrl: e.releaseUrl }))
}

// ── Image bytes ───────────────────────────────────────────────────────────────

/**
 * Read an image's real format and size from its bytes; the file name is not
 * trusted. Anything other than PNG, JPEG or GIF (SVG included) is null.
 *
 * @param {Uint8Array} buf
 * @returns {{ format: 'png' | 'jpeg' | 'gif' | null, width: number, height: number, animated: boolean }}
 */
export function inspectImage(buf) {
  const none = { format: null, width: 0, height: 0, animated: false }
  const b = Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)
  if (b.length >= 24 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    if (b.toString('latin1', 12, 16) !== 'IHDR') return none
    let animated = false
    for (let p = 8; p + 8 <= b.length;) {
      const len = b.readUInt32BE(p)
      const type = b.toString('latin1', p + 4, p + 8)
      if (type === 'acTL') { animated = true; break }
      if (type === 'IDAT' || type === 'IEND') break
      p += 12 + len
    }
    return { format: 'png', width: b.readUInt32BE(16), height: b.readUInt32BE(20), animated }
  }
  if (b.length >= 10 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6))) {
    return { format: 'gif', width: b.readUInt16LE(6), height: b.readUInt16LE(8), animated: false }
  }
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    for (let p = 2; p + 9 <= b.length;) {
      if (b[p] !== 0xff) return none
      const marker = b[p + 1]
      if (marker === 0xff) { p++; continue }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { p += 2; continue }
      const len = b.readUInt16BE(p + 2)
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { format: 'jpeg', width: b.readUInt16BE(p + 7), height: b.readUInt16BE(p + 5), animated: false }
      }
      if (marker === 0xda || len < 2) return none
      p += 2 + len
    }
  }
  return none
}

/**
 * Accept or refuse fetched image bytes. The format read from the bytes must
 * match the one the URL promised, the cover must be still, and size caps hold.
 *
 * @param {Uint8Array} bytes
 * @param {{ kind: 'icon' | 'screenshot', expected: 'png' | 'jpeg' | 'gif', cover?: boolean }} want
 * @returns {{ ok: true, mime: string } | { ok: false, error: string }}
 */
export function checkImageBytes(bytes, want) {
  const maxBytes = want.kind === 'icon' ? MAX_ICON_BYTES : MAX_SCREENSHOT_BYTES
  if (bytes.byteLength > maxBytes) return { ok: false, error: 'image too large' }
  const info = inspectImage(bytes)
  if (!info.format) return { ok: false, error: 'not a PNG, JPEG or GIF image' }
  if (info.format !== want.expected) return { ok: false, error: 'image format does not match its file name' }
  if (want.cover && info.animated) return { ok: false, error: 'cover must be a still image' }
  const side = want.kind === 'icon' ? MAX_ICON_SIDE : MAX_SCREENSHOT_SIDE
  if (!info.width || !info.height || info.width > side || info.height > side) return { ok: false, error: 'image dimensions out of range' }
  return { ok: true, mime: MIME[info.format] }
}

/**
 * Resolve which image a renderer request means, from the main process's own
 * copy of the entry. The renderer only names the entry and the slot; it never
 * supplies a URL.
 *
 * @param {Record<string, any> | undefined} entry  listing-checked entry (see withListing)
 * @param {'icon' | number} slot
 * @returns {{ url: string, kind: 'icon' | 'screenshot', expected: 'png' | 'jpeg' | 'gif', cover: boolean } | null}
 */
export function resolveImage(entry, slot) {
  if (!entry) return null
  const source = releaseSource(entry)
  if (!source) return null
  if (slot === 'icon') {
    const fmt = imageUrlFormat(entry.icon, source)
    return fmt === 'png' ? { url: entry.icon, kind: 'icon', expected: fmt, cover: false } : null
  }
  if (!Number.isInteger(slot) || slot < 0) return null
  const shot = Array.isArray(entry.screenshots) ? entry.screenshots[slot] : undefined
  const fmt = imageUrlFormat(shot?.src, source)
  if (!fmt) return null
  return { url: shot.src, kind: 'screenshot', expected: fmt, cover: slot === 0 }
}

/**
 * Fetch one listing image through `download`, check it, and keep successful
 * results in a small cache. Failures are not cached so a later visit retries.
 *
 * @param {{
 *   lookup: (id: string) => Record<string, any> | undefined,
 *   download: (url: string, maxBytes: number) => Promise<Uint8Array>,
 *   cacheSize?: number,
 * }} deps
 */
export function createListingImageLoader({ lookup, download, cacheSize = 48 }) {
  /** @type {Map<string, Promise<{ ok: true, mime: string, data: Uint8Array }>>} */
  const cache = new Map()
  return async function loadListingImage(id, slot) {
    const target = resolveImage(lookup(id), slot)
    if (!target) return { ok: false, error: 'no such image' }
    // Keyed by use as well as URL: the same file may pass as a screenshot but not as an
    // icon (byte and pixel caps) or as the cover (must be still), so each use is checked.
    const key = `${target.kind}|${target.cover ? 'cover' : ''}|${target.url}`
    let pending = cache.get(key)
    if (!pending) {
      pending = (async () => {
        const maxBytes = target.kind === 'icon' ? MAX_ICON_BYTES : MAX_SCREENSHOT_BYTES
        const data = await download(target.url, maxBytes)
        const verdict = checkImageBytes(data, target)
        if (!verdict.ok) throw new Error(verdict.error)
        return { ok: true, mime: verdict.mime, data }
      })()
      cache.set(key, pending)
      if (cache.size > cacheSize) cache.delete(cache.keys().next().value)
      pending.catch(() => { if (cache.get(key) === pending) cache.delete(key) })
    }
    try {
      return await pending
    } catch (err) {
      return { ok: false, error: err?.message ?? 'image unavailable' }
    }
  }
}
