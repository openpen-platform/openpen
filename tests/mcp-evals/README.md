# MCP evaluation questions

Checks whether the OpenPen MCP tool descriptions and usage guide are enough for an agent that sees nothing else to pick the right tools. Every question is read-only: the agent only has to look, never to change the screen.

| File | What it is |
| --- | --- |
| `questions.json` | The questions: one sentence from a user, the scene to lay out first, the answer keywords and the tools the reference path uses |
| `seed.js` | Lays out one question's scene through the MCP tools |
| `grade.js` | Grades one run and prints its record; `--out` appends it to a JSON Lines file |

`tests/unit/mcp-evals.test.js` checks that every answer follows from its seeded scene through the read-only tools, so the questions stay correct when the tools change.

## Running one question

Run against a test instance of OpenPen: seeding clears the annotations on the display under the cursor. The agent under test must not be able to read this folder.

1. Start an isolated OpenPen with MCP on and a known key, from the repo root:

   ```sh
   REPO="$(pwd)"
   EVAL_DIR="$(mktemp -d)"
   mkdir -p "$EVAL_DIR/user-data" "$EVAL_DIR/home" "$EVAL_DIR/agent"
   KEY="opk_$(node -e "process.stdout.write(require('node:crypto').randomBytes(24).toString('base64url'))")"
   printf '{"language":"en","mcp":{"enabled":true,"apiKey":"%s","readOnly":false,"exposeAll":true,"enabledPlugins":[]}}' "$KEY" > "$EVAL_DIR/user-data/config.json"
   OPENPEN_USER_DATA_DIR="$EVAL_DIR/user-data" HOME="$EVAL_DIR/home" npm run dev
   ```

   MCP listens on the fixed port 17639, so no other OpenPen with MCP on may run at the same time.

2. Lay out the scene of question `<id>`: `node "$REPO/tests/mcp-evals/seed.js" <id> "$KEY"`.

3. Hand the question sentence, and nothing else, to a fresh Claude Code agent that only has the OpenPen MCP server, from an empty directory:

   ```sh
   cd "$EVAL_DIR/agent"
   printf '{"mcpServers":{"openpen":{"type":"http","url":"http://127.0.0.1:17639/mcp","headers":{"Authorization":"Bearer %s"}}}}' "$KEY" > mcp.json
   CLAUDE_CODE_DISABLE_CLAUDE_MDS=1 claude -p "<question sentence>" \
     --mcp-config mcp.json --strict-mcp-config --allowedTools mcp__openpen \
     --tools "" --setting-sources project --disable-slash-commands --no-session-persistence \
     --output-format stream-json --verbose > "run-<id>.jsonl"
   ```

   `--tools ""` removes the built-in tools, `--strict-mcp-config` keeps only this MCP server, `--setting-sources project` keeps out your own settings, hooks and plugins, and `CLAUDE_CODE_DISABLE_CLAUDE_MDS=1` keeps out CLAUDE.md files. Do not use `--safe-mode`: it drops the `--mcp-config` server too. In the run file, the line with `"subtype":"init"` should list `openpen` under `mcp_servers` with status `connected`, and its `tools` should hold only `mcp__openpen__` tools.

4. Grade it: `node "$REPO/tests/mcp-evals/grade.js" <id> "$EVAL_DIR/agent/run-<id>.jsonl" --round <n> --out <records.jsonl>`.

5. Quit OpenPen and remove `$EVAL_DIR`.

Other clients can be graded too: write `{"answer": "<final reply>", "toolCalls": ["list_annotations", ...]}` to a file and pass that as the run file.

## Records

`grade.js` writes one JSON object per question per round:

| Field | Meaning |
| --- | --- |
| `id`, `round` | Question id and round number |
| `question`, `expected` | The sentence given to the agent and the answer keywords |
| `answer` | The agent's final reply, verbatim |
| `correct`, `missing` | Whether every keyword appeared, and the ones that did not |
| `toolCalls` | OpenPen tools the agent called, in order |
| `usedNeeds` | Whether every tool in the question's `needs` was called |
| `changedCanvas` | Whether the agent called a tool that changes the screen, which a read-only question never needs |
| `gradedAt` | When the record was made |
