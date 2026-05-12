<script setup lang="ts">
import { computed, ref } from 'vue';
import type { StyleValue, CSSProperties } from 'vue';

const props = withDefaults(defineProps<{
  panelClass?: string | Record<string, boolean> | Array<string | Record<string, boolean>>
  panelStyle?: StyleValue
  arrowDir?: string
  arrowOffset?: string
}>(), {
  panelClass: '',
  panelStyle: () => ({}),
  arrowDir: 'up',
  arrowOffset: '50%',
});

const emit = defineEmits(['panel-enter', 'panel-leave']);
const rootEl = ref<HTMLElement | null>(null);
const basePanelStyle: CSSProperties = {
  position: 'absolute',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  background: 'var(--surface-popup)',
  border: '1px solid var(--border-hi)',
  borderRadius: '14px',
  padding: '14px 16px',
  backdropFilter: 'var(--blur)',
  WebkitBackdropFilter: 'var(--blur)',
  boxShadow: 'var(--shadow-sm)',
  pointerEvents: 'auto',
  whiteSpace: 'nowrap',
  overflow: 'visible',
  zIndex: 20,
};

const mergedPanelStyle = computed(() => [basePanelStyle, props.panelStyle]);

defineExpose({ rootEl });
</script>

<template>
  <div
    ref="rootEl"
    class="popover-shell"
    :class="props.panelClass"
    :style="mergedPanelStyle"
    @click.stop
    @mouseenter="emit('panel-enter')"
    @mouseleave="emit('panel-leave')"
  >
    <div
      class="popup-arrow"
      :class="`arrow-${props.arrowDir}`"
      :style="{ '--arrow-offset': props.arrowOffset }"
    />
    <slot />
  </div>
</template>
