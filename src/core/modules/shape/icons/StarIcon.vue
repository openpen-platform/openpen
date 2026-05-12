<script setup lang="ts">
withDefaults(defineProps<{ filled?: boolean }>(), { filled: false })
</script>

<template>
  <svg width="20" height="20" viewBox="0 0 24 24" :fill="filled ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
    <polygon points="12,3 14.1,9.2 20.6,9.2 15.3,13.1 17.3,19.3 12,15.5 6.7,19.3 8.7,13.1 3.4,9.2 9.9,9.2"/>
  </svg>
</template>
