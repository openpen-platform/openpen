# @openpen/plugin-manager

Shared install / remove / list logic for [OpenPen](https://github.com/openpen-platform/openpen) plugins. Powers `openpen-cli` and the in-app plugin marketplace; not intended for direct use by plugin authors.

## Install

```bash
npm install @openpen/plugin-manager
```

## What it does

- **Install** an OpenPen plugin from a local path or a GitHub release zip into `~/.openpen/plugins/<scope>/<name>/`, with manifest validation, SHA-256 digest verification, and atomic backup-on-failure rollback.
- **Remove** an installed plugin by `@scope/name` id.
- **List** installed plugins under `~/.openpen/plugins/`.
- **Validate** plugin manifests (`plugin.json`) and plugin id format (`@scope/name`).

## API surface

```ts
import { installFromPath, installFromZipUrl, removePlugin, listPlugins } from '@openpen/plugin-manager';
```

See [`src/index.ts`](./src/index.ts) for the exported surface and types.

## Where plugins live

| Path | Purpose |
|---|---|
| `~/.openpen/plugins/<scope>/<name>/dist/` | Plugin code loaded by the host |
| `~/.openpen/plugins/<scope>/<name>/plugin.json` | Plugin manifest |
| `~/.openpen/plugins/<scope>/<name>/locales/` | Optional i18n bundles |

## See also

- [openpen-cli](https://github.com/openpen-platform/openpen/tree/main/packages/openpen-cli) — the user-facing CLI that wraps this library
- [Build your first plugin](https://github.com/openpen-platform/openpen/blob/main/docs/tutorials/build-your-first-plugin.md)
- [Trust Model](https://github.com/openpen-platform/openpen/blob/main/docs/concepts/trust-model.md)

## License

MIT
