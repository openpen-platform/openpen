import type { Directive } from 'vue'

const clickOutsideHandlerMap = new WeakMap<HTMLElement, (event: MouseEvent) => void>()
type ClickOutsideEl = HTMLElement

/**
 * v-click-outside directive — capture-phase mousedown listener that calls
 * `binding.value()` when a mousedown lands outside the bound element.
 */
export const clickOutside: Directive<ClickOutsideEl, (e: MouseEvent) => void> = {
  beforeMount(el, binding) {
    const handler = (event: MouseEvent) => {
      if (!el.contains(event.target as Node)) binding.value(event)
    }
    clickOutsideHandlerMap.set(el, handler)
    document.addEventListener('mousedown', handler, true)
  },
  unmounted(el) {
    const handler = clickOutsideHandlerMap.get(el)
    if (!handler) return
    document.removeEventListener('mousedown', handler, true)
    clickOutsideHandlerMap.delete(el)
  },
}
