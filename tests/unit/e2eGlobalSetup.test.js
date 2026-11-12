// @vitest-environment node
import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('vite', () => ({
  createServer: async () => ({
    listen: async () => {},
    resolvedUrls: { local: ['http://localhost:1/'] },
    close: async () => {
      throw new Error('close failed');
    },
  }),
}));
vi.mock('../e2e/launch.js', () => ({ assertElectronBinary: () => {} }));

const ENV_KEYS = [
  'TMPDIR',
  'TEMP',
  'TMP',
  'HOME',
  'USERPROFILE',
  'OPENPEN_E2E_HOME',
  'OPENPEN_E2E_VITE_URL',
];

describe('e2e globalSetup teardown', () => {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
    vi.restoreAllMocks();
  });

  it('warns instead of throwing when Vite fails to close, and still removes the run temp root', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { default: globalSetup } = await import('../e2e/global-setup.js');

    const teardown = await globalSetup();
    const sandboxHome = process.env.OPENPEN_E2E_HOME;
    expect(fs.existsSync(sandboxHome)).toBe(true);

    await expect(teardown()).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('close failed'));
    expect(fs.existsSync(sandboxHome)).toBe(false);
  });
});
