<script setup lang="ts">
import { onUnmounted } from 'vue'
import { useListingImage } from '../../../composables/useListingImage'

const props = defineProps<{ entry: CatalogEntry }>()

const { url, status, markBroken, cleanup } = useListingImage(() => props.entry, () => 'icon')
onUnmounted(cleanup)
</script>

<template>
  <img
    v-if="url"
    class="pl-icon"
    data-testid="plugin-listing-icon"
    :src="url"
    alt=""
    draggable="false"
    @error="markBroken"
  >
  <span
    v-else
    class="pl-icon pl-icon-ph"
    data-testid="plugin-listing-icon-placeholder"
    :data-status="status"
    aria-hidden="true"
  >
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
      <path d="M15.39 4.39a1 1 0 0 0 1.68-.474 2.5 2.5 0 1 1 3.014 3.015 1 1 0 0 0-.474 1.68l1.683 1.682a2.414 2.414 0 0 1 0 3.414L19.61 15.39a1 1 0 0 1-1.68-.474 2.5 2.5 0 1 0-3.014 3.015 1 1 0 0 1 .474 1.68l-1.683 1.682a2.414 2.414 0 0 1-3.414 0L8.61 19.61a1 1 0 0 0-1.68.474 2.5 2.5 0 1 1-3.014-3.015 1 1 0 0 0 .474-1.68l-1.683-1.682a2.414 2.414 0 0 1 0-3.414L4.39 8.61a1 1 0 0 1 1.68.474 2.5 2.5 0 1 0 3.014-3.015 1 1 0 0 1-.474-1.68l1.683-1.682a2.414 2.414 0 0 1 3.414 0z"/>
    </svg>
  </span>
</template>

<style scoped>
.pl-icon { display: block; object-fit: cover; flex-shrink: 0; }
.pl-icon-ph {
  display: inline-flex; align-items: center; justify-content: center;
  background: var(--surface-hi); border: 1px solid var(--border-hi);
  color: var(--text-muted); box-sizing: border-box;
}
.pl-icon-ph svg { width: 55%; height: 55%; }
</style>
