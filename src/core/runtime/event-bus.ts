/**
 * Renderer-side domain event bus.
 *
 * The host fires (and modules subscribe to) name-spaced events like
 * `'stroke-added'`, `'tool-changed'`, `'theme-changed'`. The bus is
 * fire-and-forget — there's no replay buffer, no retention. Modules
 * that need to know "the current X" hold their own state or pull from
 * the contribution-store; events are for *changes*.
 *
 * Module-loader hooks `system.events` contributions into this bus so
 * modules don't import this file directly — they declare events in
 * their `contributes.events[]` array and the loader wires them up.
 *
 * Subscriber errors are caught and logged so one misbehaving module
 * cannot break sibling subscribers.
 */

type Handler = (payload: unknown) => void

const bus = new Map<string, Set<Handler>>()

export function emit(event: string, payload: unknown = undefined): void {
  const handlers = bus.get(event)
  if (!handlers) return
  for (const h of handlers) {
    try {
      h(payload)
    } catch (err) {
      console.error(`[event-bus] Subscriber for "${event}" threw:`, err)
    }
  }
}

/**
 * Subscribe to an event. Returns a function that removes this exact
 * subscription — call it from `onUnmounted` (Vue) or any cleanup hook.
 */
export function on(event: string, handler: Handler): () => void {
  let set = bus.get(event)
  if (!set) {
    set = new Set()
    bus.set(event, set)
  }
  set.add(handler)
  return () => off(event, handler)
}

export function off(event: string, handler: Handler): void {
  const set = bus.get(event)
  if (!set) return
  set.delete(handler)
  if (set.size === 0) bus.delete(event)
}

/** Test-only: drop every subscriber across every event. */
export function clearEventBus(): void {
  bus.clear()
}
