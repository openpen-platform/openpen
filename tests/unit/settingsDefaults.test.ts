import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/settings-defaults.js';

describe('DEFAULT_SETTINGS.confirmBeforeClearCanvas', () => {
  it('defaults to true', () => {
    expect(DEFAULT_SETTINGS.confirmBeforeClearCanvas).toBe(true);
  });
});

describe('DEFAULT_SETTINGS.disabledModules', () => {
  it('defaults to an empty array', () => {
    expect(DEFAULT_SETTINGS.disabledModules).toEqual([]);
  });

  it('is frozen (Object.isFrozen on the outer object)', () => {
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
  });
});
