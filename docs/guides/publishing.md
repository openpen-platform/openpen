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

```bash
mkdir -p ~/.openpen/plugins/my-plugin
cp -R plugin.json dist ~/.openpen/plugins/my-plugin/
# Then restart OpenPen
```

Plugin loading requires the prod build (the importmap is only in `dist/index.html`).
Build the host first if you have not already:

```bash
npm run build                              # host + runtime shims
cd packages/my-plugin && npm run build    # plugin
```

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

1. Build your plugin and publish a GitHub Release with the zipped `dist/`,
   `plugin.json`, and `locales/` (the `openpen pack` command produces this zip).
2. Users install it via `npx openpen-cli plugin add <github-url>` for a direct
   install, or `npx openpen-cli plugin install @scope/name` once your plugin is
   listed in the catalog.

There is no central plugin registry yet. Community discoverability is via
GitHub topics (`openpen-plugin`) and the OpenPen Discussions board.

---

## Trust model & responsibility

Your plugin runs in OpenPen's main renderer with full access to:

- The shared Vue instance (you can mutate any reactive state)
- `window.openPenApi` (every host IPC the app exposes)
- The DOM (any UI in the app, not just yours)
- localStorage / sessionStorage (no per-plugin isolation)

OpenPen takes a **user-installed trust model**. There is
no permissions sandbox, no code signing, and no marketplace audit. Users who
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
