<script setup lang="ts">
withDefaults(defineProps<{ filled?: boolean }>(), { filled: false })
</script>

<template>
  <svg width="20" height="20" viewBox="0 0 24 24" :fill="filled ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">
    <ellipse cx="12" cy="12" rx="10" ry="6"/>
  </svg>
</template>
