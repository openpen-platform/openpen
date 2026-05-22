---
title: Plugin Compatibility
description: How plugins declare which OpenPen versions they support, how the host decides whether to load them, and how breaking changes are handled.
---

# Plugin Compatibility

How plugins declare which OpenPen versions they support, how OpenPen
decides whether to load them, and how breaking changes are handled
across host and SDK versions.

---

## TL;DR

- Plugins declare compatibility through two fields: `minAppVersion` (in
  the module definition) and the version range of `@openpen/module-api`
  they import (in the plugin's `package.json`).
- OpenPen rejects plugins whose `minAppVersion` is newer than the running
  host version.
- The SDK (`@openpen/module-api`) follows semver. A plugin that imports
  `@openpen/module-api@^1.0.0` works on every host that ships
  module-api `1.x` with the same minor or higher.
- Breaking changes to the SDK get one minor-version deprecation period
  before removal.

---

## The two compatibility fields

### `minAppVersion` — host version gate

Declare the minimum OpenPen host version your plugin requires inside
`defineModule()`:

```ts
import { defineModule } from '@openpen/module-api'

export default defineModule({
  id: 'my-plugin',
  version: '1.2.0',
  minAppVersion: '1.0.0',   // requires OpenPen 1.0.0 or newer
  contributes: {
    // ...
  },
})
```

This field maps to the `minAppVersion?: string` property on the
`OpenPenModule` interface. At load time, OpenPen runs preflight
validation for every module:

- If the running host version is **older** than `minAppVersion` →
  the plugin is rejected with a clear error logged to the Modules panel.
- If the running host version is **equal or newer** → validation
  continues to the next check (id format, slot existence, settings
  schema, etc.).

The field is optional. If omitted, no host-version gate is applied.

**Set `minAppVersion` to the actual oldest version your plugin needs.**
Setting it higher than required silently breaks the plugin for users on
older OpenPen builds.

### `@openpen/module-api` semver range

In your plugin's `package.json`, declare the SDK as a dev dependency
(or peer dependency for publishable packages):

```json
{
  "devDependencies": {
    "@openpen/module-api": "^1.0.0"
  }
}
```

The host ships its own copy of `@openpen/module-api` and exposes it
to plugins via an importmap at runtime (`dist/openpen-runtime/module-api.js`).
Plugins must **not** bundle `@openpen/module-api` — `@openpen/build`
enforces this automatically by externalizing the package. The version
your plugin was built against determines which API surface you depend on;
the host's shipped version is what actually runs.

See [Publishing](../guides/publishing.md) for build configuration details.

---

## Compatibility matrix

OpenPen's monorepo ships all packages in **lockstep** — the host app,
the SDK, the build CLI, and the install CLI share the same version on
every stable release. Plugin authors only need to track **one** version
number.

| OpenPen host | `@openpen/module-api` | `@openpen/build` | `openpen-cli` |
|---|---|---|---|
| 1.x (current) | 1.x | 1.x | 1.x |
| pre-1.0 (internal) | (no stable contract) | — | — |

When you read "OpenPen 1.4.2" anywhere — release notes, GitHub tag,
`package.json` — every package in the monorepo is at exactly that
version on the same day.

---

## Breaking change policy

OpenPen's compatibility commitment for the SDK and the contribution slot
API:

- **Patch releases (x.x.N)** — bug fixes only. No changes to the
  `OpenPenModule` interface, `ModuleSetupContext`, slot shapes, or UIKit
  component props / events / slots.
- **Minor releases (x.N.0)** — additive changes only. New fields,
  new slots, new UIKit components. Existing plugins continue to work
  without modification.
- **Major releases (N.0.0)** — may include breaking changes. Plugins
  may need updates; migration paths will be documented.

### Deprecation process

When an API surface changes shape (a slot field is renamed, a
`ModuleSetupContext` method is replaced, a UIKit component prop is
removed):

1. The deprecation lands in a **minor release** with a `@deprecated`
   JSDoc tag on the old API and a runtime `console.warn` printed once
   per module that uses it.
2. The deprecated API remains functional for **at least one full minor
   release cycle**.
3. Removal happens in the next **major release**, listed in
   `CHANGELOG.md` under a "Breaking" section with a migration guide.

---

## Plugin license freedom

OpenPen uses a layered license model: the host is GPL-3.0-or-later with a Plugin
Linking Exception, and the SDK packages (`@openpen/module-api`,
`@openpen/build`, `openpen-cli`) are MIT-licensed.

This means:

- Your plugin may use **any license**, including proprietary and
  closed-source commercial licenses.
- You can sell your plugin under terms of your choosing.
- You only need to comply with the GPL if you modify the OpenPen host
  itself, not when you write a plugin.

See the root [`LICENSE`](../../LICENSE) file for the exact wording of
the Plugin Linking Exception, and [`README.md`](../../README.md#license)
for the layered license overview.

---

## Plugin runtime constraints

OpenPen ships with macOS `hardenedRuntime` enabled (required for
Apple notarization on Gatekeeper-protected systems). This affects what
plugins can ship at runtime:

- **Plugins must be pure JavaScript / TypeScript.** Native Node.js
  addons (`.node` files), shared libraries, or any unsigned binary code
  loaded at runtime will be blocked by macOS Gatekeeper. The
  `@openpen/build` toolchain (Vite + Vue) covers `.ts`, `.vue`, and
  `.css` — these compile to plain JS and ship fine.
- **External `fetch` / `XMLHttpRequest` is allowed** but logged in
  OpenPen's audit log; see [Trust Model](./trust-model.md).
- **No subprocess spawn from plugin code.** Plugins cannot launch
  separate binaries via `child_process` (the renderer doesn't expose
  this and the preload bridge does not proxy it).

If you need to ship a plugin that requires native code, please open
an issue — it would require host-level changes (e.g. a separate signed
helper process) that are out of scope for the current release line.

---

## Plugin author best practices

- **Pin `minAppVersion` to the actual minimum, not the latest.** If your
  plugin only uses APIs present since `1.0.0`, write `minAppVersion: '1.0.0'`.
  Setting it to the current release blocks users on older builds for no reason.

- **Use caret ranges for `@openpen/module-api`** (`^1.0.0`). Caret allows
  compatible patch and minor updates while protecting against major-version
  breaking changes. Exact pins (`1.0.0`) prevent you from receiving bug
  fixes automatically.

- **Never bundle `@openpen/module-api` or `vue`.** The host provides both
  via importmap. Bundling them produces a second Vue instance, which breaks
  reactivity and `inject()`. If you use `@openpen/build`, this is enforced
  automatically.

- **Test against the lowest `minAppVersion` you declare.** Don't call APIs
  that only exist in a newer minor and then claim compatibility with an
  older host.

- **Subscribe to OpenPen releases on GitHub** to catch deprecation warnings
  before they become removals.

### Plugin id naming

Plugin ids MUST follow the npm-scope shape `@scope/name` (e.g. `@acme/sticky-notes`),
matched to the on-disk layout `~/.openpen/plugins/@scope/name/plugin.json`.

When two installed plugins declare the same id, OpenPen applies a **first-wins**
rule: the plugin discovered first (alphabetical scan order) is loaded, the rest
are skipped with a warning toast and a console log. Built-in module ids are
reserved — a plugin that claims a built-in id is always the one skipped, never
the built-in.

To avoid silent collisions with someone else's plugin:

- **Use a unique scope you control** — your GitHub org, your npm org, or a
  domain-derived prefix. Generic scopes (`@plugins`, `@openpen`, `@util`) collide
  with everyone else who picked the same shortcut.
- **Avoid scope names that imply official status** (`@openpen-official`,
  `@openpen-team`, etc.) unless you actually maintain OpenPen.
- **Treat the plugin id as permanent.** Renaming an id breaks user installs and
  loses `installedAt` history; pick a name you can live with.

---

## `plugin-meta.json` ownership

OpenPen maintains a `plugin-meta.json` cache in the user-data directory
(`~/Library/Application Support/openpen/plugin-meta.json` on macOS; equivalent
locations on Windows and Linux). The cache tracks per-plugin metadata such as
`installedAt`.

The host **rebuilds the cache on startup** by scanning `~/.openpen/plugins/`.
The CLI (`openpen-cli plugin add` / `npm run install` paths) **never writes
into `plugin-meta.json`** — it only places files under
`~/.openpen/plugins/<scope>/<name>/`.

Practical consequences:

- After `openpen-cli plugin add .` returns, your plugin is on disk but **not
  yet in the metadata cache**. Start (or restart) OpenPen for the cache to
  pick it up.
- To verify an install took effect:
  - `npx openpen-cli plugin list` scans the on-disk plugins directory directly
  - Open OpenPen and check **Settings → Modules**
- Manually editing `plugin-meta.json` is unsupported. The next host start
  overwrites edits.

## When OpenPen breaks something unintentionally

Unintended host-side breakage is a bug. Open an issue at
`https://github.com/openpen-platform/openpen/issues` with:

- Your plugin's `id`, `version`, and `minAppVersion`
- The OpenPen host version (`Settings → About` or `openpen --version`)
- A minimal reproduction (plugin id + steps to reproduce)

Unintended breakage is treated as a release-blocker patch.

---

## See also

- [Module Architecture](./module-architecture.md) — the host / module / plugin
  layering, load lifecycle, and the full `OpenPenModule` interface
- [Trust Model](./trust-model.md) — what plugins can access and how to install safely
- [Publishing](../guides/publishing.md) — building and distributing your plugin
- [Plugin Quick-start](../guides/plugin-quickstart.md) — from zero to a running plugin
