<script setup lang="ts">
withDefaults(defineProps<{ filled?: boolean }>(), { filled: false })
</script>

<template>
  <svg width="20" height="20" viewBox="0 0 24 24" :fill="filled ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8">
    <rect x="4" y="4" width="16" height="16"/>
  </svg>
</template>
