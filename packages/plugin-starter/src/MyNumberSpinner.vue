<script setup lang="ts">
/**
 * MyNumberSpinner — demonstrates building a custom component from Reka UI
 * primitives with OpenPen design tokens.
 *
 * All style values come from var(--openpen-*) tokens so the component follows
 * dark/light theme without any additional logic.
 *
 * Tokens used: input-bg, border, border-hi (focus ring), accent (focus ring),
 * text-primary, text-dim, text-muted, control-hover, radius-sm, space-xs,
 * space-sm, duration-fast, easing-standard.
 */
import {
  NumberFieldRoot,
  NumberFieldInput,
  NumberFieldIncrement,
  NumberFieldDecrement,
} from '@openpen/module-api/uikit'
import { ref } from 'vue'

const size = ref(16)
</script>

<template>
  <!-- Popover-style wrapper so this control appears as a button in the bar -->
  <NumberFieldRoot
    v-model="size"
    :min="2"
    :max="64"
    :step="2"
    class="spinner-root"
    aria-label="Custom size"
  >
    <div class="spinner-control">
      <NumberFieldDecrement class="spinner-btn" aria-label="Decrease size">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M2 5h6"/>
        </svg>
      </NumberFieldDecrement>
      <NumberFieldInput class="spinner-input" />
      <NumberFieldIncrement class="spinner-btn" aria-label="Increase size">
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M5 2v6M2 5h6"/>
        </svg>
      </NumberFieldIncrement>
    </div>
  </NumberFieldRoot>
</template>

<style scoped>
.spinner-root {
  display: flex;
  align-items: center;
}

.spinner-control {
  display: flex;
  align-items: center;
  background: var(--openpen-color-input-bg);
  border: 1px solid var(--openpen-color-border);
  border-radius: var(--openpen-radius-sm);
  overflow: hidden;
  transition: border-color var(--openpen-duration-fast) var(--openpen-easing-standard);
}

.spinner-control:focus-within {
  border-color: var(--openpen-color-accent);
}

.spinner-input {
  width: 36px;
  padding: var(--openpen-space-xs) 2px;
  background: transparent;
  border: none;
  outline: none;
  font-size: 11px;
  color: var(--openpen-color-text-primary);
  text-align: center;
}

/* Remove browser-default number spinners */
.spinner-input::-webkit-outer-spin-button,
.spinner-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
}

.spinner-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 24px;
  background: transparent;
  border: none;
  color: var(--openpen-color-text-dim);
  cursor: pointer;
  transition: background var(--openpen-duration-fast) var(--openpen-easing-standard),
              color var(--openpen-duration-fast) var(--openpen-easing-standard);
  flex-shrink: 0;
}

.spinner-btn:hover {
  background: var(--openpen-color-control-hover);
  color: var(--openpen-color-text-primary);
}

.spinner-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
