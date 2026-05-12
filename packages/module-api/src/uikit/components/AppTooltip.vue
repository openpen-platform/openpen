<script setup lang="ts">
/**
 * AppTooltip — High-level wrapper (Layer 1).
 *
 * Wraps Reka UI Tooltip (TooltipProvider / TooltipRoot / TooltipTrigger /
 * TooltipPortal / TooltipContent / TooltipArrow).
 *
 * Plugin authors get hover-triggered tooltips with OpenPen styling without
 * knowing about Reka UI internals or inject keys.
 *
 * Styles use --openpen-* design tokens.
 * No Reka UI types are leaked in the public API.
 *
 * Usage:
 *   <AppTooltip content="Save file" side="top">
 *     <button>Save</button>
 *   </AppTooltip>
 */
import {
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
  TooltipPortal,
  TooltipContent,
  TooltipArrow,
} from '../primitives'

// ── OpenPen-owned types (MUST NOT reference reka-ui types) ────────────────────

/** Preferred side for tooltip content relative to the trigger. */
export type TooltipSide = 'top' | 'bottom' | 'left' | 'right'

export interface AppTooltipProps {
  /** Tooltip text content. */
  content: string
  /** Preferred placement side relative to the trigger. Default 'top'. */
  side?: TooltipSide
  /** Delay before tooltip appears on hover, in ms. Default 200. */
  delay?: number
}

export interface AppTooltipSlots {
  /** Trigger element. Any element that receives hover events. */
  default: () => unknown
}

const props = withDefaults(defineProps<AppTooltipProps>(), {
  side: 'top',
  delay: 200,
})

defineSlots<AppTooltipSlots>()
</script>

<template>
  <TooltipProvider :delay-duration="props.delay">
    <TooltipRoot>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          :side="props.side"
          :side-offset="6"
          :avoid-collisions="true"
          :collision-padding="8"
          class="openpen-tooltip-content"
        >
          {{ props.content }}
          <TooltipArrow class="openpen-tooltip-arrow" :width="10" :height="5" />
        </TooltipContent>
      </TooltipPortal>
    </TooltipRoot>
  </TooltipProvider>
</template>

<!-- Styles for teleported TooltipContent MUST be unscoped — Vue scoped CSS
     does not follow Teleport targets (same rationale as AppPopover). -->
<style>
.openpen-tooltip-content {
  background: var(--openpen-color-tooltip-bg);
  border: 1px solid var(--openpen-color-border-hi);
  border-radius: var(--openpen-radius-sm);
  padding: 5px 9px;
  color: var(--openpen-color-tooltip-text);
  font-size: 12px;
  line-height: 1.4;
  /* Prevent text wrap for short tooltip labels */
  white-space: nowrap;
  box-shadow: var(--openpen-shadow-sm);
  z-index: 200;
  pointer-events: none;
}

.openpen-tooltip-arrow {
  fill: var(--openpen-color-tooltip-bg);
}

/* ── Open / close animations ────────────────────────────────────────────────
   Reka UI Presence keeps the element in the DOM until the CSS animation ends,
   so data-state="delayed-open" / "instant-open" / "closed" all animate. */
.openpen-tooltip-content[data-state='delayed-open'],
.openpen-tooltip-content[data-state='instant-open'] {
  animation: openpen-tooltip-in var(--openpen-duration-fast) var(--openpen-easing-standard);
}
.openpen-tooltip-content[data-state='closed'] {
  animation: openpen-tooltip-out var(--openpen-duration-fast) ease forwards;
}

@keyframes openpen-tooltip-in {
  from { opacity: 0; transform: scale(0.95); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes openpen-tooltip-out {
  from { opacity: 1; transform: scale(1); }
  to   { opacity: 0; transform: scale(0.95); }
}
</style>
