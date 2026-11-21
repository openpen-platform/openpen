import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findInternalRefs } from '../../scripts/check-internal-refs.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../scripts/check-internal-refs.mjs');

// Fixture strings are assembled at runtime so this file never contains a
// literal internal-ticket token and passes its own scan.
const longForm = (n) => 'TASK' + '-' + n;
const shortForm = (n) => 'T' + n;

describe('findInternalRefs', () => {
  it('flags the long ticket form with its column', () => {
    const hits = findInternalRefs(`// see ${longForm(42)} for context`);
    expect(hits).toEqual([{ line: 1, column: 8, match: longForm(42) }]);
  });

  it('flags the T + three digits shorthand', () => {
    expect(findInternalRefs(`fix(${shortForm(123)}): thing`).map((h) => h.match)).toEqual([shortForm(123)]);
  });

  it('reports the right line number across multiple lines', () => {
    const hits = findInternalRefs(`a\nb\n  ${shortForm(987)}\n${longForm(5)}`);
    expect(hits.map((h) => [h.line, h.match])).toEqual([
      [3, shortForm(987)],
      [4, longForm(5)],
    ]);
  });

  it('does not flag ordinary text that only resembles the formats', () => {
    const clean = [
      'const TASKS = 1',
      'MYTASK' + '-12 is not ours',
      'TASK' + '-',
      'TASK' + '-abc',
      'T' + '12 only two digits',
      'T' + '1234 four digits',
      'at 2026-11-21' + 'T120000 compact timestamp',
      '2026-11-21' + 'T12:00:00Z iso timestamp',
      'abc' + shortForm(123) + 'def',
      'data:image/png;base64,' + 'A'.repeat(20) + shortForm(123) + 'B'.repeat(20) + ' inside a long base64 run',
      'caf\u00e9' + shortForm(123) + ' touches a Latin letter',
      '\u03b2' + shortForm(123) + ' touches a Greek letter',
      'UTF-8 and ASCII',
      'task' + '-5 lowercase names are not ticket ids',
    ].join('\n');
    expect(findInternalRefs(clean)).toEqual([]);
  });

  it('flags ids next to punctuation that is not part of a word', () => {
    const text = [
      `// see /${shortForm(123)}/`,
      `// ${shortForm(123)}+ follow-up`,
      `// ref=${shortForm(123)}`,
      `// (${longForm(8)}), done`,
    ].join('\n');
    expect(findInternalRefs(text).map((h) => h.line)).toEqual([1, 2, 3, 4]);
  });

  it('flags ids inside Chinese prose, where no space separates them from the text', () => {
    expect(findInternalRefs(`\u4fee\u6b63${shortForm(123)}\u554f\u984c`)).toHaveLength(1);
    expect(findInternalRefs(`\u898b${longForm(31)}\u7684\u8a0e\u8ad6`)).toHaveLength(1);
  });

  it('keeps columns accurate when a base64 run earlier on the line is blanked', () => {
    const prefix = 'A'.repeat(50);
    expect(findInternalRefs(`${prefix} ${longForm(2)}`)).toEqual([{ line: 1, column: 52, match: longForm(2) }]);
  });

  it('finds several matches on one line', () => {
    expect(findInternalRefs(`${longForm(1)}, ${shortForm(200)}`)).toHaveLength(2);
  });
});

describe('check-internal-refs CLI', () => {
  const dirs = [];
  afterEach(() => {
    while (dirs.length) fs.rmSync(dirs.pop(), { recursive: true, force: true });
  });

  function makeRepo(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'internal-refs-'));
    dirs.push(dir);
    spawnSync('git', ['init', '-q'], { cwd: dir });
    for (const [rel, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), content);
    }
    return dir;
  }
  const run = (dir) => spawnSync(process.execPath, [SCRIPT, '--root', dir], { encoding: 'utf8' });

  it('exits 1 and names file and line for a hit in code', () => {
    const dir = makeRepo({
      'src/a.ts': `const x = 1\n// ${longForm(77)} workaround\n`,
      'electron/main.js': `// ${shortForm(456)}\n`,
      'tests/unit/a.test.js': `it('${longForm(9)} regression', () => {})\n`,
    });
    const res = run(dir);
    expect(res.status).toBe(1);
    const out = res.stderr + res.stdout;
    expect(out).toContain('src/a.ts:2:');
    expect(out).toContain('electron/main.js:1:');
    expect(out).toContain('tests/unit/a.test.js:1:');
  });

  it('exits 0 when code and tests are clean', () => {
    const dir = makeRepo({ 'src/a.ts': 'export const a = 1\n', 'tests/unit/a.test.js': "it('ok', () => {})\n" });
    const res = run(dir);
    expect(res.status).toBe(0);
  });

  it('ignores CHANGELOG, other Markdown and lockfiles, which are not code', () => {
    const dir = makeRepo({
      'CHANGELOG.md': `- fixed ${longForm(1)}\n`,
      'packages/x/CHANGELOG.md': `- fixed ${shortForm(111)}\n`,
      'README.md': `${longForm(2)}\n`,
      'notes/plan.md': `${longForm(3)}\n`,
      'docs/CHANGELOG.md': `${longForm(4)}\n`,
      'package-lock.json': `"integrity": "sha512-x+${shortForm(123)}/y"\n`,
      'pnpm-lock.yaml': `integrity: x+${shortForm(123)}/y\n`,
    });
    expect(run(dir).status).toBe(0);
  });

  it('scans test data, locale JSON, .mts/.cts and Markdown under docs/', () => {
    const dir = makeRepo({
      'docs/guides/intro.md': `see ${longForm(8)}\n`,
      'docs/state.json': `{"n":"${shortForm(555)}"}\n`,
      'tests/mcp-evals/questions.json': `[{"q":"${longForm(6)}"}]\n`,
      'src/locales/en.json': `{"a":"${shortForm(321)}"}\n`,
      'tests/unit/x.test.mts': `// ${longForm(7)}\n`,
    });
    const res = run(dir);
    expect(res.status).toBe(1);
    const out = res.stderr + res.stdout;
    expect(out).toContain('tests/mcp-evals/questions.json:1:');
    expect(out).toContain('src/locales/en.json:1:');
    expect(out).toContain('tests/unit/x.test.mts:1:');
    expect(out).toContain('docs/guides/intro.md:1:');
    expect(out).toContain('docs/state.json:1:');
  });

  it('does not echo a matched ticket number back in its own message', () => {
    const dir = makeRepo({ 'src/a.ts': `// ${longForm(31337)}\n` });
    const res = run(dir);
    expect(res.status).toBe(1);
    expect(res.stderr + res.stdout).not.toContain('31337');
  });

  it('scans untracked-but-not-ignored files, so a new file is caught before git add', () => {
    const dir = makeRepo({
      'src/new.ts': `// ${longForm(3)}\n`,
      '.gitignore': 'ignored/\n',
      'ignored/x.ts': `// ${longForm(4)}\n`,
    });
    const res = run(dir);
    expect(res.status).toBe(1);
    expect(res.stderr + res.stdout).toContain('src/new.ts:1:');
    expect(res.stderr + res.stdout).not.toContain('ignored/x.ts');
  });
});

describe('repository state', () => {
  it('the real repo passes its own scan', () => {
    const root = path.resolve(path.dirname(SCRIPT), '..');
    const res = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8' });
    expect(res.stderr + res.stdout).toContain('OK');
    expect(res.status).toBe(0);
  });
});
