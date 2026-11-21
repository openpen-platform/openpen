# OpenPen Plugin Starter

A minimal scaffold for building OpenPen plugins.

## Quickstart (3 minutes)

```bash
npx openpen-cli create @yourscope/my-plugin
cd my-plugin
npm install
npm run build
npx openpen-cli plugin add .
```

Replace `yourscope` with your GitHub username or org name (lowercase).
`npx openpen-cli create` copies this starter and substitutes the plugin id;
`plugin add` copies `plugin.json`, `dist/` and `locales/` into
`~/.openpen/plugins/@yourscope/my-plugin/`.

Restart OpenPen. A packaged release works, and so does OpenPen run from
source (`npm run dev` in a checkout of the OpenPen repository), which loads
the same `~/.openpen/plugins/` folder. The plugin loads automatically, and a
toast tells you where its buttons landed on the control bar. A source run
skips a plugin whose `minAppVersion` is higher than the checkout's version;
see [OpenPen run from source](https://github.com/openpen-platform/openpen/blob/main/docs/guides/mcp-tools.md#try-it-in-mcp-inspector).

## What's inside

- `src/index.ts` — your plugin entry, exports `defineModule({ ... })`
- `src/mcp-demo-tool.ts` — a read-only `echo_note` MCP tool that AI agents can call
  (experimental), with its unit test `src/mcp-demo-tool.test.ts`; run `npm test`
- `src/locales/` — i18n locale files (`en.json`, `zh-Hant.json`, ...)
- `package.json` — dependency on `@openpen/module-api` (required) and
  `@openpen/build` (devDependency, the bundler CLI)
- `tsconfig.json` — TypeScript config aligned with OpenPen's host

## Let AI agents call your plugin (experimental)

The starter declares one MCP tool, `echo_note`, in `src/mcp-demo-tool.ts` and
attaches it through `contributes.mcpTools` in `src/index.ts`. With OpenPen's
MCP server turned on (Settings → MCP), an agent sees it as
`yourscope.my-plugin__echo_note`. `npm test` runs the tool through the SDK's
`callMcpTool` helper, including a wrong-argument call that is rejected before
the handler runs. Plugins with tools need `minAppVersion` 1.7.0 or higher in
`plugin.json`; the starter already sets it. Read
[Plugin MCP tools](https://github.com/openpen-platform/openpen/blob/main/docs/guides/mcp-tools.md)
for the full guide, including how to write descriptions the model reads.

## Next steps

- **New to OpenPen plugins?** → Read the
  [Build Your First Plugin](https://github.com/openpen-platform/openpen/blob/main/docs/tutorials/build-your-first-plugin.md) tutorial.
- **Want to publish?** → Follow the
  [Publishing Guide](https://github.com/openpen-platform/openpen/blob/main/docs/guides/publishing.md).
- **Need to understand the architecture?** → See
  [Module Architecture](https://github.com/openpen-platform/openpen/blob/main/docs/concepts/module-architecture.md).
- **Looking for API reference?** → Browse
  [docs/reference/](https://github.com/openpen-platform/openpen/tree/main/docs/reference).

## License

MIT
