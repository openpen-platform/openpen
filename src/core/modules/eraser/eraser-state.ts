import { ref } from 'vue'

// Last selected eraser mode; hydrated from module settings in setup().
export const lastEraserMode = ref<'eraser' | 'stroke-eraser'>('eraser')
