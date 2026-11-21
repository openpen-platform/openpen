// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enterRunTmpRoot, RUN_MARKER_FILE, RUN_TMP_PREFIX, sweepStaleRunRoots } from '../e2e/run-tmp.js';

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

describe('sweepStaleRunRoots (roots left by an aborted run)', () => {
  let tmpDir;
  const mk = (name, marker) => {
    const dir = path.join(tmpDir, name);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'userdata.txt'), 'x');
    if (marker) fs.writeFileSync(path.join(dir, RUN_MARKER_FILE), JSON.stringify(marker));
    return dir;
  };
  const ours = (dir, pid) => ({ signature: 'openpen-e2e-run-root', pid, root: dir });
  const setup = () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-fixture-'));
  };
  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it('removes a marked root whose owner is dead', () => {
    setup();
    const dir = path.join(tmpDir, `${RUN_TMP_PREFIX}dead`);
    mk(path.basename(dir), ours(dir, 111));
    const res = sweepStaleRunRoots({ tmpDir, isPidAlive: () => false });
    expect(res.removed).toEqual([dir]);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it('keeps a root whose owner is still alive (concurrent run)', () => {
    setup();
    const dir = path.join(tmpDir, `${RUN_TMP_PREFIX}live`);
    mk(path.basename(dir), ours(dir, 222));
    sweepStaleRunRoots({ tmpDir, isPidAlive: () => true });
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('never touches folders it cannot prove are its own', () => {
    setup();
    const noMarker = mk(`${RUN_TMP_PREFIX}nomarker`);
    const badSig = mk(`${RUN_TMP_PREFIX}badsig`, { signature: 'other', pid: 1, root: path.join(tmpDir, `${RUN_TMP_PREFIX}badsig`) });
    const copied = mk(`${RUN_TMP_PREFIX}copied`, ours(path.join(tmpDir, 'elsewhere'), 333));
    const otherPrefix = mk('openpen-e2e-userdata', ours(path.join(tmpDir, 'openpen-e2e-userdata'), 444));
    const foreign = mk('someone-elses-folder', ours(path.join(tmpDir, 'someone-elses-folder'), 555));
    const res = sweepStaleRunRoots({ tmpDir, isPidAlive: () => false });
    expect(res.removed).toEqual([]);
    for (const d of [noMarker, badSig, copied, otherPrefix, foreign]) expect(fs.existsSync(d)).toBe(true);
  });

  it('removes only the dead root when live and foreign ones sit beside it', () => {
    setup();
    const dead = path.join(tmpDir, `${RUN_TMP_PREFIX}a`);
    const live = path.join(tmpDir, `${RUN_TMP_PREFIX}b`);
    mk(path.basename(dead), ours(dead, 1));
    mk(path.basename(live), ours(live, 2));
    const foreign = mk('keep-me');
    sweepStaleRunRoots({ tmpDir, isPidAlive: (pid) => pid === 2 });
    expect(fs.existsSync(dead)).toBe(false);
    expect(fs.existsSync(live)).toBe(true);
    expect(fs.existsSync(foreign)).toBe(true);
  });

  it('a root created by enterRunTmpRoot is swept after its owner dies, not while it lives', () => {
    setup();
    const prev = { TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, TMP: process.env.TMP };
    for (const k of Object.keys(prev)) process.env[k] = tmpDir;
    const run = enterRunTmpRoot();
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    expect(sweepStaleRunRoots({ tmpDir }).removed).toEqual([]); // this process is alive
    expect(fs.existsSync(run.root)).toBe(true);
    sweepStaleRunRoots({ tmpDir, isPidAlive: () => false });
    expect(fs.existsSync(run.root)).toBe(false);
  });

  it('does not throw when the temp dir is unreadable', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => sweepStaleRunRoots({ tmpDir: path.join(os.tmpdir(), 'does-not-exist-xyz') })).not.toThrow();
    warn.mockRestore();
  });
});

describe('removeRunRoot ordering', () => {
  it('keeps the marker when a child cannot be removed, so a later sweep can retry', () => {
    const box = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-fixture-'));
    const dir = fs.mkdtempSync(path.join(box, RUN_TMP_PREFIX));
    fs.writeFileSync(path.join(dir, RUN_MARKER_FILE), JSON.stringify({ signature: 'openpen-e2e-run-root', pid: 1, root: dir }));
    fs.mkdirSync(path.join(dir, 'openpen-e2e-userdata'));
    const real = fs.rmSync;
    const spy = vi.spyOn(fs, 'rmSync').mockImplementation((p, o) => {
      if (String(p).endsWith('openpen-e2e-userdata')) throw new Error('EBUSY');
      return real(p, o);
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    sweepStaleRunRoots({ tmpDir: box, isPidAlive: (pid) => pid !== 1 });
    spy.mockRestore();
    warn.mockRestore();
    expect(fs.existsSync(path.join(dir, RUN_MARKER_FILE))).toBe(true);
    sweepStaleRunRoots({ tmpDir: box, isPidAlive: () => false });
    expect(fs.existsSync(dir)).toBe(false);
    fs.rmSync(box, { recursive: true, force: true });
  });
});
