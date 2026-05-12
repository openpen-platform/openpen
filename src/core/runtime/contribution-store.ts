/**
 * Reactive store for module slot contributions.
 *
 * Modules contribute to one or more slots via `OpenPenModule.contributes`.
 * The module-loader walks each module's contributions, validates them
 * against the slot catalogue, then registers each item here. UI code
 * (composables / components) reads contributions back via `getSlotEntries`.
 *
 * No validation of contribution shape happens here — that's done upstream
 * in `module-validator`. This store just defends against unknown slot ids
 * and tracks per-module ownership so a module can be cleanly unregistered.
 */
import { ref, readonly, type Ref } from 'vue'
import { isKnownSlot } from '@openpen/module-api'

export interface ContributionEntry<T = unknown> {
  /** Module that registered this contribution. */
  moduleId: string
  /** Slot-specific contribution payload (typed by consumer). */
  contribution: T
}

const slotStore = new Map<string, Ref<ContributionEntry[]>>()

function ensureSlotKnown(slotId: string): void {
  if (!isKnownSlot(slotId)) {
    throw new Error(
      `[contribution-store] Unknown slot id: "${slotId}". ` +
        `Slot ids must be declared in @openpen/module-api ALL_SLOTS.`
    )
  }
}

function getOrCreateSlotRef(slotId: string): Ref<ContributionEntry[]> {
  let r = slotStore.get(slotId)
  if (!r) {
    r = ref<ContributionEntry[]>([])
    slotStore.set(slotId, r)
  }
  return r
}

/**
 * Register a single contribution under a slot. Append-only; later
 * contributions don't shadow earlier ones — composables decide how to
 * merge.
 */
export function registerContribution<T = unknown>(
  slotId: string,
  moduleId: string,
  contribution: T
): void {
  ensureSlotKnown(slotId)
  const r = getOrCreateSlotRef(slotId)
  r.value = [...r.value, { moduleId, contribution }]
}

/**
 * Reactive view of all entries currently registered for a slot.
 * Returned ref is `readonly` to prevent accidental external mutation;
 * use `registerContribution` / `unregisterModule` to mutate.
 */
export function getSlotEntries<T = unknown>(
  slotId: string
): Readonly<Ref<readonly ContributionEntry<T>[]>> {
  ensureSlotKnown(slotId)
  return readonly(
    getOrCreateSlotRef(slotId)
  ) as Readonly<Ref<readonly ContributionEntry<T>[]>>
}

/**
 * Remove every entry contributed by the given module across all slots.
 * No-op when the module has no contributions. Used for module
 * module teardown and for test isolation.
 */
export function unregisterModule(moduleId: string): void {
  for (const r of slotStore.values()) {
    const filtered = r.value.filter((e) => e.moduleId !== moduleId)
    if (filtered.length !== r.value.length) {
      r.value = filtered
    }
  }
}

/** Test-only: drop every entry across every slot. */
export function resetContributionStore(): void {
  for (const r of slotStore.values()) {
    r.value = []
  }
}
