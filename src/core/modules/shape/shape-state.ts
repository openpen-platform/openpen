import { ref } from 'vue'
import type { ShapeKind } from './shape-tool'

export const currentShape = ref<ShapeKind>('rect')
export const filled = ref(false)
export const isSubPanelOpen = ref(false)
