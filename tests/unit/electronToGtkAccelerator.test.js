/**
 * Unit tests for the Electron→GTK accelerator conversion used to install GNOME
 * custom keybindings. Regression guard for the toggleBar default
 * (CommandOrControl+Shift+\): Electron / HotkeyInput emit the literal '\', but
 * GTK needs the keysym NAME 'backslash' or gtk_accelerator_parse rejects it and
 * the desktop keybinding silently never fires.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('electron', () => ({ app: { isPackaged: false } }));

const { electronToGtkAccelerator } = await import('../../electron/linux-shortcut.js');

describe('electronToGtkAccelerator', () => {
  it('converts the toggleBar default (literal backslash) to the GTK keysym name', () => {
    expect(electronToGtkAccelerator('CommandOrControl+Shift+\\')).toBe('<Primary><Shift>backslash');
  });

  it('converts a plain letter accelerator (toggleDrawingMode default)', () => {
    expect(electronToGtkAccelerator('CommandOrControl+Shift+A')).toBe('<Primary><Shift>a');
  });

  it('maps other ASCII punctuation to keysym names', () => {
    expect(electronToGtkAccelerator('CommandOrControl+/')).toBe('<Primary>slash');
    expect(electronToGtkAccelerator('CommandOrControl+Shift+.')).toBe('<Primary><Shift>period');
  });

  it('orders modifiers canonically regardless of input order', () => {
    expect(electronToGtkAccelerator('Shift+CommandOrControl+A')).toBe('<Primary><Shift>a');
  });

  it('returns null for an empty / modifier-only accelerator', () => {
    expect(electronToGtkAccelerator('')).toBeNull();
    expect(electronToGtkAccelerator('CommandOrControl+Shift')).toBeNull();
  });
});
