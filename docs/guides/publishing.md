---
title: Publishing a Plugin
description: Build, install, and distribute an OpenPen plugin from your machine to end users.
---

# Publishing a Plugin

How to build, install, and distribute an OpenPen plugin.

---

## Build

```bash
npm run build    # outputs dist/renderer.js via @openpen/build (Rollup)
```

`@openpen/build` pre-configures Rollup to externalize `vue` and
`@openpen/module-api` — these are supplied at runtime by the host. Do not
bundle them.

### Peer dependency rules

- **MUST** keep `vue` and `@openpen/module-api` as externals.
  Bundling them creates a second Vue instance, breaks reactivity, and breaks `inject`.
- **MUST NOT** add `vue` or `@openpen/module-api` to `dependencies` or
  `bundledDependencies`. They belong in `devDependencies` (or `peerDependencies`
  for publishable plugin packages).
- If you use `@openpen/build` (the default), this is enforced automatically.
  Only override `rollupOptions.external` if you have a specific reason.

---

## Local install (for testing)

Run this in the plugin directory after `npm run build`. It copies `plugin.json`, `dist/`,
and `locales/` into `~/.openpen/plugins/@scope/name/`:

```bash
npx openpen-cli plugin add .
# Then restart OpenPen
```

`plugin add` asks you to confirm before it installs; pass `--yes` (or `-y`) in a
non-interactive shell.

Plugin loading requires a packaged (production) build of OpenPen. The host's dev
server does not load plugins, so restart a packaged OpenPen to see your plugin.

---

## Managing plugins with openpen-cli

```bash
npx openpen-cli plugin list                  # List installed plugins
npx openpen-cli plugin add <source>          # Install from a local path or GitHub release
npx openpen-cli plugin remove <id>           # Remove by plugin id
```

`<source>` accepts:
- a local directory path: `./my-plugin` or `/abs/path/to/plugin`
- a GitHub release zip URL: `https://github.com/user/repo/releases/download/v1.0.0/plugin.zip`
- a GitHub repository URL: `https://github.com/user/repo` or `github:user/repo` (resolves the latest release)

OpenPen plugins are **not** distributed through the npm registry — use one of
the GitHub forms above. See [`reference/openpen-cli.md`](../reference/openpen-cli.md)
for the full command reference.

---

## Distribution

1. Build your plugin, run `npx openpen-cli pack` to produce the zip of `dist/`,
   `plugin.json`, and `locales/`, and attach it to a GitHub Release tagged
   `v<version>`.
2. Users can install it straight from that release with
   `npx openpen-cli plugin add <github-url>`.

### The plugin catalog

OpenPen keeps a central catalog, the
[OpenPen-plugins](https://github.com/openpen-platform/OpenPen-plugins) repository.
Plugins listed there can be installed by id with
`npx openpen-cli plugin install @scope/name` and are shown in the app's Marketplace tab.

To get your plugin listed, run `npx openpen-cli publish` after attaching the zip to
your GitHub Release. It checks the release, confirms that your GitHub login matches
the scope of the plugin id, and opens a pull request against the catalog: a
Registration PR for a first submission, an Update PR for a new version. A first
submission is reviewed by a maintainer before it is merged. See section 7 of
[Build your first plugin](../tutorials/build-your-first-plugin.md)
for the full walkthrough and [`reference/openpen-cli.md`](../reference/openpen-cli.md)
for what each step does.

---

## Trust model & responsibility

Your plugin runs in OpenPen's main renderer with full access to:

- The shared Vue instance (you can mutate any reactive state)
- `window.openPenApi` (every host IPC the app exposes)
- The DOM (any UI in the app, not just yours)
- localStorage / sessionStorage (no per-plugin isolation)

OpenPen takes a **user-installed trust model**. There is
no permissions sandbox and no code signing, and catalog review is not a security
audit of your code. Users who
install your plugin are extending that trust to your code.

As a plugin author, you **SHOULD**:

- Document what your plugin reads, writes, and sends over the network in
  your plugin's own README.
- Avoid touching state owned by other plugins / host modules unless your
  plugin's purpose explicitly requires it.
- If you make outbound network requests, mention them — every request is
  logged to the user's debug console for audit.


---

## See also

- [guides/plugin-quickstart.md](./plugin-quickstart.md) — develop locally first
- [uikit/](../uikit/index.md) — UIKit component API
- [slots/](../slots/index.md) — all contribution slots
