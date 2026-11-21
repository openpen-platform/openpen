import { ref, readonly, watch } from 'vue'
import type { DeepReadonly, Ref } from 'vue'
import { hasListingImage, loadListingImage } from '../services/marketplace-listing'

export type ListingImageStatus = 'none' | 'loading' | 'ready' | 'failed'

/**
 * Track one listing image of an entry. `status` is 'none' when the entry has
 * no such image, 'failed' when main refused it, it could not be fetched, or
 * the browser could not decode it (markBroken); both show the placeholder.
 */
export function useListingImage(
  entry: () => CatalogEntry | null | undefined,
  slot: () => 'icon' | number | null,
): {
  url: DeepReadonly<Ref<string | null>>
  status: DeepReadonly<Ref<ListingImageStatus>>
  markBroken: () => void
  cleanup: () => void
} {
  const url = ref<string | null>(null)
  const status = ref<ListingImageStatus>('none')
  let token = 0

  const stop = watch(
    () => {
      const e = entry()
      const s = slot()
      return e && s !== null ? { e, s } : null
    },
    async (target) => {
      const mine = ++token
      url.value = null
      if (!target || !hasListingImage(target.e, target.s)) { status.value = 'none'; return }
      status.value = 'loading'
      const loaded = await loadListingImage(target.e, target.s)
      if (mine !== token) return
      url.value = loaded
      status.value = loaded ? 'ready' : 'failed'
    },
    { immediate: true },
  )

  // Main checked the header only; if the browser still cannot decode the bytes, show the placeholder.
  function markBroken() {
    url.value = null
    status.value = 'failed'
  }

  function cleanup() {
    token++
    stop()
  }

  return { url: readonly(url), status: readonly(status), markBroken, cleanup }
}
