/**
 * holdToDraw.test.js: the hold-to-draw key, from key samples to start/end,
 * the settings-row recording, and the tool used while the key is held.
 */
import { describe, it, expect, vi } from 'vitest';
import { createHoldToDrawController } from '../../electron/hold-to-draw-controller.js';
import { holdToDrawToolId } from '../../shared/hold-to-draw.js';

/** Drive a controller with a scripted list of samples. */
function setup({ platform = 'win32', stored = null, drawing = false } = {}) {
  const state = { keys: new Set(), otherKey: false, stored, drawing };
  const events = [];
  const ctl = createHoldToDrawController({
    platform,
    sample: () => ({ keys: new Set(state.keys), otherKey: state.otherKey }),
    getStoredKey: () => state.stored,
    isDrawingMode: () => state.drawing,
    isSuspended: () => false,
    onStart: () => events.push('start'),
    onEnd: () => events.push('end'),
  });
  /** Set the held keys (and other-key activity) for one tick, then tick. */
  const press = (keys, otherKey = false) => {
    state.keys = new Set(keys);
    state.otherKey = otherKey;
    ctl.tick();
  };
  return { ctl, state, events, press };
}

describe('hold-to-draw on Windows (Right Ctrl by default)', () => {
  it('holding Left Ctrl does not start drawing', () => {
    const { events, press } = setup();
    press(['ControlLeft']);
    press(['ControlLeft']);
    press([]);
    expect(events).toEqual([]);
  });

  it('Ctrl+C does not start drawing, with either Ctrl', () => {
    const { events, press } = setup();
    // Left Ctrl + C
    press(['ControlLeft']);
    press(['ControlLeft'], true);
    press([]);
    // Right Ctrl pressed while C is already down: never alone, never starts
    press([], true);
    press(['ControlRight'], true);
    press(['ControlRight']);
    press([]);
    expect(events).toEqual([]);
  });
});

describe('hold-to-draw while drawing mode is on', () => {
  it('holding the key in drawing mode does nothing', () => {
    const { events, press } = setup({ drawing: true });
    press(['ControlRight']);
    press(['ControlRight']);
    press([]);
    expect(events).toEqual([]);
  });

  it('leaving drawing mode with the key still held does not start drawing', () => {
    const { events, press, state } = setup({ drawing: true });
    press(['ControlRight']);
    state.drawing = false;
    press(['ControlRight']);
    press([]);
    expect(events).toEqual([]);
    // A fresh press afterwards works.
    press(['ControlRight']);
    expect(events).toEqual(['start']);
  });
});

describe('changing the hold key in settings', () => {
  it('the new key starts drawing and the old one no longer does', () => {
    const { events, press, state } = setup({ platform: 'darwin' });
    press(['Fn']);
    press([]);
    expect(events).toEqual(['start', 'end']);
    state.stored = 'AltRight';
    press(['Fn']);
    press([]);
    press(['AltRight']);
    press([]);
    expect(events).toEqual(['start', 'end', 'start', 'end']);
  });

  it('recording takes one modifier held alone and skips combos', async () => {
    const { ctl, press } = setup({ platform: 'darwin' });
    const recording = ctl.startRecording();
    // Shift+Alt is a combo: skipped, recording keeps waiting.
    press(['ShiftLeft']);
    press(['ShiftLeft', 'AltLeft']);
    press([]);
    // Ctrl+C: skipped.
    press(['ControlLeft']);
    press(['ControlLeft'], true);
    press([]);
    // Right Option alone: recorded on release.
    press(['AltRight']);
    const pending = vi.fn();
    void recording.then(pending);
    await Promise.resolve();
    expect(pending).not.toHaveBeenCalled();
    press([]);
    await expect(recording).resolves.toBe('AltRight');
  });
});

describe('tool used while the key is held', () => {
  it('a typing tool is replaced by the pen', () => {
    expect(holdToDrawToolId('text')).toBe('freehand');
  });

  it('other tools are kept', () => {
    expect(holdToDrawToolId('highlighter')).toBe('highlighter');
    expect(holdToDrawToolId('shape')).toBe('shape');
  });
});

describe('native key samplers (review regressions)', () => {
  it('macOS: a letter held before the modifier counts as another key', async () => {
    vi.doMock('electron-log/main.js', () => ({ default: { warn: vi.fn() } }));
    const { createMacSampler } = await import('../../electron/hold-key-native.js');
    const down = new Set([0]); // "A" (key code 0), already held
    let flags = 0;
    const sample = createMacSampler({
      isDown: (code) => down.has(code),
      flags: () => flags,
      secondsSinceKeyDown: () => 5, // no new keyDown since
    });
    expect(sample().otherKey).toBe(false); // letter alone: nothing to check
    flags = 0x80040; // Right Option
    expect(sample()).toEqual({ keys: new Set(['AltRight']), otherKey: true });
  });

  it('macOS: Right Option is read as Right Option, though per-key state says Left', async () => {
    vi.doMock('electron-log/main.js', () => ({ default: { warn: vi.fn() } }));
    const { createMacSampler } = await import('../../electron/hold-key-native.js');
    // What the system reported for a Right Option press: key code 58 (left)
    // down, flags with the right-Alt device bit.
    const sample = createMacSampler({
      isDown: (code) => code === 58,
      flags: () => 0x80040n,
      secondsSinceKeyDown: () => 5,
    });
    expect(sample()).toEqual({ keys: new Set(['AltRight']), otherKey: false });
  });

  it('Windows: AltGr reads as Right Alt alone, a real Left Ctrl + Right Alt does not', async () => {
    vi.doMock('electron-log/main.js', () => ({ default: { warn: vi.fn() } }));
    const { createWinSampler } = await import('../../electron/hold-key-native.js');
    const down = new Set();
    const sample = createWinSampler((vk) => down.has(vk));
    // AltGr: both arrive in the same instant.
    down.add(0xa2); down.add(0xa5);
    expect([...sample().keys]).toEqual(['AltRight']);
    down.clear(); sample();
    // Real combo: Left Ctrl first, then Right Alt.
    down.add(0xa2); sample();
    down.add(0xa5);
    expect(sample().keys).toEqual(new Set(['ControlLeft', 'AltRight']));
  });
});
