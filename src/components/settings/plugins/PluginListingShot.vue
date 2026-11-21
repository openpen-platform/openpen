<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useListingImage } from '../../../composables/useListingImage'

const props = withDefaults(defineProps<{
  entry: CatalogEntry
  index: number
  /** Show an animated GIF as its first frame only (reduce motion). */
  still?: boolean
}>(), { still: false })

const { url, status, markBroken, cleanup } = useListingImage(() => props.entry, () => props.index)
const alt = computed(() => props.entry.screenshots?.[props.index]?.alt ?? '')
const isGif = computed(() => /\.gif$/i.test(props.entry.screenshots?.[props.index]?.src ?? ''))

// First frame of a GIF, drawn once onto a canvas so it never animates.
const canvas = ref<HTMLCanvasElement | null>(null)
watch([url, canvas, () => props.still], ([u, c, still]) => {
  if (!u || !c || !still || !isGif.value) return
  const img = new Image()
  img.onload = () => {
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    c.getContext('2d')?.drawImage(img, 0, 0)
  }
  img.onerror = markBroken
  img.src = u
})

onUnmounted(cleanup)
</script>

<template>
  <canvas
    v-if="url && still && isGif"
    ref="canvas"
    class="pl-shot"
    data-testid="plugin-listing-shot"
    data-still="true"
    role="img"
    :aria-label="alt"
  />
  <img
    v-else-if="url"
    class="pl-shot"
    data-testid="plugin-listing-shot"
    :src="url"
    :alt="alt"
    draggable="false"
    @error="markBroken"
  >
  <div
    v-else
    class="pl-shot pl-shot-ph"
    data-testid="plugin-listing-shot-placeholder"
    :data-status="status"
    aria-hidden="true"
  >
    <svg v-if="status !== 'loading'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/>
    </svg>
  </div>
</template>

<style scoped>
.pl-shot { display: block; object-fit: cover; }
.pl-shot-ph {
  display: flex; align-items: center; justify-content: center;
  background: var(--row-bg); color: var(--text-muted);
}
.pl-shot-ph svg { width: 28px; height: 28px; opacity: 0.7; }
</style>
