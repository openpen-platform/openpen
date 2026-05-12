import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useCollapseMode } from '../../src/composables/useCollapseMode';

describe('useCollapseMode', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initial state: isExpanded = false, isPinned = false', () => {
    const { isExpanded, isPinned } = useCollapseMode();
    expect(isExpanded.value).toBe(false);
    expect(isPinned.value).toBe(false);
  });

  it('expand() sets isExpanded to true', () => {
    const { isExpanded, expand } = useCollapseMode();
    expand();
    expect(isExpanded.value).toBe(true);
  });

  it('collapse() sets isExpanded to false', () => {
    const { isExpanded, expand, collapse } = useCollapseMode();
    expand();
    collapse();
    expect(isExpanded.value).toBe(false);
  });

  it('togglePin() flips isPinned', () => {
    const { isPinned, togglePin } = useCollapseMode();
    togglePin();
    expect(isPinned.value).toBe(true);
    togglePin();
    expect(isPinned.value).toBe(false);
  });

  it('startCollapseTimer() auto-collapses after 3 seconds', () => {
    const { isExpanded, expand, startCollapseTimer } = useCollapseMode();
    expand();
    startCollapseTimer();
    expect(isExpanded.value).toBe(true);
    vi.advanceTimersByTime(3000);
    expect(isExpanded.value).toBe(false);
  });

  it('startCollapseTimer() does nothing while pinned', () => {
    const { isExpanded, expand, togglePin, startCollapseTimer } = useCollapseMode();
    expand();
    togglePin();
    startCollapseTimer();
    vi.advanceTimersByTime(5000);
    expect(isExpanded.value).toBe(true);
  });

  it('cancelCollapseTimer() cancels pending collapse', () => {
    const { isExpanded, expand, startCollapseTimer, cancelCollapseTimer } = useCollapseMode();
    expand();
    startCollapseTimer();
    vi.advanceTimersByTime(1500);
    cancelCollapseTimer();
    vi.advanceTimersByTime(2000);
    expect(isExpanded.value).toBe(true);
  });

  it('startCollapseTimer() is a no-op when not expanded', () => {
    const { isExpanded, startCollapseTimer } = useCollapseMode();
    startCollapseTimer();
    vi.advanceTimersByTime(5000);
    expect(isExpanded.value).toBe(false);
  });

  it('cleanup() clears the collapse timer', () => {
    const { isExpanded, expand, startCollapseTimer, cleanup } = useCollapseMode();
    expand();
    startCollapseTimer();
    cleanup();
    vi.advanceTimersByTime(3000);
    expect(isExpanded.value).toBe(true);
  });

  it('expand/collapse does not affect isPinned', () => {
    const { isPinned, expand, collapse, togglePin } = useCollapseMode();
    togglePin();
    expand();
    collapse();
    expect(isPinned.value).toBe(true);
  });

  it('after unpinning, startCollapseTimer() collapses again', () => {
    const { isExpanded, expand, togglePin, startCollapseTimer } = useCollapseMode();
    expand();
    togglePin(); // pin
    togglePin(); // unpin
    startCollapseTimer();
    vi.advanceTimersByTime(3000);
    expect(isExpanded.value).toBe(false);
  });

  it('supports custom autoCollapseDelay', () => {
    const { isExpanded, expand, startCollapseTimer } = useCollapseMode({ autoCollapseDelay: 1000 });
    expand();
    startCollapseTimer();
    vi.advanceTimersByTime(999);
    expect(isExpanded.value).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isExpanded.value).toBe(false);
  });

  it('reads a reactive autoCollapseDelay Ref live on each timer start', async () => {
    const { ref } = await import('vue');
    const delayRef = ref(1000);
    const { isExpanded, expand, startCollapseTimer, collapse } = useCollapseMode({ autoCollapseDelay: delayRef });

    // First cycle: delay = 1000ms.
    expand();
    startCollapseTimer();
    vi.advanceTimersByTime(1000);
    expect(isExpanded.value).toBe(false);

    // Bump the ref; next timer must use the new value, not the old one.
    delayRef.value = 5000;
    expand();
    expect(isExpanded.value).toBe(true);
    startCollapseTimer();
    vi.advanceTimersByTime(1000);
    expect(isExpanded.value).toBe(true); // would have collapsed under old 1000ms
    vi.advanceTimersByTime(4000);
    expect(isExpanded.value).toBe(false);
    collapse();
  });
});
