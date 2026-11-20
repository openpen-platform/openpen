/**
 * Node 25+ ships its own `localStorage` global, which is undefined unless
 * Node runs with --localstorage-file. Vitest's jsdom environment skips any
 * window key the Node global already defines, so without the setup shim
 * renderer code reading `localStorage` crashes only on newer Node.
 */
import { describe, it, expect } from 'vitest';

describe('unit test environment web storage', () => {
  it('exposes jsdom localStorage and sessionStorage as usable Storage objects', () => {
    for (const storage of [globalThis.localStorage, globalThis.sessionStorage]) {
      expect(storage).toBeInstanceOf(window.Storage);
      storage.setItem('openpen.test-env', 'ok');
      expect(storage.getItem('openpen.test-env')).toBe('ok');
      storage.removeItem('openpen.test-env');
    }
  });
});
