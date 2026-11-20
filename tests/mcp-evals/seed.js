/**
 * Lays out the scene of one evaluation question (questions.json) on the
 * display under the mouse cursor, through the OpenPen MCP tools.
 *
 * Usage: node tests/mcp-evals/seed.js <question id> <MCP key> [MCP URL]
 * The URL defaults to http://127.0.0.1:17639/mcp. The key is the one shown in
 * Settings > MCP; MCP must be on and read-only mode off, because seeding draws.
 *
 * Seeding first clears every annotation on that display, so run it against a
 * test instance of OpenPen, never against a screen whose annotations matter.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Clear the canvas, draw the scene's annotations in order, then apply the
 * scene's tool and drawing mode (drawing mode stays on unless the scene says
 * `drawingMode: false`).
 *
 * @param {(name: string, args?: object) => Promise<unknown>} call  calls an MCP tool by its name without the `openpen__` prefix
 * @param {{ annotations: Array<{ tool: string, args: object }>, tool?: string, drawingMode?: boolean }} scene
 */
export async function seedScene(call, scene) {
  await call('clear_canvas');
  for (const a of scene.annotations) await call(a.tool, a.args);
  if (scene.tool) await call('set_tool', { tool: scene.tool });
  await call('set_drawing_mode', { enabled: scene.drawingMode ?? true });
}

async function main([id, key, url = 'http://127.0.0.1:17639/mcp']) {
  if (!id || !key) {
    console.error('Usage: node tests/mcp-evals/seed.js <question id> <MCP key> [MCP URL]');
    process.exit(1);
  }
  const questionsPath = fileURLToPath(new URL('./questions.json', import.meta.url));
  const question = JSON.parse(readFileSync(questionsPath, 'utf8')).questions.find((q) => String(q.id) === id);
  if (!question) {
    console.error(`No question with id ${id} in ${questionsPath}`);
    process.exit(1);
  }

  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
  const client = new Client({ name: 'openpen-mcp-evals-seed', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
  }));
  try {
    await seedScene(async (name, args = {}) => {
      const res = await client.callTool({ name: `openpen__${name}`, arguments: args });
      if (res.isError) throw new Error(`${name} failed: ${res.content.find((c) => c.type === 'text')?.text}`);
      return res;
    }, question.scene);
  } finally {
    await client.close();
  }
  console.log(`Scene of question ${id} is on screen (${question.scene.annotations.length} annotations).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(1);
  });
}
