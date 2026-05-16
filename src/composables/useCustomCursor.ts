/**
 * useCustomCursor — drives the DOM cursor element that replaces the OS
 * cursor while drawing mode is active.
 *
 * Subscribes to drawing-mode toggles, tool-changed events, pointermove
 * (for transform updates) and pointerleave/pointerenter (for cross-window
 * hide). The compiled cursor is cached per tool id so we don't re-run
 * DOMPurify on every tool switch — `current` only changes when the
 * active tool's contribution changes.
 */
import { ref, computed, readonly, onMounted, onUnmounted, watch } from 'vue'
import {
  compileCursor,
  sanitizeSvgMarkup,
  pluginHostname as toPluginHostname,
  type CompiledCursor,
  type CursorContribution,
} from '@openpen/module-api'
import { getSlotEntries } from '../core/runtime/contribution-store'
import { on as eventBusOn } from '../core/runtime/event-bus'

/**
 * Default cursor rendered when the active tool has no cursor
 * contribution (or only a legacy keyword string). Markup goes through
 * DOMPurify at module load so the v-html safety invariant holds even
 * for host-shipped markup.
 */
const DEFAULT_HOST_CURSOR: CompiledCursor = Object.freeze({
  svgMarkup: sanitizeSvgMarkup(
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none">' +
      '<path d="M12 3 L12 21 M3 12 L21 12" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.6"/>' +
      '<path d="M12 3 L12 21 M3 12 L21 12" stroke="#111111" stroke-width="1.5" stroke-linecap="round"/>' +
      '</svg>',
  ),
  hotspot: { x: 12, y: 12 },
  fallbackCssKeyword: 'crosshair',
})

function resolvePluginHostname(moduleId: string): string | undefined {
  // Built-in modules ship inline SVG only — they never need a hostname
  // since path-form is rejected by R7/R10.
  if (moduleId.startsWith('@openpen/')) return undefined
  return toPluginHostname(moduleId)
}

export function useCustomCursor() {
  const cursorRef = ref<HTMLDivElement | null>(null)
  const isDrawingMode = ref(false)
  const pointerInside = ref(true)
  const interactiveHover = ref(false)
  const activeToolId = ref<string | null>(null)
  const current = ref<CompiledCursor | null>(DEFAULT_HOST_CURSOR)

  // interactiveHover hides the DOM cursor while the user interacts with
  // the main window's UI (control bar, popovers). Relayed from the main
  // window's passthrough guard via main process; matters on Windows
  // where pointermove delivery to the overlay stops the instant the
  // main window setIgnoreMouseEvents(false) captures the pointer, so
  // the overlay's pointerleave never fires and the DOM cursor would
  // otherwise freeze visible at the control-bar edge.
  const visible = computed(
    () => isDrawingMode.value && pointerInside.value && !interactiveHover.value && current.value !== null,
  )

  /** Compiled cursor cache keyed by tool id. Cleared when ui.cursors mutates. */
  const compileCache = new Map<string, CompiledCursor | null>()

  function findEntry(toolId: string): { moduleId: string; contribution: CursorContribution } | undefined {
    const entries = getSlotEntries<CursorContribution>('ui.cursors').value
    for (const e of entries) {
      if (e.contribution.id === toolId) return e
    }
    return undefined
  }

  async function resolveCursorFor(toolId: string): Promise<CompiledCursor> {
    if (compileCache.has(toolId)) {
      return compileCache.get(toolId) ?? DEFAULT_HOST_CURSOR
    }
    const entry = findEntry(toolId)
    if (!entry) {
      compileCache.set(toolId, null)
      return DEFAULT_HOST_CURSOR
    }
    try {
      const compiled = await compileCursor(entry.contribution.cursor, {
        pluginHostname: resolvePluginHostname(entry.moduleId),
      })
      compileCache.set(toolId, compiled)
      return compiled ?? DEFAULT_HOST_CURSOR
    } catch (err) {
      console.warn(`[useCustomCursor] compileCursor threw for "${toolId}":`, err)
      compileCache.set(toolId, null)
      return DEFAULT_HOST_CURSOR
    }
  }

  let resolveSequence = 0
  async function refreshCurrent(): Promise<void> {
    if (!activeToolId.value) {
      current.value = DEFAULT_HOST_CURSOR
      return
    }
    // Race guard: rapid tool switches could resolve out of order; the
    // late-finishing resolve must not overwrite a fresher one.
    const seq = ++resolveSequence
    const compiled = await resolveCursorFor(activeToolId.value)
    if (seq === resolveSequence) {
      current.value = compiled
    }
  }

  function updatePosition(e: PointerEvent): void {
    const el = cursorRef.value
    if (!el || !current.value) return
    const { x: hx, y: hy } = current.value.hotspot
    el.style.transform = `translate3d(${e.clientX - hx}px, ${e.clientY - hy}px, 0)`
  }

  function onPointerLeave(): void {
    pointerInside.value = false
  }

  function onPointerEnter(): void {
    pointerInside.value = true
  }

  function pickResolvedToolId(config: { tool: string; eraserMode?: 'brush' | 'stroke' }): string {
    return config.tool === 'eraser' && config.eraserMode === 'stroke'
      ? 'stroke-eraser'
      : config.tool
  }

  // Mirror the active stroke color into a CSS custom property on
  // document.documentElement so cursor SVGs that reference
  // `var(--openpen-cursor-accent, ...)` for accent fills follow the
  // user's current color pick. Gradients resolve to their `from`
  // endpoint — the cursor only has one accent slot.
  function applyAccentFromStrokeColor(color: unknown): void {
    let accent: string | null = null
    if (typeof color === 'string' && color.length > 0) {
      accent = color
    } else if (
      color &&
      typeof color === 'object' &&
      (color as { type?: unknown }).type === 'linear' &&
      typeof (color as { from?: unknown }).from === 'string'
    ) {
      accent = (color as { from: string }).from
    }
    if (accent !== null) {
      document.documentElement.style.setProperty('--openpen-cursor-accent', accent)
    }
  }

  const unsubs: Array<() => void> = []

  onMounted(() => {
    refreshCurrent()

    if (window.openPenApi) {
      const offDraw = window.openPenApi.onDrawingModeChanged((enabled) => {
        isDrawingMode.value = enabled
        // Reset hover state on every drawing toggle: the main window's
        // passthrough guard only relays on transitions, so a stale
        // interactiveHover from a previous session could otherwise
        // suppress the cursor through the next drawing session.
        if (!enabled) interactiveHover.value = false
      })
      unsubs.push(offDraw)

      const offHover = window.openPenApi.onInteractiveHoverChanged((hover) => {
        interactiveHover.value = hover
      })
      unsubs.push(offHover)

      const offTool = window.openPenApi.onToolConfigChanged((config) => {
        activeToolId.value = pickResolvedToolId(config)
      })
      unsubs.push(offTool)

      const offStyle = window.openPenApi.onStrokeStyleChanged((style) => {
        applyAccentFromStrokeColor(style.color)
      })
      unsubs.push(offStyle)
    }

    unsubs.push(
      eventBusOn('tool-changed', (payload) => {
        const p = payload as { tool?: string; eraserMode?: 'brush' | 'stroke' }
        if (typeof p?.tool !== 'string') return
        activeToolId.value = pickResolvedToolId({ tool: p.tool, eraserMode: p.eraserMode })
      }),
    )

    unsubs.push(
      eventBusOn('stroke-style-changed', (payload) => {
        if (payload && typeof payload === 'object' && 'color' in payload) {
          applyAccentFromStrokeColor((payload as { color?: unknown }).color)
        }
      }),
    )

    document.addEventListener('pointermove', updatePosition)
    document.documentElement.addEventListener('pointerleave', onPointerLeave)
    document.documentElement.addEventListener('pointerenter', onPointerEnter)
  })

  // Re-resolve when active tool changes.
  watch(activeToolId, () => {
    refreshCurrent()
  })

  // Re-resolve when ui.cursors slot population changes (e.g. plugins
  // loading after the composable mounted).
  watch(
    () => getSlotEntries<CursorContribution>('ui.cursors').value.length,
    () => {
      compileCache.clear()
      refreshCurrent()
    },
  )

  function cleanup(): void {
    document.removeEventListener('pointermove', updatePosition)
    document.documentElement.removeEventListener('pointerleave', onPointerLeave)
    document.documentElement.removeEventListener('pointerenter', onPointerEnter)
    for (const u of unsubs) u()
    unsubs.length = 0
    compileCache.clear()
  }

  onUnmounted(cleanup)

  return {
    cursorRef,
    visible,
    current: readonly(current),
    cleanup,
  }
}
