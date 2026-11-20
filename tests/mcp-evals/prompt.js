/**
 * Builds the prompt handed to the agent under test for one question: the
 * question sentence followed by the answer-line instruction (`answerSuffix`
 * in questions.json), so grade.js can find the answer in the reply.
 *
 * Usage: node tests/mcp-evals/prompt.js <question id>
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * @param {{ answerSuffix: string }} bank  the parsed questions.json
 * @param {{ question: string }} question
 */
export function buildPrompt(bank, question) {
  return `${question.question}\n\n${bank.answerSuffix}`;
}

function main([id]) {
  if (!id) {
    console.error('Usage: node tests/mcp-evals/prompt.js <question id>');
    process.exit(1);
  }
  const questionsPath = fileURLToPath(new URL('./questions.json', import.meta.url));
  const bank = JSON.parse(readFileSync(questionsPath, 'utf8'));
  const question = bank.questions.find((q) => String(q.id) === id);
  if (!question) {
    console.error(`No question with id ${id} in ${questionsPath}`);
    process.exit(1);
  }
  process.stdout.write(`${buildPrompt(bank, question)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
