---
title: Plugin MCP tools (experimental)
description: Let AI agents call your plugin through OpenPen's local MCP endpoint — declare tools, handle errors, write model-facing descriptions, test, and try them in MCP Inspector.
---

# Plugin MCP tools

> [!WARNING]
> **Experimental.** The `system.mcp.tools` slot, the `defineMcpTool` API and the `@openpen/module-api/testing` helpers may change. Any breaking change is announced first in this documentation and in the `@openpen/module-api` CHANGELOG, and the old behaviour keeps working for a transition period before it is removed. Pin the `@openpen/module-api` version you build against and read the CHANGELOG before upgrading.

OpenPen can run a local [MCP](https://modelcontextprotocol.io) server so AI agents on the same computer (Claude Code, Codex, …) can see and draw on the screen. A plugin can add its own tools to that server: you declare them in code, and an enabled plugin's tools show up in the agent's tool list next to the built-in ones.

This guide covers declaring a tool, returning results and errors, testing, trying it for real, and writing the description the model reads. It assumes you can already build and install a plugin — see the [Plugin Quick-start](./plugin-quickstart.md) first if not.

## What you need

- `@openpen/module-api` **1.6.0 or later** (the `mcpTools` contribution and the `testing` sub-path were added in 1.6.0).
- OpenPen **1.7.0 or later** installed. Older apps ignore `mcpTools` and never list your tools. Set `minAppVersion` in `plugin.json` to at least `1.7.0` (see [minAppVersion](#minappversion)).
- A plugin built with `npx openpen-cli create` (the starter already contains a demo tool, described below).

## Start from the starter

```bash
npx openpen-cli create @yourscope/my-plugin
cd my-plugin
npm install
```

Open `plugin.json` and replace the placeholder `description` ("A short description of what your plugin does.") with one real sentence. Agents see this line in the plugin list returned by `openpen__get_guide`.

The starter ships a small read-only demo tool in `src/mcp-demo-tool.ts` with a unit test next to it. This is the whole file:

```ts
import { defineMcpTool, z } from '@openpen/module-api'

export const echoNoteTool = defineMcpTool({
  name: 'echo_note',
  description:
    'Echoes a short note back as plain text. ' +
    'Useful for checking that the plugin and the connection work. ' +
    'Does not draw, read the screen or change anything; the note must be plain text. ' +
    'The text parameter is the note to echo, up to a few sentences.',
  inputSchema: z.object({
    text: z.string().describe('The note to echo back, as plain text.'),
  }),
  // Unlisted fields default to the worst case (changes state, destructive,
  // open world), so declare what is true. Read-only tools stay available when
  // the user limits agents to read-only.
  annotations: { readOnly: true, destructive: false, idempotent: true, openWorld: false },
  handler: ({ text }) => text,
})
```

(The shipped file also has a header comment.) The tool is attached to the module through the `mcpTools` contribution in `src/index.ts`:

```ts
import { defineModule } from '@openpen/module-api'
import { MODULE_ID } from './module-id'
import { echoNoteTool } from './mcp-demo-tool'

export default defineModule({
  id: MODULE_ID,
  version: '0.1.0',
  contributes: {
    mcpTools: [echoNoteTool],
  },
})
```

With the plugin id `@yourscope/my-plugin`, agents see this tool as **`yourscope.my-plugin__echo_note`** (see [Tool names](#tool-names)).

## Add your own tool

A tool is one object with a name, a description for the model, a [zod 4](https://zod.dev) object schema for the arguments, and a handler. Wrap it in `defineMcpTool` so the handler's `args` type follows the schema:

```ts
import { defineMcpTool, z } from '@openpen/module-api'

export const drawArrow = defineMcpTool({
  name: 'draw',
  title: 'Draw arrow',
  description: '…', // see "Writing descriptions for the model"
  inputSchema: z.object({
    x1: z.number().describe('Start X in pixels from the left edge of the display.'),
    y1: z.number().describe('Start Y in pixels from the top edge of the display.'),
    x2: z.number().describe('End X in pixels from the left edge of the display.'),
    y2: z.number().describe('End Y in pixels from the top edge of the display.'),
    color: z.string().optional().describe('CSS colour such as "#ff3b30". Defaults to the current pen colour.'),
  }),
  annotations: { readOnly: false, destructive: false, idempotent: false, openWorld: false },
  async handler({ x1, y1, x2, y2, color }, ctx) {
    // ctx.displayId is the display the call targets
    // … draw using your own plugin code …
    return { drawn: true }
  },
})
```

Then list it in `contributes.mcpTools`. One plugin may contribute any number of tools.

| Field | Required | Meaning |
|---|---|---|
| `name` | yes | Name without the plugin prefix. Characters: `A-Za-z0-9_-.` |
| `title` | no | Label for people. Looked up as a key in your plugin's [`system.locales`](../slots/system.md#system-locales) for the app's current language; if there is no such key, it is shown as written |
| `description` | yes | Text for the model, English, at most 2,048 characters (checked by `openpen-cli pack`). See [Writing descriptions for the model](#writing-descriptions-for-the-model) |
| `inputSchema` | yes | `z.object({...})`. Each `.describe()` becomes that parameter's description for the model |
| `outputSchema` | no | `z.object({...})`. When set, an object your handler returns is validated against it; a mismatch is reported as an internal error |
| `annotations` | no | Hints about side effects; see [Annotations](#annotations) |
| `handler` | yes | `(args, ctx) => result` (may be async) |

Your `inputSchema` is converted to JSON Schema for the agent. OpenPen adds one optional integer parameter, `displayId`, to every plugin tool, the same one the built-in tools have, to choose which display the call targets; when it is missing the display under the cursor is used. Your handler never receives `displayId` in `args` — read it from `ctx.displayId`. Do not declare a `displayId` parameter yourself: if you do, OpenPen's definition wins and a warning is written to the log.

### Arguments are checked before your handler runs

Before the handler is called, the arguments from the agent are validated against `inputSchema`. When they do not match, the agent gets an `invalid_params` error that names the offending parameter and says to resend following the tool's `inputSchema`, and **your handler is not called**. When several parameters are wrong, the error lists the problems zod reports for that call, one `parameter: message` entry each, separated by semicolons. You do not need to re-check types inside the handler. The handler receives the parsed value, so zod defaults and transforms are already applied.

### Tool names

The name OpenPen registers is `<plugin prefix>__<tool name>`:

- The prefix is the plugin id with the leading `@` removed and `/` replaced by `.`. `@openpen/arrow` becomes `openpen.arrow`, so the tool `draw` is listed as `openpen.arrow__draw`.
- Allowed characters are `A-Za-z0-9_-.`, and the full name is at most 128 characters.
- A tool whose full name has other characters, is too long, or has the same name as a tool that is already exposed (built-in tools included) is **not exposed**. The built-in tools and, among plugins, the plugin whose id sorts first keep the name. The reason is shown on that plugin's row in **Settings → MCP**, and a line is written to the log.

What the agent displays can differ by client, because some clients add their own prefix or rewrite characters. Claude Code, for example, shows the tool as `mcp__openpen__<plugin>__<tool>` and turns each `.` in the plugin prefix into `_`: `dogfood.greeter__greet` appears as `mcp__openpen__dogfood_greeter__greet`. MCP Inspector and the other tools in this guide use the registered name.

The SDK has the same checks, so you can run them yourself:

```ts
import { pluginToolPrefix, validateMcpToolName } from '@openpen/module-api'

const full = `${pluginToolPrefix('@yourscope/my-plugin')}__echo_note`
validateMcpToolName(full) // { ok: true }  — or { ok: false, reason: 'invalid_chars' | 'too_long' }
```

### Annotations

Annotations tell the agent (and OpenPen) what a tool may do. Fields you leave out are assumed to be the worst case:

| Field | Meaning | Default when omitted |
|---|---|---|
| `readOnly` | Does not change anything | `false` |
| `destructive` | May destroy or overwrite existing data | `true` |
| `idempotent` | Calling again with the same arguments has no further effect | `false` |
| `openWorld` | Reaches outside the app (network, other systems) | `true` |

They are passed on to the agent as the MCP hints `readOnlyHint`, `destructiveHint`, `idempotentHint` and `openWorldHint`. Set them honestly: the user can switch OpenPen's MCP server to **read-only**, and in that mode only tools with `readOnly: true` are exposed. A tool with no annotations counts as state-changing and destructive, so it is hidden in read-only mode.

## Return values

Return whatever fits the result; OpenPen converts it to MCP content.

| Handler returns | Agent receives |
|---|---|
| a string | one text item |
| an object | the object as structured content, plus the same object as one JSON text item |
| `image(base64, mimeType)` | one image item |
| an array of strings, objects and images | one item per element (objects become JSON text) |

```ts
import { image } from '@openpen/module-api'

handler() {
  return ['Captured the current annotation layer.', image(pngBase64, 'image/png')]
}
```

`image()` takes the image as a base64 string (no `data:` prefix) and its MIME type.

## Reporting errors

Throw one of four error classes when the failure is something the agent can act on. Every one takes **a message and a required, non-empty next step**; the agent receives `"<message> Next step: <next step>"`.

| Class | Use when | Agent sees `errorKind` |
|---|---|---|
| `InvalidParamsError` | The arguments have the right types but a value is unacceptable | `invalid_params` |
| `NotFoundError` | What the call refers to does not exist | `not_found` |
| `UserActionRequiredError` | Nothing more can be done until the person at the computer acts | `user_action_required` |
| `UnavailableError` | A temporary condition; trying again later may work | `unavailable` |

```ts
import { NotFoundError, UnavailableError } from '@openpen/module-api'

handler({ id }) {
  const arrow = store.find(id)
  if (!arrow) {
    throw new NotFoundError(`No arrow with id "${id}".`, 'List the arrows first, then call again with an id from that list.')
  }
  if (store.isLoading) {
    throw new UnavailableError('The canvas is still loading.', 'Wait a moment and retry the same call.')
  }
  // …
}
```

Write the next step as something the agent can do, not as an apology. Creating one of these errors with an empty next step throws a `TypeError` right away.

**Any other exception** — a bug, a failed library call — is not shown to the agent. It receives a generic `The tool failed unexpectedly.` (`errorKind: 'internal'`), and the original error is written to OpenPen's log. Do not put details the agent needs into an unclassified error; use one of the four classes above.

## The context argument

The second handler argument is a context object:

| Member | Use |
|---|---|
| `ctx.displayId` | The display the call targets, as chosen by the agent's `displayId` argument or the cursor |
| `ctx.signal` | An `AbortSignal` that is aborted when the AI app cancels the call. Pass it to `fetch` or check `ctx.signal.aborted` in long loops |
| `ctx.reportProgress(progress, total?, message?)` | Sends a progress notification for a long call. It reaches the agent only if the agent asked for progress on that call; otherwise it is dropped |
| `ctx.log(level, message)` | Writes `info`, `warn` or `error` to OpenPen's log (`main.log`), prefixed with `[mcp] plugin <your plugin id>` |

Tool handlers run in OpenPen's overlay window, the same place as the rest of your plugin code.

## Test your tool

`@openpen/module-api/testing` runs a tool the way the app does — validation first, then the handler, then conversion of the result or error — with a fake context. It is meant for unit tests and has no dependency on the app.

```ts
import { expect, it } from 'vitest'
import { callMcpTool } from '@openpen/module-api/testing'
import { echoNoteTool } from './mcp-demo-tool'

it('echoes the note', async () => {
  const result = await callMcpTool(echoNoteTool, { text: 'hello' })
  expect(result.isError).toBeUndefined()
  expect(result.content).toEqual([{ type: 'text', text: 'hello' }])
})

it('rejects a wrong argument without running the handler', async () => {
  const result = await callMcpTool(echoNoteTool, { text: 42 })
  expect(result.isError).toBe(true)
  expect(result.errorKind).toBe('invalid_params')
})
```

`callMcpTool(tool, args, ctx?)` returns the tool result plus two arrays for assertions:

- `logs` — every `ctx.log` call as `{ level, message }`, in order. An unexpected exception from your handler appears here as an `error` entry containing the original error, while the result itself only carries the generic text.
- `progress` — every `ctx.reportProgress` call as `{ progress, total?, message? }`.

The fake context uses `displayId` `0` and a signal that is never aborted. Pass a partial context as the third argument to override these, for example `{ displayId: 2 }` or a signal from your own `AbortController`.

The starter runs its tests with `npm test`; in your own project, install a test runner such as `vitest` and point it at your test files.

## minAppVersion

Set `minAppVersion` in `plugin.json` to `1.7.0` or higher:

```json
{
  "id": "@yourscope/my-plugin",
  "version": "0.1.0",
  "minAppVersion": "1.7.0",
  "renderer": "dist/renderer.js"
}
```

The SDK exports the constant `MCP_TOOLS_MIN_APP_VERSION` with this value. `npx openpen-cli pack` refuses to package a plugin that declares `mcpTools` with a lower `minAppVersion` (see [`openpen-cli pack`](../reference/openpen-cli.md#npx-openpen-cli-pack)).

## Try it in MCP Inspector

[MCP Inspector](https://github.com/modelcontextprotocol/inspector) lets you call your tool by hand, without an AI agent, against the running app.

1. Build and install the plugin, then restart OpenPen:

   ```bash
   npm run build
   npx openpen-cli plugin add . --yes
   ```

   Without `--yes`, `plugin add` asks you to confirm the install; in a non-interactive shell (a script, CI, an agent's terminal) there is no one to answer, so pass `--yes` there. Plugin code is loaded when the app starts, so a newly installed or rebuilt plugin appears only after a restart. Plugins are loaded only by the packaged app, not by the host's Vite dev server (see the [Quick-start](./plugin-quickstart.md#step-4--test-in-the-app)).
2. In OpenPen, open the settings: click the OpenPen icon in the system tray (menu bar on macOS) and choose **Preferences…**. Select the **MCP** tab. If the tab bar is too narrow to show every tab, the **MCP** tab sits behind the overflow arrow at the right end of the bar; click the arrow to scroll it into view. Turn on **Enable MCP server** and click **Save**. Copy the **Endpoint** (it looks like `http://127.0.0.1:<port>/mcp`) and the **API key**.

   If you start OpenPen with the `OPENPEN_MCP_PORT` environment variable to use a different port, click **Save** and then close and reopen the settings window; the **Endpoint** shows the new port only after that.
3. Start Inspector:

   ```bash
   npx @modelcontextprotocol/inspector
   ```

   and open the address it prints.
4. In Inspector, set **Transport Type** to **Streamable HTTP** and **URL** to the endpoint. Add a custom header `Authorization` with the value `Bearer <your API key>` (type the word `Bearer`, a space, then the key). Click **Connect**.
5. Open the **Tools** tab and click **List Tools**. Your tool is listed under its full name, for example `yourscope.my-plugin__echo_note`.
6. Select it, fill in the arguments and click **Run Tool**. Run it once with correct arguments and once with a wrong type (for example a number where text is expected): the second call must come back as an error that names the parameter and starts a `Next step:`, and your handler must not have run.

### Without the Inspector window: CLI mode

Inspector can also run a single call from the command line, which suits scripts and agents. Use the endpoint and key from step 2 (replace `<port>` and `<KEY>`):

```bash
# list the tools
npx -y @modelcontextprotocol/inspector --cli http://127.0.0.1:<port>/mcp --transport http \
  --header "Authorization: Bearer <KEY>" --method tools/list

# call one tool (full name; repeat --tool-arg for each argument)
npx -y @modelcontextprotocol/inspector --cli http://127.0.0.1:<port>/mcp --transport http \
  --header "Authorization: Bearer <KEY>" --method tools/call \
  --tool-name yourscope.my-plugin__echo_note --tool-arg text=hello
```

`--tool-arg name=value` turns a value that looks like a number into a number, so `--tool-arg text=42` sends the number `42`. That is useful here: it is the easy way to send a wrong type to a text parameter and check that the call comes back as `invalid_params` without running your handler.

If the tool is not listed, check in this order: the plugin is enabled in **Settings → Modules**; **Settings → MCP → Plugin tools** lets this plugin through; the server is not in read-only mode, or the tool has `readOnly: true`; the plugin row in **Settings → MCP** shows no "not exposed" reason (name problem); OpenPen was restarted after the install.

## Try it with an agent

Connect your agent as described in **Settings → MCP** (the **Agent** picker's **Copy setup** button gives a ready-made command). The agent then sees your tools under their full names, and calls them like any other tool. The name shown depends on the client: Claude Code lists `yourscope.my-plugin__echo_note` as `mcp__openpen__yourscope_my-plugin__echo_note` (client prefix added, `.` in the plugin prefix turned into `_`), so look for the tool by the tool part of the name. Ask it to use the tool by describing the goal; for the demo tool, "use the echo_note tool to send the note 'hello'".

The server announces tool-list changes (a plugin enabled or disabled in Settings) with `notifications/tools/list_changed`. Whether an agent refreshes its list when it gets this varies between clients; if the list looks stale, reconnect the agent.

Calling a tool of a plugin that was just disabled returns an error containing `Plugin is disabled`.

## Plugin guide for agents

For anything longer than a description can carry — workflows, ordering of calls, examples — add a guide to the module:

```ts
export default defineModule({
  id: MODULE_ID,
  mcpGuide: `Arrow plugin guide.\n\nCall draw once per arrow. To label an arrow, …`,
  contributes: { mcpTools: [drawArrow] },
})
```

The guide is **not** part of the tool list. An agent receives it only when it calls the built-in `openpen__get_guide` tool and names your plugin: `{ "plugin": "@yourscope/my-plugin" }`. The first line of the reply is a header, `Guide from plugin @yourscope/my-plugin (tools: …)`, followed by your text only. Calling `openpen__get_guide` without a plugin returns OpenPen's own guide plus a short list of exposed plugins with their manifest `description`, so keep that one-line `description` in `plugin.json` meaningful.

If the plugin is not exposed, or has no `mcpGuide`, the agent gets an error (`Plugin <id> is not exposed.` / `Plugin <id> provides no guide.`) with a next step.

## Writing descriptions for the model

The `description` of a tool and the `.describe()` of each parameter are read by a language model that has no other context about your plugin. It decides from these texts alone whether to call the tool and with which values. Write them for that reader.

**Limit:** English, at most **2,048 characters**. `npx openpen-cli pack` rejects a longer description.

**Four parts, in this order, in plain sentences:**

1. **What it does** — one sentence: the effect, in concrete terms.
2. **What it suits** — when the tool is the right one to use.
3. **What it does not suit, and limits** — what it cannot do, ranges, side effects, what happens on bad input.
4. **Parameters** — the points that are easy to get wrong: units, coordinate origin, accepted formats, defaults.

**Style rules:**

- Describe, do not instruct. Write "Draws an arrow between two points" rather than "You must call this to draw an arrow". Avoid imperatives aimed at the model.
- No capitals for emphasis (`ALWAYS`, `NEVER`, `IMPORTANT`), no repeated warnings. A fact stated once, plainly, is enough.
- Do not refer to other tools or to the order of calls ("call X first", "unlike Y"). The agent may not have those tools, and another plugin may change their names. Put cross-tool workflows in the [plugin guide](#plugin-guide-for-agents) instead.
- Say what the result looks like, so the agent can tell that the call worked.
- State units and origin for every number (pixels, from the top-left of the display).
- Put the detail on the parameter with `.describe()`, not in the tool description, so it stays next to the field it explains.

**Example**

Weak — vague, instructing, shouting:

```ts
description: 'IMPORTANT: ALWAYS use this tool to draw. Draws arrows. Call get_screen first.'
```

Better — the four parts, descriptive:

```ts
description:
  'Draws a single arrow on the screen between two points. ' +
  'Suits pointing at something on screen during a presentation or a walkthrough. ' +
  'Draws one arrow per call, cannot edit or delete an arrow once drawn, and the arrow stays until the user clears the canvas; ' +
  'points outside the display are clamped to its edge. ' +
  'Coordinates are in pixels from the top-left corner of the display; color is a CSS colour string and defaults to the current pen colour.',
```

Keep an eye on the cost: every exposed tool's description is sent to the agent on every conversation. Shorter, precise descriptions leave the model more room for the user's task.

## Checklist before you publish

- `plugin.json` has `minAppVersion` of `1.7.0` or higher.
- Every tool's full name is valid and unlikely to clash; run it through `validateMcpToolName`.
- Every `description` is at most 2,048 characters and follows the four parts.
- Annotations are set on every tool; read-only tools say `readOnly: true`.
- Every error the agent can act on is one of the four classes, with a real next step.
- Unit tests cover a correct call and a wrong-argument call with `callMcpTool`.
- You listed the tool in MCP Inspector and ran it against the installed plugin.
- `npx openpen-cli pack` passes.
