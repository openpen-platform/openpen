<script setup lang="ts">
/**
 * AppButtonDropdown — split-mode dropdown button wrapper (Layer 1).
 *
 * Pairs an AppButton (main action) with a narrow caret button that toggles
 * an AppPopover. Modelled after Quasar's QBtnDropdown split-mode and shadcn
 * Button + DropdownMenu composition: main click and caret click are
 * independent events so the host can activate a tool on the main click
 * and open the dropdown on the caret click (or activate AND open from
 * the caret when the tool is currently inactive).
 *
 * Caret icon rotation tracks the host's snap edge and vertical layout via
 * the same injection keys AppButton uses — plugin authors get the right
 * rotation behaviour without configuring anything.
 *
 * Visual identity:
 *   - Main button: identical to AppButton (36×36 horizontal, 34×34 vertical)
 *   - Caret: 16 wide × 36 tall in horizontal mode (14 × 30 in vertical),
 *     hover background + accent on active, chevron rotates toward the
 *     popover side
 *   - Wrap: flex row in horizontal mode, flex column in vertical
 *
 * The structural classes (`app-btn-dropdown-wrap`, `app-btn-dropdown-caret`,
 * `app-btn-dropdown-caret-icon`) are deliberately stable so host CSS can
 * apply contextual overrides (e.g. `.cb-group--inset .app-btn-dropdown-caret`
 * shrinks the caret inside inset groups).
 */
import { computed, inject } from 'vue'
import { SNAP_EDGE_KEY, IS_VERTICAL_KEY } from '../../inject-keys'
import AppButton from './AppButton.vue'
import AppPopover from './AppPopover.vue'

// ── Public API ────────────────────────────────────────────────────────────────

const props = withDefaults(defineProps<{
  /** Globally unique popover id (passed through to the inner AppPopover). */
  popoverId: string
  /** Preferred popover placement; defaults to 'auto'. */
  popoverPlacement?: 'auto' | 'top' | 'bottom' | 'left' | 'right'
  /** Main button active state (drives accent highlight). */
  active?: boolean
  /** Disables both main and caret buttons; tooltip remains active. */
  disabled?: boolean
  /** Main button variant (passed through to AppButton). */
  variant?: 'default' | 'danger'
  /** Tooltip shown above the main button. */
  mainTooltip?: string
  /** Main button aria-label. */
  mainAriaLabel?: string
  /** Caret button aria-label. Required for screen-reader users. */
  caretAriaLabel?: string
  /** Optional test ids forwarded to the rendered buttons. */
  mainTestid?: string
  caretTestid?: string
}>(), {
  popoverPlacement: 'auto',
  active: false,
  disabled: false,
  variant: 'default',
  mainTooltip: undefined,
  mainAriaLabel: undefined,
  caretAriaLabel: undefined,
  mainTestid: undefined,
  caretTestid: undefined,
})

const emit = defineEmits<{
  /** Fires when the main button is clicked (unless `disabled`). */
  mainClick: []
  /**
   * Fires when the caret button is clicked (unless `disabled`).
   * AppPopover handles open/close via its own trigger logic; this event
   * lets the host run side-effects (e.g. activate the tool if it isn't
   * already active before opening the dropdown).
   */
  caretClick: []
}>()

// ── Orientation context (host-injected) ───────────────────────────────────────

const isVertical = inject(IS_VERTICAL_KEY, undefined)
const snapEdge = inject(SNAP_EDGE_KEY, undefined)

/**
 * Caret chevron rotation when the popover is open.
 *
 * - inactive → down (resting state, points at the popover that will appear)
 * - horizontal + active → up (popover is above, chevron points to it)
 * - vertical + snap-left or vbar-free + active → right (popover opens right)
 * - vertical + snap-right + active → left (popover opens left)
 */
function caretRotation(open: boolean): 'down' | 'up' | 'left' | 'right' {
  if (!open) return 'down'
  if (!isVertical?.value) return 'up'
  return snapEdge?.value === 'right' ? 'left' : 'right'
}

function onMainClick(): void {
  if (!props.disabled) emit('mainClick')
}

function onCaretClick(): void {
  if (!props.disabled) emit('caretClick')
}
</script>

<template>
  <div
    class="app-btn-dropdown-wrap"
    :class="{ 'app-btn-dropdown-wrap--vertical': isVertical }"
  >
    <AppButton
      :variant="variant"
      :active="active"
      :disabled="disabled"
      :tooltip="mainTooltip"
      :aria-label="mainAriaLabel"
      :data-testid="mainTestid"
      @click="onMainClick"
    >
      <slot name="main-content" />
    </AppButton>

    <AppPopover :popover-id="popoverId" :placement="popoverPlacement">
      <template #trigger="{ active: open }">
        <button
          type="button"
          class="app-btn-dropdown-caret"
          :class="{
            active: open,
            'app-btn-dropdown-caret--vertical': isVertical,
            'app-btn-dropdown-caret--disabled': disabled,
          }"
          :aria-label="caretAriaLabel"
          :aria-disabled="disabled || undefined"
          :data-testid="caretTestid"
          @click="onCaretClick"
        >
          <svg
            class="app-btn-dropdown-caret-icon"
            :class="`app-btn-dropdown-caret-icon--${caretRotation(open)}`"
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </template>
      <template #content>
        <slot name="popover-content" />
      </template>
    </AppPopover>
  </div>
</template>

<style>
/* Structural classes ship UNSCOPED on purpose so host CSS can apply
   contextual overrides (e.g. `.cb-group--inset .app-btn-dropdown-caret`
   shrinks the caret inside inset groups in the host control bar). The
   classes are deliberately prefixed `app-btn-dropdown-*` to avoid
   collisions in plugin code. */
.app-btn-dropdown-wrap {
  display: flex;
  align-items: center;
  gap: 0;
  -webkit-app-region: no-drag;
}

.app-btn-dropdown-wrap--vertical {
  flex-direction: column;
  gap: 2px;
}

.app-btn-dropdown-caret {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 36px;
  border: none;
  background: transparent;
  color: var(--openpen-color-text-dim);
  cursor: pointer;
  padding: 0;
  border-radius: 8px;
  transition: color var(--openpen-duration-fast), background var(--openpen-duration-fast);
}

.app-btn-dropdown-caret--vertical {
  width: 30px;
  height: 14px;
}

.app-btn-dropdown-caret:hover {
  color: var(--openpen-color-text-primary);
  background: var(--openpen-color-control-hover);
}

.app-btn-dropdown-caret.active {
  color: var(--openpen-color-accent);
  background: var(--openpen-color-accent-bg);
}

.app-btn-dropdown-caret--disabled {
  cursor: not-allowed;
}

.app-btn-dropdown-caret--disabled > * {
  opacity: 0.30;
}

.app-btn-dropdown-caret-icon {
  transition: transform 180ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.app-btn-dropdown-caret-icon--down { transform: rotate(0deg); }
.app-btn-dropdown-caret-icon--up { transform: rotate(180deg); }
.app-btn-dropdown-caret-icon--right { transform: rotate(-90deg); }
.app-btn-dropdown-caret-icon--left { transform: rotate(90deg); }
</style>
