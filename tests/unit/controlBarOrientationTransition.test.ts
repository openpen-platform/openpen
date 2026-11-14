import { describe, it, expect, vi } from 'vitest';
import {
  createBarLayoutSwapper,
  isOrientationFlip,
  ORIENTATION_TRANSITION_CLASS,
  type OrientationTransitionDocument,
} from '../../src/components/control-bar-orientation-transition';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Document stub: records <html> classes and lets each test settle transitions by hand. */
function makeDoc(withViewTransitions = true) {
  const classes = new Set<string>();
  const finishes: ReturnType<typeof deferred>[] = [];
  const updates: Array<() => Promise<void> | void> = [];
  const doc: OrientationTransitionDocument = {
    documentElement: {
      classList: { add: (t) => { classes.add(t); }, remove: (t) => { classes.delete(t); } },
    },
  };
  if (withViewTransitions) {
    doc.startViewTransition = (update) => {
      updates.push(update);
      void update();
      const d = deferred();
      finishes.push(d);
      return { finished: d.promise };
    };
  }
  return { doc, classes, finishes, updates };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('isOrientationFlip', () => {
  it('is true between the horizontal bar and any vertical bar', () => {
    expect(isOrientationFlip('horizontal', 'vbar-left')).toBe(true);
    expect(isOrientationFlip('vbar-right', 'horizontal')).toBe(true);
    expect(isOrientationFlip('horizontal', 'vbar-free')).toBe(true);
  });

  it('is false when the orientation stays the same', () => {
    expect(isOrientationFlip('vbar-left', 'vbar-right')).toBe(false);
    expect(isOrientationFlip('horizontal', 'horizontal')).toBe(false);
  });
});

describe('createBarLayoutSwapper', () => {
  it('runs an orientation flip on an expanded bar inside a view transition', async () => {
    const { doc, classes, finishes, updates } = makeDoc();
    const apply = vi.fn();
    createBarLayoutSwapper(doc)({ prev: 'horizontal', next: 'vbar-left', expanded: true, apply });

    expect(updates).toHaveLength(1);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(classes.has(ORIENTATION_TRANSITION_CLASS)).toBe(true);

    finishes[0].resolve();
    await flush();
    expect(classes.has(ORIENTATION_TRANSITION_CLASS)).toBe(false);
  });

  it('applies at once when the bar is collapsed', () => {
    const { doc, classes, updates } = makeDoc();
    const apply = vi.fn();
    createBarLayoutSwapper(doc)({ prev: 'horizontal', next: 'vbar-left', expanded: false, apply });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(0);
    expect(classes.size).toBe(0);
  });

  it('applies at once when the orientation does not change', () => {
    const { doc, classes, updates } = makeDoc();
    const apply = vi.fn();
    createBarLayoutSwapper(doc)({ prev: 'vbar-left', next: 'vbar-right', expanded: true, apply });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(updates).toHaveLength(0);
    expect(classes.size).toBe(0);
  });

  it('applies at once when view transitions are unavailable', () => {
    const { doc, classes } = makeDoc(false);
    const apply = vi.fn();
    createBarLayoutSwapper(doc)({ prev: 'horizontal', next: 'vbar-left', expanded: true, apply });

    expect(apply).toHaveBeenCalledTimes(1);
    expect(classes.size).toBe(0);
  });

  it('keeps the class while a later swap is still running', async () => {
    const { doc, classes, finishes } = makeDoc();
    const swap = createBarLayoutSwapper(doc);
    swap({ prev: 'horizontal', next: 'vbar-left', expanded: true, apply: vi.fn() });
    swap({ prev: 'vbar-left', next: 'horizontal', expanded: true, apply: vi.fn() });

    finishes[0].resolve();
    await flush();
    expect(classes.has(ORIENTATION_TRANSITION_CLASS)).toBe(true);

    finishes[1].resolve();
    await flush();
    expect(classes.has(ORIENTATION_TRANSITION_CLASS)).toBe(false);
  });

  it('removes the class when the transition is aborted', async () => {
    const { doc, classes, finishes } = makeDoc();
    createBarLayoutSwapper(doc)({ prev: 'horizontal', next: 'vbar-right', expanded: true, apply: vi.fn() });

    finishes[0].reject(new DOMException('Skipped', 'AbortError'));
    await flush();
    expect(classes.has(ORIENTATION_TRANSITION_CLASS)).toBe(false);
  });
});
