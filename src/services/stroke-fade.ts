/**
 * Timing state for strokes that fade out on their own. Pure logic with no DOM
 * access: the canvas engine owns the timers and the drawing.
 *
 * A fading stroke stays fully visible for its hold time, then loses opacity
 * linearly over FADE_DURATION_MS and is reported as expired.
 */
export const FADE_DURATION_MS = 1000

export class StrokeFader {
  /** Strokes drawn while fading was on, with the hold time fixed at draw time. */
  private hold = new Map<string, number>()
  /** Strokes whose countdown is running, with the time it started. */
  private startedAt = new Map<string, number>()

  /** Register a new stroke and start its countdown. */
  track(id: string, holdMs: number, now: number): void {
    this.hold.set(id, holdMs)
    this.startedAt.set(id, now)
  }

  /** Hold times of every registered stroke, for saving alongside a drawing snapshot. */
  holds(): Record<string, number> {
    return Object.fromEntries(this.hold)
  }

  /** Re-register saved hold times; countdowns start in the next `reconcile`. */
  restore(holds: Record<string, number>): void {
    for (const [id, holdMs] of Object.entries(holds)) {
      if (Number.isFinite(holdMs) && holdMs > 0) this.hold.set(id, holdMs)
    }
  }

  forget(id: string): void {
    this.hold.delete(id)
    this.startedAt.delete(id)
  }

  /** Stop every countdown and drop all registrations. */
  forgetAll(): void {
    this.hold.clear()
    this.startedAt.clear()
  }

  /**
   * Align countdowns with the strokes now on the canvas: a registered stroke
   * that left the canvas stops counting; one that came back restarts its full
   * hold time.
   */
  reconcile(presentIds: Set<string>, now: number): void {
    for (const id of [...this.startedAt.keys()]) {
      if (!presentIds.has(id)) this.startedAt.delete(id)
    }
    for (const id of this.hold.keys()) {
      if (presentIds.has(id) && !this.startedAt.has(id)) this.startedAt.set(id, now)
    }
  }

  /** Opacity multiplier in [0, 1]; 1 for strokes that are not counting down. */
  alpha(id: string, now: number): number {
    const start = this.startedAt.get(id)
    if (start === undefined) return 1
    const elapsed = now - start - (this.hold.get(id) ?? 0)
    if (elapsed <= 0) return 1
    return Math.max(0, 1 - elapsed / FADE_DURATION_MS)
  }

  /** Ids whose fade has finished. */
  expired(now: number): string[] {
    const out: string[] = []
    for (const id of this.startedAt.keys()) {
      if (this.alpha(id, now) <= 0) out.push(id)
    }
    return out
  }

  /** True while at least one stroke is partly faded. */
  isFading(now: number): boolean {
    for (const id of this.startedAt.keys()) {
      if (this.alpha(id, now) < 1) return true
    }
    return false
  }

  /** Milliseconds until something changes visually; null when nothing is counting down. */
  nextChangeIn(now: number): number | null {
    let next: number | null = null
    for (const [id, start] of this.startedAt) {
      const wait = Math.max(0, start + (this.hold.get(id) ?? 0) - now)
      if (next === null || wait < next) next = wait
    }
    return next
  }
}
