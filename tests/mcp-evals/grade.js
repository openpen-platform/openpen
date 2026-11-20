/**
 * Grades one answer of the agent under test and prints its record.
 *
 * Usage: node tests/mcp-evals/grade.js <question id> <run file> [--round <n>] [--out <records.jsonl>]
 *
 * The run file is either the output of a Claude Code run with
 * `--output-format stream-json --verbose`, or, for other clients, a JSON file
 * `{ "answer": "<final reply>", "toolCalls": ["list_annotations", ...] }`.
 * With --out the record is also appended to that JSON Lines file, one line per
 * question per round.
 *
 * Record fields:
 *   id, round        question id and round number (round defaults to 1)
 *   question         the sentence given to the agent
 *   expected         the answer keywords, separated by '；'
 *   answer           the agent's final reply, verbatim
 *   correct          true when every keyword appears in the reply
 *   missing          the keywords that did not appear
 *   toolCalls        OpenPen tools the agent called, in order, without prefixes
 *   usedNeeds        true when every tool in the question's `needs` was called
 *   changedCanvas    true when the agent called any tool that is not read-only
 *   gradedAt         ISO time of grading
 *
 * Matching ignores case and white space, reads full-width characters as
 * half-width and treats "400x300" and "400*300" as "400×300". A keyword must
 * stand on its own: "5" does not match inside "15", "eraser" does not match
 * inside "stroke-eraser" (an id may still follow a prefix such as "openpen__").
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { READ_ONLY_TOOL_NAMES } from '../../electron/mcp/tools.js';
import { MCP_TOOL_PREFIX } from '../../shared/mcp-constants.js';

const READ_ONLY = new Set(READ_ONLY_TOOL_NAMES.map((n) => n.slice(MCP_TOOL_PREFIX.length)));

function normalize(text) {
  return String(text)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/(\d)[x*✕](?=\d)/g, '$1×');
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** True when the normalized keyword occurs in the normalized reply and is not part of a longer number or id. */
function containsKeyword(reply, keyword) {
  // Numbers may be followed by a unit ("600px") or a full stop; ids may follow a prefix ending in "_".
  const numeric = /^\d/.test(keyword) && /\d$/.test(keyword);
  const before = numeric ? String.raw`(?<![\d.])` : '(?<![a-z0-9-])';
  const after = numeric ? String.raw`(?!\d|\.\d)` : '(?![a-z0-9-])';
  return new RegExp(`${before}${escapeRe(keyword)}${after}`).test(reply);
}

/** "mcp__openpen__openpen__get_state" or "openpen__get_state" -> "get_state"; other tools keep their name. */
function bareToolName(name) {
  const at = name.lastIndexOf(MCP_TOOL_PREFIX);
  return at === -1 ? name : name.slice(at + MCP_TOOL_PREFIX.length);
}

/** Pull the final reply and the tool calls out of a run file's text. */
function parseRun(text) {
  const trimmed = text.trim();
  let whole = null;
  try {
    whole = JSON.parse(trimmed);
  } catch {
    // Not a single JSON value: a stream-json run, one event per line.
  }
  if (whole && typeof whole === 'object' && !Array.isArray(whole) && !('type' in whole)) {
    return { answer: whole.answer ?? '', toolCalls: (whole.toolCalls ?? []).map(bareToolName) };
  }
  let answer = '';
  const toolCalls = [];
  for (const line of trimmed.split('\n')) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'assistant') {
      for (const block of event.message?.content ?? []) {
        if (block.type === 'tool_use') toolCalls.push(bareToolName(block.name));
      }
    } else if (event.type === 'result') {
      answer = event.result ?? '';
    }
  }
  return { answer, toolCalls };
}

/**
 * @param {{ id: number, question: string, answer: string, needs: string[] }} question
 * @param {string} runText  contents of the run file
 * @param {{ round?: number }} [opts]
 */
export function gradeRun(question, runText, { round = 1 } = {}) {
  const { answer, toolCalls } = parseRun(runText);
  const reply = normalize(answer);
  const keywords = question.answer.split('；');
  const missing = keywords.filter((k) => !containsKeyword(reply, normalize(k)));
  return {
    id: question.id,
    round,
    question: question.question,
    expected: question.answer,
    answer,
    correct: missing.length === 0,
    missing,
    toolCalls,
    usedNeeds: question.needs.every((n) => toolCalls.includes(n)),
    changedCanvas: toolCalls.some((t) => !READ_ONLY.has(t)),
    gradedAt: new Date().toISOString(),
  };
}

function main(argv) {
  const [id, runPath] = argv;
  const flag = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  if (!id || !runPath) {
    console.error('Usage: node tests/mcp-evals/grade.js <question id> <run file> [--round <n>] [--out <records.jsonl>]');
    process.exit(1);
  }
  const questionsPath = fileURLToPath(new URL('./questions.json', import.meta.url));
  const question = JSON.parse(readFileSync(questionsPath, 'utf8')).questions.find((q) => String(q.id) === id);
  if (!question) {
    console.error(`No question with id ${id} in ${questionsPath}`);
    process.exit(1);
  }
  const record = gradeRun(question, readFileSync(runPath, 'utf8'), { round: Number(flag('--round') ?? 1) });
  const out = flag('--out');
  if (out) appendFileSync(out, `${JSON.stringify(record)}\n`);
  console.log(JSON.stringify(record, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
