import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { rotateLogFiles, archivePath, MAX_LOG_FILES } from '../../electron/log-rotation.js';

function fakeFs(initial) {
  const files = new Map(initial.map((p) => [p, p]));
  return {
    files,
    existsSync: (p) => files.has(p),
    renameSync: (from, to) => { files.set(to, files.get(from)); files.delete(from); },
    rmSync: (p) => { files.delete(p); },
  };
}

describe('rotateLogFiles', () => {
  const active = path.join('logs', 'main.log');

  it('keeps at most 5 files, the active one included, dropping the oldest', () => {
    const full = [active, ...[0, 1, 2, 3].map((i) => archivePath(active, i))];
    const fsImpl = fakeFs(full);
    rotateLogFiles(active, MAX_LOG_FILES, fsImpl);
    // The active file has been moved aside; electron-log then recreates it.
    expect(fsImpl.files.has(active)).toBe(false);
    expect(fsImpl.files.size).toBe(MAX_LOG_FILES - 1);
    expect(fsImpl.files.get(archivePath(active, 0))).toBe(active);
    expect(fsImpl.files.get(archivePath(active, 3))).toBe(archivePath(active, 2));
  });

  it('uses the default electron-log archive name for the newest archive', () => {
    expect(archivePath(active, 0)).toBe(path.join('logs', 'main.old.log'));
  });
});
