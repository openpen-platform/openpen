/**
 * Unit tests for the pure Wayland desired-state derivation. This is the logic
 * core of the single-coordinator window model — the truth table that
 * reconcileLinuxWindows() applies. The most important invariant: `barHidden`
 * (toggleBar shortcut / tray hide) must NEVER hide the drawing overlay.
 */

import { describe, it, expect } from 'vitest';
import { deriveLinuxWindowState } from '../../electron/linux-window-state.js';

const ACTIVE = 1;
const OTHER = 2;

/** Build an input with the active display and sensible defaults, overridable. */
const input = (over = {}) => ({
  displayId: ACTIVE,
  activeId: ACTIVE,
  drawing: false,
  settingsOpen: false,
  barHidden: false,
  ...over,
});

describe('deriveLinuxWindowState', () => {
  it('idle on the active display: bar shown, no overlay', () => {
    expect(deriveLinuxWindowState(input())).toEqual({ showBar: true, wantOverlay: false });
  });

  it('drawing on the active display: bar hidden, overlay wanted', () => {
    expect(deriveLinuxWindowState(input({ drawing: true })))
      .toEqual({ showBar: false, wantOverlay: true });
  });

  it('barHidden hides the bar while idle', () => {
    expect(deriveLinuxWindowState(input({ barHidden: true })))
      .toEqual({ showBar: false, wantOverlay: false });
  });

  it('barHidden NEVER hides the overlay (drawing surface stays up mid-session)', () => {
    expect(deriveLinuxWindowState(input({ drawing: true, barHidden: true })))
      .toEqual({ showBar: false, wantOverlay: true });
  });

  it('settingsOpen hides both the bar and the overlay', () => {
    expect(deriveLinuxWindowState(input({ settingsOpen: true })))
      .toEqual({ showBar: false, wantOverlay: false });
    expect(deriveLinuxWindowState(input({ drawing: true, settingsOpen: true })))
      .toEqual({ showBar: false, wantOverlay: false });
  });

  it('settingsOpen takes precedence over barHidden (both off the bar, overlay off)', () => {
    expect(deriveLinuxWindowState(input({ drawing: true, settingsOpen: true, barHidden: true })))
      .toEqual({ showBar: false, wantOverlay: false });
  });

  it('a non-active display shows nothing, whatever the mode', () => {
    for (const over of [{}, { drawing: true }, { barHidden: true }, { settingsOpen: true }]) {
      expect(deriveLinuxWindowState(input({ ...over, displayId: OTHER })))
        .toEqual({ showBar: false, wantOverlay: false });
    }
  });
});
