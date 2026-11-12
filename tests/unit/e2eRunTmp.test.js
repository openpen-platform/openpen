// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enterRunTmpRoot, RUN_TMP_PREFIX } from '../e2e/run-tmp.js';

const ENV_KEYS = ['TMPDIR', 'TEMP', 'TMP'];

describe('e2e run-scoped temp root', () => {
  const cleanups = [];
  afterEach(() => {
    while (cleanups.length) cleanups.pop()();
  });

  it('collects directories created through os.tmpdir() and removes them on dispose', () => {
    const before = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    const run = enterRunTmpRoot();
    cleanups.push(() => run.dispose());

    expect(path.basename(run.root).startsWith(RUN_TMP_PREFIX)).toBe(true);
    // The same call launch.js and the specs use for their userData dirs.
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-'));
    fs.writeFileSync(path.join(userData, 'config.json'), '{}');
    expect(path.dirname(userData)).toBe(run.root);

    run.dispose();

    expect(fs.existsSync(run.root)).toBe(false);
    expect(Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))).toEqual(before);
  });

  it('removes only its own root and leaves other openpen-e2e-* directories alone', () => {
    const foreign = fs.mkdtempSync(path.join(os.tmpdir(), 'openpen-e2e-'));
    cleanups.push(() => fs.rmSync(foreign, { recursive: true, force: true }));
    const run = enterRunTmpRoot();
    cleanups.push(() => run.dispose());

    run.dispose();
    run.dispose(); // a failing run may dispose twice; must not throw

    expect(fs.existsSync(foreign)).toBe(true);
  });

  it('only warns when the root cannot be removed, so a passing run stays green', () => {
    const run = enterRunTmpRoot();
    cleanups.push(() => fs.rmSync(run.root, { recursive: true, force: true }));
    const rmSpy = vi.spyOn(fs, 'rmSync').mockImplementation(() => {
      throw new Error('EBUSY: resource busy or locked');
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    cleanups.push(() => {
      rmSpy.mockRestore();
      warnSpy.mockRestore();
    });

    expect(() => run.dispose()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(run.root));
  });
});
