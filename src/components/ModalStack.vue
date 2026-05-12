<script setup lang="ts">
/**
 * ModalStack — global modal container.
 *
 * Renders every contribution to the `ui.modals` slot. Each modal
 * contribution provides a Vue component that controls its own
 * visibility by injecting MODAL_MANAGER_KEY and calling isOpen(id).
 *
 * Provides ModalManager via MODAL_MANAGER_KEY so that:
 *   - Module control-bar buttons call open(id) to show their modal.
 *   - Modal components inject isOpen(id) to gate their visibility.
 */
import { ref, provide } from 'vue'
import { useSlot } from '../core/runtime/slot-runtime'
import type { ModalContribution } from '@openpen/module-api'
import { MODAL_MANAGER_KEY } from '@openpen/module-api'

const modals = useSlot<ModalContribution>('ui.modals')

const activeModalId = ref<string | null>(null)

const modalManager = {
  open(id: string) {
    activeModalId.value = id
  },
  close(id: string) {
    if (activeModalId.value === id) activeModalId.value = null
  },
  isOpen(id: string) {
    return activeModalId.value === id
  },
}

provide(MODAL_MANAGER_KEY, modalManager)
</script>

<template>
  <div class="modal-stack openpen-interactive">
    <component v-for="modal in modals" :key="modal.id" :is="modal.component" />
  </div>
</template>

<style scoped>
.modal-stack {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1000;
}

.modal-stack > :deep(*) {
  pointer-events: auto;
}
</style>
