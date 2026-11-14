import type { BarLayoutClass } from '../composables/useDragSnap';

/** Class on <html> while an orientation swap runs as a view transition. */
export const ORIENTATION_TRANSITION_CLASS = 'cb-orient-vt';

interface ViewTransitionLike {
  finished: Promise<unknown>;
}

/** The subset of Document the swapper needs; lets tests pass a stub. */
export interface OrientationTransitionDocument {
  documentElement: { classList: { add(token: string): void; remove(token: string): void } };
  startViewTransition?: (update: () => Promise<void> | void) => ViewTransitionLike;
}

export interface BarLayoutSwap {
  prev: BarLayoutClass;
  next: BarLayoutClass;
  /** Only an expanded bar is visible, so only an expanded bar animates. */
  expanded: boolean;
  /** Writes the new layout to the rendered state and waits for the DOM update. */
  apply: () => Promise<void> | void;
}

/** True when the swap moves between the horizontal bar and any vertical bar. */
export function isOrientationFlip(prev: BarLayoutClass, next: BarLayoutClass): boolean {
  return (prev === 'horizontal') !== (next === 'horizontal');
}

/**
 * Returns a function that applies a bar layout change. An orientation flip on
 * an expanded bar runs inside a same-document view transition so the old bar
 * fades out before the new one fades in; every other change applies at once.
 * The <html> class stays on until the most recent transition finishes, so a
 * swap that interrupts an earlier one keeps its styling.
 */
export function createBarLayoutSwapper(doc: OrientationTransitionDocument): (swap: BarLayoutSwap) => void {
  let latest = 0;
  return ({ prev, next, expanded, apply }) => {
    if (!expanded || !isOrientationFlip(prev, next) || typeof doc.startViewTransition !== 'function') {
      void apply();
      return;
    }
    const id = ++latest;
    doc.documentElement.classList.add(ORIENTATION_TRANSITION_CLASS);
    const transition = doc.startViewTransition(apply);
    void transition.finished
      .catch(() => undefined)
      .then(() => {
        if (id === latest) doc.documentElement.classList.remove(ORIENTATION_TRANSITION_CLASS);
      });
  };
}
