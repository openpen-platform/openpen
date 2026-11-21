// Fails when code or tests mention an internal ticket id. This repo is public;
// internal tracker ids mean nothing to contributors and leak how we manage work.
//
// Flagged shapes (case-sensitive, with explicit boundaries — see below):
//   - the tracker prefix, a hyphen and digits  (shape: TASK-<digits>)
//   - a capital T followed by exactly three digits  (shape: T<3 digits>)
//
// Scope: code, test and locale/data files (see CODE_EXT) plus Markdown under
// docs/, which is published to the website. Other Markdown, CHANGELOG files and
// lockfiles are historical records or generated data and are not checked.
// Files come from `git ls-files --cached --others --exclude-standard`, so
// untracked new files are caught before `git add`, and ignored paths
// (node_modules, dist) are skipped.
//
// Boundaries are JS lookbehind/lookahead, not grep `\b` — BSD grep on macOS
// handles `\b` differently from GNU grep. A match must not touch a Latin,
// Greek or Cyrillic letter, a decimal digit or `_`; CJK characters are
// deliberately NOT boundaries so an id inside Chinese prose is still caught.
// Long base64-looking runs (data URIs, hashes) are blanked out first so a
// random run of characters cannot produce a false hit.
//
// Messages never echo the matched id back; they only give file:line:column.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const CODE_EXT = /\.(?:js|mjs|cjs|jsx|ts|mts|cts|tsx|vue|css|html|json|yml|yaml)$/
const DOCS_MD = /^docs\/.*\.md$/
const SKIP_PATH = /(?:^|\/)(?:CHANGELOG[^/]*|package-lock\.json|pnpm-lock\.yaml|node_modules\/.*)$/

const WORD = '\\p{Script=Latin}\\p{Script=Greek}\\p{Script=Cyrillic}\\p{Nd}_'
const LONG_FORM = `(?<![${WORD}])TASK-\\d+(?![${WORD}])`
const SHORT_FORM = `(?<![${WORD}])T\\d{3}(?![${WORD}])`
const REF_RE = new RegExp(`${LONG_FORM}|${SHORT_FORM}`, 'gu')
const BASE64_RUN = /[A-Za-z0-9+/]{40,}={0,2}/g

/** Returns `[{ line, column, match }]` (1-based) for every internal id in `text`. */
export function findInternalRefs(text) {
  const hits = []
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i++) {
    // Same-length blanking keeps reported columns accurate.
    const line = lines[i].replace(BASE64_RUN, (run) => ' '.repeat(run.length))
    for (const m of line.matchAll(REF_RE)) {
      hits.push({ line: i + 1, column: m.index + 1, match: m[0] })
    }
  }
  return hits
}

function listFiles(root) {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return out.split('\0').filter((f) => f && (CODE_EXT.test(f) || DOCS_MD.test(f)) && !SKIP_PATH.test(f))
}

function main() {
  const rootArg = process.argv.indexOf('--root')
  const root =
    rootArg !== -1 && process.argv[rootArg + 1]
      ? resolve(process.argv[rootArg + 1])
      : join(dirname(fileURLToPath(import.meta.url)), '..')

  let checked = 0
  const failures = []
  for (const rel of listFiles(root)) {
    let text
    try {
      text = readFileSync(join(root, rel), 'utf8')
    } catch {
      continue // listed but deleted from the working tree
    }
    checked++
    for (const hit of findInternalRefs(text)) failures.push(`${rel}:${hit.line}:${hit.column}`)
  }

  if (failures.length > 0) {
    console.error('check-internal-refs: internal ticket ids found in code, tests or docs:')
    for (const loc of failures) console.error(`  ${loc}`)
    console.error(
      '\nThis repo is public. Remove tracker references (shapes: TASK-<digits> or T<3 digits>) from\n' +
        'code, comments, test titles and docs; describe the behaviour instead.'
    )
    process.exit(1)
  }
  console.log(`check-internal-refs: ${checked} files OK`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
