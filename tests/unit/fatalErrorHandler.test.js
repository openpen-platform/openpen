import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { handleUncaughtException } from '../../electron/fatal-error-handler.js';

describe('handleUncaughtException', () => {
  it('logs the error, restores the cursor, then exits non-zero in that order', () => {
    const calls = [];
    const err = new Error('boom');
    handleUncaughtException(err, {
      log: { error: (...args) => calls.push(['log', args[1]]) },
      showOsCursor: () => calls.push(['cursor']),
      exit: (code) => calls.push(['exit', code]),
    });
    expect(calls).toEqual([['log', err], ['cursor'], ['exit', 1]]);
  });

  it('still restores the cursor and exits when logging throws', () => {
    const showOsCursor = vi.fn();
    const exit = vi.fn();
    expect(() => handleUncaughtException(new Error('x'), {
      log: { error: () => { throw new Error('log failed'); } },
      showOsCursor,
      exit,
    })).toThrow('log failed');
    expect(showOsCursor).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('registers uncaughtException in exactly one place in the main process', () => {
    const dir = path.resolve(__dirname, '../../electron');
    const hits = fs.readdirSync(dir)
      .filter((f) => f.endsWith('.js'))
      .filter((f) => /process\.on\(\s*['"]uncaughtException['"]/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
    expect(hits).toEqual(['main.js']);
  });
});
