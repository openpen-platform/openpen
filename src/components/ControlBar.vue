<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, watchEffect, provide, readonly, nextTick, inject } from 'vue';
import { useI18n } from 'vue-i18n';
import { SNAP_EDGE_KEY, IS_VERTICAL_KEY, WRAPPER_EL_KEY, ANCHOR_EL_KEY, MODAL_MANAGER_KEY, CONTROL_BAR_ANIMATING_KEY, HOST_DIALOG_OPEN_COUNT_KEY, POPOVER_PLACEMENT_HINT_KEY, ACTIVE_TOOL_KEY } from '@openpen/module-api';
import type { PopoverPlacementHint } from '@openpen/module-api';
import { useCollapseMode } from '../composables/useCollapseMode';
import { useDragSnap, type BarLayoutClass } from '../composables/useDragSnap';
import { useBarBoundsCache } from '../composables/useBarBoundsCache';
import { usePositioning } from '../composables/usePositioning';
import { useDiagnostics } from '../composables/useDiagnostics';
import { hostCommands } from '../services/host-commands';
import { useControlBarItems, shouldShowLeadingSeparator } from '../core/runtime/slot-runtime';
import { getSlotEntries } from '../core/runtime/contribution-store';
import type { ControlBarContribution } from '@openpen/module-api';
import { BUILT_IN_MODULES } from '../core/modules/registry';
import { reconcileLayoutGroups } from './control-bar-reconcile';
import { on as eventBusOn, emit as eventBusEmit } from '../core/runtime/event-bus';
import { useDialog } from '@openpen/module-api/uikit';
import { formatAccelerator, type Platform } from '../utils/format-accelerator';
import { DEFAULT_SHORTCUTS } from '../../shared/settings-defaults.js';

const platform: Platform = (window.openPenApi?.platform ?? 'darwin') as Platform;

const undoAccel = ref<string>(DEFAULT_SHORTCUTS.undo);
const redoAccel = ref<string>(DEFAULT_SHORTCUTS.redo);
let unsubShortcuts: (() => void) | null = null;

const undoHint = computed(() => formatAccelerator(undoAccel.value, platform));
const redoHint = computed(() => formatAccelerator(redoAccel.value, platform));

const { groups: controlBarGroups, layout: currentLayoutGroups, refreshLayout } = useControlBarItems();
const controlBarSlotEntries = getSlotEntries<ControlBarContribution>('ui.control-bar');

// Must stay in lockstep with the CSS transition durations; callers timing
// CONTROL_BAR_ANIMATING_KEY must reference these, not hardcode the value.
const BAR_EXPAND_DURATION_MS = 350;
const BAR_COLLAPSE_DURATION_MS = 250;

const { t } = useI18n();

// useCollapseMode reads via unref on each timer start so runtime changes take effect immediately.
const autoCollapseDelay = ref<number>(3000);

const {
  isExpanded,
  isPinned,
  expand,
  togglePin,
  startCollapseTimer,
  cancelCollapseTimer,
  cleanup: collapseCleanup,
} = useCollapseMode({ autoCollapseDelay });

const wrapperEl = ref<HTMLElement | null>(null);
// Passed to useDragSnap for out-of-bounds clamping against the full expanded bar area, not just the ball center.
const controlBarEl = ref<HTMLElement | null>(null);
const dragHandleEl = ref<HTMLElement | null>(null);

const { ballViewportPos, snapEdge: engineSnapEdge } = usePositioning();

// Write --ball-x / --ball-y directly to the DOM rather than as a reactive Vue
// template binding. ballViewportPos can update at 60 fps during snap/summon
// animations (RAF loop in usePositioning); a :style binding would force a full
// Vue vnode patch on every frame, making child elements "unstable" in Playwright
// and causing spurious mouseenter/mouseleave events as the layout shifts.
watchEffect(() => {
  const el = wrapperEl.value;
  if (!el) return;
  const vp = ballViewportPos.value;
  el.style.setProperty('--ball-x', vp ? `${vp.x}px` : '50%');
  el.style.setProperty('--ball-y', vp ? `${vp.y}px` : '50%');
});

// Measure the drag handle's center position within the bar and expose it as CSS
// variables on the wrapper element. Writing to the wrapper (which persists across
// expand/collapse) ensures the values are ready before the bar's enter animation
// starts, so the transform-origin is correct on the very first frame.
//
// X offset: drag handle center from bar's left edge — horizontal mode anchor.
// Y offset: drag handle center from bar's top edge — vertical mode anchor.
let dragHandleObserver: ResizeObserver | null = null;

function updateDragHandleOffset() {
  const wrapper = wrapperEl.value;
  const barEl = controlBarEl.value;
  const handleEl = dragHandleEl.value;
  if (!wrapper || !barEl || !handleEl) return;

  // offsetLeft / offsetWidth are unaffected by CSS transforms (including the
  // scale animation running at the moment of this call), so they give stable
  // layout-space measurements even while the bar's enter animation is active.
  //
  // offsetLeft is relative to the parent's content box; we must add the bar's
  // border-left-width so the result is relative to the bar's border box (which
  // is what getBoundingClientRect uses, and what the CSS `left` property aligns to).
  const barBorderLeft = parseFloat(getComputedStyle(barEl).borderLeftWidth) || 0;
  const barBorderTop  = parseFloat(getComputedStyle(barEl).borderTopWidth)  || 0;

  const offsetX = barBorderLeft + handleEl.offsetLeft + handleEl.offsetWidth  / 2;
  const offsetY = barBorderTop  + handleEl.offsetTop  + handleEl.offsetHeight / 2;

  wrapper.style.setProperty('--drag-handle-offset-x', `${offsetX}px`);
  wrapper.style.setProperty('--drag-handle-offset-y', `${offsetY}px`);
}

function connectDragHandleObserver() {
  dragHandleObserver?.disconnect();
  dragHandleObserver = null;
  const handleEl = dragHandleEl.value;
  if (!handleEl || typeof ResizeObserver === 'undefined') return;
  dragHandleObserver = new ResizeObserver(updateDragHandleOffset);
  dragHandleObserver.observe(handleEl);
}

// Only consulted when snap=OFF; snapped bars follow the edge instead.
const barLayout = ref<'horizontal' | 'vertical'>('horizontal');
// When ON, snap edge overrides barLayout; passed to useDragSnap so it clears stale snapEdge on toggle.
const enableDragAutoSnap = ref<boolean>(true);
let unsubBarLayout: (() => void) | null = null;

// barLayoutClassRef is a writable ref kept in sync with effectiveBarLayout (computed later).
// useDragSnap receives this ref and reads it inside its async drag-end timer so the
// engine gets the correct layout class for axis-specific clamping.
// The drag-end timer fires 50ms after mouseup; by that time both engineSnapEdge and
// barLayout have settled to their pre-drag-end values (correct for the current layout).
const barLayoutClassRef = ref<BarLayoutClass>('horizontal');

const {
  snapEdge,
  wasDragged,
  isPointerDragging,
  hasDragMotion,
  isSnapAnimatingToSide,
  onMouseDown,
  cleanup: dragCleanup,
} = useDragSnap({ barEl: controlBarEl, enableDragAutoSnap, barLayoutClass: barLayoutClassRef });

// Active snap edge: prefer useDragSnap's immediate value (set on drag-end),
// fall back to the engine's broadcast state (covers initial persisted snap on boot).
const activeSnapEdge = computed(() => snapEdge.value ?? engineSnapEdge.value);

const effectiveBarLayout = computed<BarLayoutClass>(() => {
  if (enableDragAutoSnap.value) {
    if (activeSnapEdge.value === 'left') return 'vbar-left';
    if (activeSnapEdge.value === 'right') return 'vbar-right';
    return 'horizontal';
  }
  if (barLayout.value === 'vertical') return 'vbar-free';
  return 'horizontal';
});

// Keep barLayoutClassRef in sync so useDragSnap's timer reads the correct value.
watch(effectiveBarLayout, (layout) => { barLayoutClassRef.value = layout; }, { immediate: true });

const isVertical = computed(() => effectiveBarLayout.value !== 'horizontal');

const ballViewportX = computed(() => ballViewportPos.value?.x ?? null);
const ballViewportY = computed(() => ballViewportPos.value?.y ?? null);

const { cleanup: barBoundsCacheCleanup } = useBarBoundsCache({
  barEl: controlBarEl,
  ballViewportX,
  ballViewportY,
  effectiveLayout: effectiveBarLayout,
  isExpanded,
  onMeasure: (bounds, layout) => {
    void window.openPenApi?.sendPositioningIntent?.({ type: 'bar-expand', barBounds: bounds, barLayoutClass: layout });
  },
});

/**
 * Deliberate UX rule for initial popover placement direction. Two-tier decision:
 *   1. Snap edge set → open away from the edge (left → right, right → left, etc.)
 *   2. Snap off → use screen midline: more space on which side determines direction.
 *      Horizontal bar: compare ball Y to viewport midpoint (top/bottom axis).
 *      Vertical bar: compare ball X to viewport midpoint (left/right axis).
 * Floating-ui flip handles secondary overflow; this is the proactive first choice.
 */
const popoverPlacementHint = computed<PopoverPlacementHint>(() => {
  const edge = activeSnapEdge.value;
  if (edge === 'left')   return 'right';
  if (edge === 'right')  return 'left';
  if (edge === 'top')    return 'bottom';
  if (edge === 'bottom') return 'top';

  // No snap edge — use midline of the current viewport.
  // ballViewportPos is in viewport coordinates (0,0 = workArea top-left).
  const vp = ballViewportPos.value;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (isVertical.value) {
    // Vertical bar: choose left or right based on horizontal position.
    const spaceRight = vw - (vp ? vp.x : vw / 2);
    const spaceLeft  = vp ? vp.x : vw / 2;
    return spaceRight >= spaceLeft ? 'right' : 'left';
  } else {
    // Horizontal bar: choose top or bottom based on vertical position.
    const spaceBelow = vh - (vp ? vp.y : vh / 2);
    const spaceAbove = vp ? vp.y : vh / 2;
    return spaceBelow >= spaceAbove ? 'bottom' : 'top';
  }
});

// Horizontal-bar tooltip flip: when the ball is close to the workArea top edge,
// the default `bottom: calc(100% + 8px)` tooltip would extend above the visible
// area. Flip to below the button only when in horizontal mode; vertical bars have
// their own horizontal tooltip direction handled separately in CSS.
//
// Threshold: bar is ~44px tall, tooltip ~26px high, offset 8px →
// total clearance needed ≈ 44/2 + 8 + 26 ≈ 56px from workArea top.
const TOOLTIP_FLIP_THRESHOLD_PX = 60;
const shouldFlipTooltipDown = computed(() =>
  !isVertical.value &&
  ballViewportPos.value !== null &&
  ballViewportPos.value.y < TOOLTIP_FLIP_THRESHOLD_PX,
);

provide(SNAP_EDGE_KEY, activeSnapEdge);
provide(IS_VERTICAL_KEY, readonly(isVertical));
provide(POPOVER_PLACEMENT_HINT_KEY, readonly(popoverPlacementHint));
// null so each AppPopover teleports to document.body — a shared Teleport target
// causes insertBefore conflicts when multiple popovers unmount simultaneously.
provide(WRAPPER_EL_KEY, ref<HTMLElement | null>(null));
provide(ANCHOR_EL_KEY, controlBarEl);

const activePanelId = ref<string | null>(null);
const panelManager = {
  open: (id: string) => {
    activePanelId.value = id;
  },
  close: (id: string) => { if (activePanelId.value === id) activePanelId.value = null; },
  isOpen: (id: string) => activePanelId.value === id,
};
provide(MODAL_MANAGER_KEY, panelManager);

// UIKit popovers auto-close while this is true to prevent floating-ui position drift.
const animating = ref(false);
let animatingTimer: ReturnType<typeof setTimeout> | null = null;

function setAnimating(durationMs: number) {
  if (animatingTimer !== null) clearTimeout(animatingTimer);
  animating.value = true;
  animatingTimer = setTimeout(() => {
    animating.value = false;
    animatingTimer = null;
  }, durationMs);
}

provide(CONTROL_BAR_ANIMATING_KEY, readonly(animating));

const dialog = useDialog();

// No dim overlay: on this transparent window a backdrop would appear as an opaque patch over the desktop.
const dialogOpenCount = inject(HOST_DIALOG_OPEN_COUNT_KEY, ref(0));
const isLockedByDialog = computed(() => dialogOpenCount.value > 0);

// Seeded to 'freehand' to match the overlay window's initial tool state.
const activeToolId = ref<string>('freehand');
provide(ACTIVE_TOOL_KEY, readonly(activeToolId));
let unsubToolChanged: (() => void) | null = null;

/** Ball shape during edge-snap interactions — avoids visual glitches mid-drag. */
const ballEdgeClass = computed(() => {
  // Restore full circle only while actively dragging a vertically-snapped ball.
  if (isVertical.value && isPointerDragging.value && hasDragMotion.value) return '';
  // During side-snap animation, delay the half-circle look until the ball reaches the edge.
  if (isVertical.value && isSnapAnimatingToSide.value) return '';
  return activeSnapEdge.value ? `edge-${activeSnapEdge.value}` : '';
});

// Stale anchor coordinates position popups incorrectly after a snap edge change.
watch(activeSnapEdge, () => {
  activePanelId.value = null;
  setAnimating(250); // snap animation: snapDurationMs = 250ms (per app.config.js)
});

// Recompute the drag handle offset when layout changes (horizontal ↔ vertical
// switch changes the cb-drag element's size and position within the bar).
watch(isVertical, () => {
  if (isExpanded.value) {
    nextTick(updateDragHandleOffset);
  }
});

// Reka UI Popover teleports to <body>, so `mouseleave` fires on the wrapper even
// while the cursor is actively inside an open popover. cursorOnBar + activePanelId
// together guard the collapse timer so the bar doesn't dismiss mid-interaction.
const cursorOnBar = ref(true);

function onWrapperMouseEnter() {
  cursorOnBar.value = true;
  cancelCollapseTimer();
}

function onWrapperMouseLeave() {
  cursorOnBar.value = false;
  if (activePanelId.value === null && !isLockedByDialog.value) {
    startCollapseTimer();
  }
}

watch(activePanelId, (panel) => {
  if (panel !== null) {
    cancelCollapseTimer();
  } else if (!cursorOnBar.value && !isLockedByDialog.value && document.visibilityState === 'visible') {
    startCollapseTimer();
  }
});

// Pause the auto-collapse timer while any dialog is open so users can read and
// respond without finding the bar collapsed when they return to it.
watch(isLockedByDialog, (locked) => {
  if (locked) {
    cancelCollapseTimer();
  } else if (!isPinned.value && !cursorOnBar.value && activePanelId.value === null && document.visibilityState === 'visible') {
    startCollapseTimer();
  }
});

watch(isExpanded, (expanded) => {
  setAnimating(expanded ? BAR_EXPAND_DURATION_MS : BAR_COLLAPSE_DURATION_MS);
  if (expanded) {
    // flush:'post' guarantees slot-mounted tool buttons (FreehandToolButton,
    // ShapeToolButton, etc.) are fully mounted and their event-bus listeners
    // registered before this watcher body runs — so the tool-changed event
    // is received and the correct active class applied immediately.
    eventBusEmit('tool-changed', { tool: activeToolId.value });
    // Measure drag handle offset after bar is fully in the DOM so the CSS
    // transform-origin reflects the actual cb-drag position.
    updateDragHandleOffset();
    connectDragHandleObserver();
  } else {
    dragHandleObserver?.disconnect();
    dragHandleObserver = null;
    // Keep the engine bar-expanded state in sync.
    void window.openPenApi?.sendPositioningIntent?.({ type: 'bar-collapse' });
  }
}, { flush: 'post' });

// Re-broadcast the active tool whenever slot contributions change while the
// bar is already expanded. Covers the race where modules finish loading
// AFTER the bar has expanded — tool buttons mount late, miss the initial
// tool-changed emit from the isExpanded watcher, and show no active state.
watch(controlBarSlotEntries, () => {
  if (isExpanded.value) {
    eventBusEmit('tool-changed', { tool: activeToolId.value });
  }
}, { flush: 'post' });

// Bar-expand positioning intent is sent by the onMeasure callback in
// useBarBoundsCache once the bar element mounts and reports real bounds.
// This avoids estimate-based pre-clamp that over-shoots on cold start.
function onBallClick() {
  if (wasDragged.value) return;
  expand();
}

async function onClearCanvasClick() {
  const settings = await window.openPenApi?.getSettings();
  const ask = settings?.confirmBeforeClearCanvas ?? true;
  if (!ask) {
    hostCommands.canvas.clear();
    return;
  }
  const ok = await dialog.confirm({
    title: t('clearCanvasConfirmTitle'),
    message: t('clearCanvasConfirmBody'),
    okLabel: t('clearCanvasConfirmAction'),
    cancelLabel: t('cancel'),
    danger: true,
  });
  if (ok) hostCommands.canvas.clear();
}

type LayoutGroupShape = import('./control-bar-reconcile').LayoutGroupShape

// Stable insertion order for built-ins so reconcileLayoutGroups places them before plugin items.
const builtInOrder = new Map<string, number>()
BUILT_IN_MODULES.forEach((mod, modIdx) => {
  const entries = (mod.contributes as { controlBar?: { id: string }[] }).controlBar ?? []
  entries.forEach((entry, entryIdx) => {
    builtInOrder.set(entry.id, modIdx * 1000 + entryIdx)
  })
})

const installedAtMap = ref<Map<string, string | null>>(new Map())

// Mirrored from main process; authoritative state lives there.
const isDrawingMode = ref(false);
let unsubDrawingMode: (() => void) | null = null;

let unsubRequestQuit: (() => void) | null = null;

// Undo / Redo state (authoritative state lives in overlay; these are mirrored flags).
const canUndo = ref(false);
const canRedo = ref(false);
let unsubHistoryState: (() => void) | null = null;

function onUndoClick() {
  if (!canUndo.value) return;
  hostCommands.history.undo();
}

function onRedoClick() {
  if (!canRedo.value) return;
  hostCommands.history.redo();
}

function openSettings() {
  if (isDrawingMode.value) return;
  window.openPenApi?.openSettingsWindow();
}

let quitDialogActive = false;

async function confirmAndQuit() {
  // De-dup: useDialog queues concurrent requests, which would stack a second
  // quit confirm if the user clicked the button and Cmd+Q in quick succession.
  if (quitDialogActive) return;
  quitDialogActive = true;
  try {
    const ok = await dialog.confirm({
      title: t('quitConfirmTitle'),
      message: t('quitConfirmBody'),
      okLabel: t('quitConfirmAction'),
      cancelLabel: t('cancel'),
      danger: true,
    });
    if (ok) window.openPenApi?.quitApp();
  } finally {
    quitDialogActive = false;
  }
}

function onQuitClick() {
  void confirmAndQuit();
}

const { pendingCount: pendingDiagnosticsCount } = useDiagnostics();

function openDiagnostics() {
  // Store deep-link target so SettingsView picks it up on mount.
  localStorage.setItem('openpen.settings-initial-tab', 'diagnostics');
  window.openPenApi?.openSettingsWindow();
}

// Idle fade — after 4s of inactivity, fade ball to 60% opacity.
const ballOpacity = ref(1);
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function resetIdleTimer() {
  ballOpacity.value = 1;
  clearTimeout(idleTimer ?? undefined);
  idleTimer = setTimeout(() => { ballOpacity.value = 0.6; }, 4000);
}

function clearIdleTimer() {
  clearTimeout(idleTimer ?? undefined);
  idleTimer = null;
  ballOpacity.value = 1;
}

watch(isExpanded, (expanded) => {
  if (expanded) {
    clearIdleTimer();
  } else {
    resetIdleTimer();
  }
});

// Visibility changes typically mean the settings window opened over us.
// Cancel the collapse timer so a pending mouseleave doesn't fire while hidden,
// and close overlay panels so popups don't re-show at stale positions.
function onVisibilityChange() {
  if (document.visibilityState === 'hidden') {
    cancelCollapseTimer();
    activePanelId.value = null;
  }
}

let passthroughIgnoring = true;

const IS_WIN_HOST = /Windows/.test(navigator.userAgent);

function onPassthroughMove(e: MouseEvent) {
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const shouldIgnore = !el?.closest(
    '.float-ball, .control-bar, .stroke-width-slider-wrap, .sw-vbtn-wrap, .sw-hpopup-wrap, .eraser-mode-panel, .cb-shape-wrap, .openpen-interactive'
  );
  if (shouldIgnore !== passthroughIgnoring) {
    passthroughIgnoring = shouldIgnore;
    window.openPenApi?.setIgnoreMouseEvents(shouldIgnore);
    // While drawing on Win, mirror passthrough state into the body
    // cursor so the OS cursor is hidden over the transparent control-
    // bar area (cursor would otherwise leak through the topmost HWND)
    // but visible over any interactive UI element. Without this,
    // popover surfaces inherit body cursor:none and only children
    // with an explicit cursor declaration (e.g. the colour-picker
    // hue wheel) show a cursor.
    if (IS_WIN_HOST && isDrawingMode.value) {
      document.body.style.cursor = shouldIgnore ? 'none' : '';
    }
  }
}

function onWindowLeave() {
  if (!passthroughIgnoring) {
    passthroughIgnoring = true;
    window.openPenApi?.setIgnoreMouseEvents(true);
  }
}

onMounted(async () => {
  document.addEventListener('mousemove', onPassthroughMove);
  document.addEventListener('mouseleave', onWindowLeave);
  document.addEventListener('visibilitychange', onVisibilityChange);
  if (!isExpanded.value) resetIdleTimer();

  unsubToolChanged = eventBusOn('tool-changed', (payload) => {
    const p = payload as { tool?: string };
    if (p?.tool) activeToolId.value = p.tool;
  });

  const initialSettings = await window.openPenApi?.getSettings();
  barLayout.value = initialSettings?.barLayout ?? 'horizontal';
  enableDragAutoSnap.value = initialSettings?.enableDragAutoSnap ?? true;
  autoCollapseDelay.value = initialSettings?.autoCollapseDelay ?? 3000;
  unsubBarLayout = window.openPenApi?.onSettingsUpdated((settings) => {
    barLayout.value = settings.barLayout ?? 'horizontal';
    enableDragAutoSnap.value = settings.enableDragAutoSnap ?? true;
    autoCollapseDelay.value = settings.autoCollapseDelay ?? 3000;
  }) ?? null;

  const metaRaw = await window.openPenApi?.getPluginMeta?.() ?? {};
  const newMap = new Map<string, string | null>();
  for (const [id, entry] of Object.entries(metaRaw)) {
    newMap.set(id, entry.installedAt ?? null);
  }
  installedAtMap.value = newMap;

  unsubDrawingMode = window.openPenApi?.onDrawingModeChanged((enabled) => {
    isDrawingMode.value = enabled;
    // Windows evaluates the OS cursor on the topmost HWND under the
    // pointer. The control-bar window covers the full workArea as a
    // transparent always-on-top window, and the overlay 'focus' →
    // mainWin.moveTop() z-order recovery in window-manager keeps the
    // control bar above the overlay during drawing mode. Without this
    // rule, the default OS arrow leaks through the transparent area of
    // the control bar whenever the user moves the pointer — visible
    // alongside the DOM cursor that renders in the overlay window.
    // macOS routes the OS cursor through NSCursor + webContents focus,
    // so the overlay's `cursor: none` already suppresses it there.
    //
    // Initial state on entry mirrors the current passthrough state
    // (hidden over transparent area, shown over interactive UI); the
    // passthrough-move handler refines on every subsequent transition.
    if (IS_WIN_HOST) {
      if (enabled) {
        document.body.style.cursor = passthroughIgnoring ? 'none' : '';
      } else {
        document.body.style.cursor = '';
      }
    }
  }) ?? null;

  unsubRequestQuit = window.openPenApi?.onRequestQuit(() => {
    void confirmAndQuit();
  }) ?? null;

  // Authoritative history state lives in the overlay window; this mirrors it.
  unsubHistoryState = window.openPenApi?.onHistoryStateChanged((state) => {
    canUndo.value = state.canUndo;
    canRedo.value = state.canRedo;
  }) ?? null;

  const initialShortcuts = await window.openPenApi?.getShortcuts();
  if (initialShortcuts) {
    if (initialShortcuts.undo) undoAccel.value = initialShortcuts.undo;
    if (initialShortcuts.redo) redoAccel.value = initialShortcuts.redo;
  }
  unsubShortcuts = window.openPenApi?.onShortcutsUpdated((s) => {
    if (s.undo) undoAccel.value = s.undo;
    if (s.redo) redoAccel.value = s.redo;
  }) ?? null;

  const layout = await window.openPenApi?.getLayout();
  if (layout?.groups) refreshLayout(layout.groups);
  window.openPenApi?.onLayoutUpdated((l) => { if (l?.groups) refreshLayout(l.groups); });
});

// Modules register async after onMounted, so contributions can arrive after the
// initial reconcile. Re-reconcile on each new arrival and persist any new groups.
// reconcileLayoutGroups returns the same reference when nothing changes, preventing loops.
watch(controlBarSlotEntries, (entries) => {
  const contributions = entries.map((e) => e.contribution);
  if (contributions.length === 0) return;
  const current = { version: 1 as const, groups: currentLayoutGroups.value as LayoutGroupShape[] };
  const reconciled = reconcileLayoutGroups(current, contributions, builtInOrder, installedAtMap.value);
  if (reconciled !== current) {
    refreshLayout(reconciled.groups);
    window.openPenApi?.setLayout(reconciled);
  }
}, { immediate: true });

onUnmounted(() => {
  document.removeEventListener('mousemove', onPassthroughMove);
  document.removeEventListener('mouseleave', onWindowLeave);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  clearIdleTimer();
  if (animatingTimer !== null) { clearTimeout(animatingTimer); animatingTimer = null; }
  dragHandleObserver?.disconnect();
  dragHandleObserver = null;
  unsubToolChanged?.();
  unsubToolChanged = null;
  unsubDrawingMode?.();
  unsubDrawingMode = null;
  unsubRequestQuit?.();
  unsubRequestQuit = null;
  unsubHistoryState?.();
  unsubHistoryState = null;
  unsubShortcuts?.();
  unsubShortcuts = null;
  unsubBarLayout?.();
  unsubBarLayout = null;
  collapseCleanup();
  dragCleanup();
  barBoundsCacheCleanup();
});
</script>

<template>
  <div
    ref="wrapperEl"
    class="control-bar-wrapper"
    data-testid="controlbar-panel"
    :class="{
      'snap-left':  activeSnapEdge === 'left',
      'snap-right': activeSnapEdge === 'right',
      'snap-bottom': activeSnapEdge === 'bottom',
      'has-colorpicker': isExpanded && activePanelId === 'color',
      'cb-locked': isLockedByDialog,
    }"
  >
    <Transition name="ball">
      <div
        v-if="!isExpanded"
        class="float-ball"
        data-testid="floatball-btn"
        :class="[ballEdgeClass, { 'drawing-active': isDrawingMode }]"
        :style="{ '--ball-opacity': ballOpacity }"
        role="button"
        tabindex="0"
        :aria-label="t('expandBar')"
        @mousedown="onMouseDown"
        @mousemove="resetIdleTimer"
        @click="onBallClick"
      >
        <span v-if="!activeSnapEdge" class="ball-ring" aria-hidden="true" />
        <!-- Diagnostics badge — top-right red dot, distinct from drawing-mode dot (bottom-right). -->
        <div
          v-if="pendingDiagnosticsCount > 0"
          class="float-ball-diag-badge"
          data-testid="floatball-diag-badge"
          role="button"
          :aria-label="`${pendingDiagnosticsCount} pending diagnostics`"
          @click.stop="openDiagnostics"
        >{{ pendingDiagnosticsCount }}</div>
        <svg class="float-ball-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="12 2 22 8.5 12 15 2 8.5 12 2" />
          <polyline points="2 15 12 21.5 22 15" />
          <polyline points="2 11.5 12 18 22 11.5" />
        </svg>
      </div>
    </Transition>

    <Transition :name="effectiveBarLayout !== 'horizontal' ? 'bar-v' : 'bar'">
      <div
        v-if="isExpanded"
        ref="controlBarEl"
        class="control-bar"
        data-testid="control-bar"
        :class="{
          [effectiveBarLayout]: effectiveBarLayout !== 'horizontal',
          'is-vertical': isVertical,
          'drawing-active': isDrawingMode,
          'tooltip-flip-down': shouldFlipTooltipDown,
        }"
        @mousedown.self="onMouseDown"
        @mouseenter="onWrapperMouseEnter"
        @mouseleave="onWrapperMouseLeave"
      >
        <div
          v-show="isDrawingMode"
          class="draw-mode-badge"
          aria-label="Drawing mode active"
        >
          <span class="draw-mode-badge-dot" />
        </div>

        <div ref="dragHandleEl" class="cb-drag" data-testid="controlbar-drag-handle" :aria-label="t('drag')" @mousedown="onMouseDown">
          <svg v-if="isVertical" width="16" height="10" viewBox="0 0 16 10" fill="currentColor">
            <circle cx="3" cy="3" r="1.5" /><circle cx="8" cy="3" r="1.5" /><circle cx="13" cy="3" r="1.5" />
            <circle cx="3" cy="7" r="1.5" /><circle cx="8" cy="7" r="1.5" /><circle cx="13" cy="7" r="1.5" />
          </svg>
          <svg v-else width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
            <circle cx="3" cy="3" r="1.5" /><circle cx="7" cy="3" r="1.5" />
            <circle cx="3" cy="8" r="1.5" /><circle cx="7" cy="8" r="1.5" />
            <circle cx="3" cy="13" r="1.5" /><circle cx="7" cy="13" r="1.5" />
          </svg>
        </div>

        <button
          class="cb-btn"
          data-testid="controlbar-pin-btn"
          :class="{ pinned: isPinned }"
          :data-tip="t('pin')"
          :aria-label="isPinned ? t('unpin') : t('pin')"
          @click="togglePin"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="17" x2="12" y2="22" />
            <path d="M5 17h14v-2l-2-6V5H7v4l-2 6v2z" />
            <line x1="9" y1="5" x2="15" y2="5" />
          </svg>
        </button>

        <!-- Inset MUST shrink inner items so the group's outer height stays at 36px — no bar fattening. -->
        <template v-for="(group, index) in controlBarGroups" :key="group.id">
          <div v-if="shouldShowLeadingSeparator(group, index, controlBarGroups)" class="cb-sep" />
          <div
            class="cb-group"
            :class="{ 'cb-group--inset': group.inset?.enabled }"
            :style="
              group.inset?.enabled && group.inset.color
                ? { '--cb-group-inset-color': group.inset.color }
                : undefined
            "
          >
            <component
              v-for="item in group.items"
              :key="item.id"
              :is="item.component"
            />
          </div>
        </template>

        <div class="cb-sep" />

        <button
          class="cb-btn cb-undo-btn"
          data-testid="controlbar-undo-btn"
          :class="{ 'cb-disabled': !canUndo }"
          :data-tip="canUndo ? `${t('undo')}  ${undoHint}` : t('undoDisabled')"
          :aria-label="t('undo')"
          @click="onUndoClick"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 7v6h6"/>
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>
          </svg>
        </button>

        <button
          class="cb-btn cb-redo-btn"
          data-testid="controlbar-redo-btn"
          :class="{ 'cb-disabled': !canRedo }"
          :data-tip="canRedo ? `${t('redo')}  ${redoHint}` : t('redoDisabled')"
          :aria-label="t('redo')"
          @click="onRedoClick"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 7v6h-6"/>
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13"/>
          </svg>
        </button>

        <div class="cb-sep" />

        <button
          class="cb-btn danger cb-clear-btn"
          data-testid="controlbar-clear-btn"
          :data-tip="t('clearCanvas')"
          :aria-label="t('clearCanvas')"
          @click="onClearCanvasClick"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6m4-6v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>

        <button
          v-if="pendingDiagnosticsCount > 0"
          class="cb-diag-chip"
          data-testid="controlbar-diag-chip"
          :aria-label="`${pendingDiagnosticsCount} pending diagnostics`"
          @click="openDiagnostics"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          {{ pendingDiagnosticsCount }}
        </button>

        <button
          class="cb-btn"
          data-testid="controlbar-settings-btn"
          :class="{ 'cb-disabled': isDrawingMode }"
          :data-tip="isDrawingMode ? t('settingsDisabledInDrawing') : t('settings')"
          :aria-label="t('settings')"
          :aria-disabled="isDrawingMode || undefined"
          @click="openSettings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>

        <button
          class="cb-btn"
          data-testid="controlbar-quit-btn"
          :data-tip="t('quit')"
          :aria-label="t('quit')"
          @click="onQuitClick"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>
    </Transition>

  </div>
</template>

<style src="./ControlBar.css" scoped></style>
