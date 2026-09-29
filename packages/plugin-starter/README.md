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
`openpen create` copies this starter and substitutes the plugin id;
`plugin add` copies `plugin.json`, `dist/` and `locales/` into
`~/.openpen/plugins/@yourscope/my-plugin/`.

Restart OpenPen (a packaged build; the host's dev server does not load
plugins). The plugin loads automatically, and a toast tells you where its
buttons landed on the control bar.

## What's inside

- `src/index.ts` — your plugin entry, exports `defineModule({ ... })`
- `src/locales/` — i18n locale files (`en.json`, `zh-Hant.json`, ...)
- `package.json` — dependency on `@openpen/module-api` (required) and
  `@openpen/build` (devDependency, the bundler CLI)
- `tsconfig.json` — TypeScript config aligned with OpenPen's host

## Next steps

- **New to OpenPen plugins?** → Read the
  [Build Your First Plugin](../../docs/tutorials/build-your-first-plugin.md) tutorial.
- **Want to publish?** → Follow the
  [Publishing Guide](../../docs/guides/publishing.md).
- **Need to understand the architecture?** → See
  [Module Architecture](../../docs/concepts/module-architecture.md).
- **Looking for API reference?** → Browse
  [docs/reference/](../../docs/reference/).

## License

MIT
