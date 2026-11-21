// Marketplace listing helpers for the renderer.
//
// Plugin images never load from their URL here: main fetches and checks the
// bytes (electron/marketplace-listing.js), and the renderer turns them into a
// blob: URL. Text from a plugin is only ever bound as plain text.

type Slot = 'icon' | number

const cache = new Map<string, Promise<string | null>>()

function key(entry: CatalogEntry, slot: Slot): string {
  return `${entry.id}@${entry.latestVersion}#${slot}`
}

/** Whether the entry declares this image at all (main has already checked the field). */
export function hasListingImage(entry: CatalogEntry, slot: Slot): boolean {
  if (slot === 'icon') return typeof entry.icon === 'string'
  return Array.isArray(entry.screenshots) && slot >= 0 && slot < entry.screenshots.length
}

/**
 * blob: URL of a listing image, or null when it is missing, refused or
 * unreachable. Successful loads are shared by the card and the detail dialog;
 * failures are forgotten so the next visit tries again.
 */
export function loadListingImage(entry: CatalogEntry, slot: Slot): Promise<string | null> {
  if (!hasListingImage(entry, slot)) return Promise.resolve(null)
  const k = key(entry, slot)
  let pending = cache.get(k)
  if (!pending) {
    pending = (async () => {
      try {
        const res = await window.openPenApi?.getPluginListingImage(entry.id, slot)
        if (!res || !res.ok) return null
        return URL.createObjectURL(new Blob([res.data as BlobPart], { type: res.mime }))
      } catch {
        return null
      }
    })()
    cache.set(k, pending)
    void pending.then((url) => { if (!url && cache.get(k) === pending) cache.delete(k) })
  }
  return pending
}

/** Test hook: forget every loaded image. */
export function resetListingImagesForTest(): void {
  cache.clear()
}

/** The description for the UI language: zh-Hant / zh-Hans when the entry has it, English otherwise. */
export function listingDescription(entry: CatalogEntry, locale: string): string {
  if (locale === 'zh-Hant' || locale === 'zh-Hans') {
    const text = entry.descriptionLocalized?.[locale]
    if (typeof text === 'string' && text) return text
  }
  return entry.description
}

/** Search match: name, owner, id and the English description, plus the description shown in the UI language. */
export function listingMatchesQuery(entry: CatalogEntry, query: string, locale: string): boolean {
  const q = query.toLowerCase().trim()
  if (!q) return true
  return (
    entry.name.toLowerCase().includes(q) ||
    entry.description.toLowerCase().includes(q) ||
    listingDescription(entry, locale).toLowerCase().includes(q) ||
    entry.ownerLogin.toLowerCase().includes(q) ||
    entry.id.toLowerCase().includes(q)
  )
}

/** Index of the GIF screenshot, if any: the demo the detail dialog plays first. */
export function demoScreenshotIndex(entry: CatalogEntry): number {
  const shots = entry.screenshots ?? []
  const i = shots.findIndex((s) => /\.gif$/i.test(s.src))
  return i >= 0 ? i : 0
}

/** Reduce motion: the app setting (data-reduced-motion on <html>) or the OS preference. */
export function prefersReducedMotion(): boolean {
  if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-reduced-motion') === 'true') return true
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
