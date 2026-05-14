# OpenPen Plugin Starter

A minimal scaffold for building OpenPen plugins.

## Quickstart (3 minutes)

```bash
npx degit openpen/plugin-starter my-plugin
cd my-plugin
npx openpen-cli plugin add .
```

The CLI runs `npm install` and `npm run build` for you, then copies
the artifact into `~/.openpen/plugins/my-plugin/`.

Restart OpenPen → **Settings → Modules** → enable your plugin.
You should see a new tool button in the control bar.

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
