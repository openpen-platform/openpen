---
title: Publishing a Plugin
description: Build, install, and distribute an OpenPen plugin from your machine to end users.
---

# Publishing a Plugin

How to build, install, and distribute an OpenPen plugin.

---

## Build

```bash
npm run build    # outputs dist/renderer.js via @openpen/build (Vite)
```

`@openpen/build` pre-configures Vite to externalize `vue` and
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
   `plugin.json`, and `locales/` (when that folder exists), and attach it to a GitHub Release tagged
   `v<version>`.
2. Users can install it straight from that release with
   `npx openpen-cli plugin add <github-url>`.

### Two ways to be listed

OpenPen has two separate lists. Pick the one that fits; they are not steps of one
process.

| | Community list | Official catalog |
| --- | --- | --- |
| How you get in | Publish a release and add the `openpen-plugin` topic to your repository | Run `npx openpen-cli publish`, which opens a pull request |
| Review | None. A scanner checks the package automatically | A maintainer reviews a first submission; updates are checked by the catalog bot |
| Time to appear | Next scan (every 30 minutes) | After the pull request is merged |
| Where it is recorded | `community/plugins.json` in the catalog repository | `plugins.json` in the catalog repository |

Both lists live in the
[OpenPen-plugins](https://github.com/openpen-platform/OpenPen-plugins) repository.
Community entries are never merged into the official `plugins.json`, and a listing in
either one is not a security audit of your code.

### Community list

A scanner reads public GitHub repositories that carry the `openpen-plugin` topic. To
be listed:

1. Create the plugin. `npx openpen-cli create @scope/name` scaffolds a project, then
   `npm install` and `npm run build` produce `dist/renderer.js`. The scaffold ships
   sample translations (`src/locales/`: `en`, `ja`, `zh-Hans`, `zh-Hant`) that are
   bundled into `renderer.js`; keep, edit or delete them. See the
   [quickstart](./plugin-quickstart.md) for the development loop.
2. Make sure `plugin.json` has `id`, `name`, `version`, `description` and
   `minAppVersion`. Replace the scaffold's placeholder `description` ("A short
   description of what your plugin does.") with a real one; it is the text shown for
   your plugin in the list. `version` must be semver, and the scope of `id` must be the
   name of the GitHub account or organization that owns the repository, in lowercase
   (`@alice/todo-app` for `github.com/alice/todo-app`). The scanner compares the scope
   with the repository owner only; it does not check which account you are logged in
   with, so for an organization it is enough that the repository lives under that
   organization. `create` compares the scope with your personal login and may print a
   warning for an organization scope; that does not block the community list. The
   `@openpen` scope and ids already in the official catalog are refused.
3. Put the project in a public GitHub repository. Run `git init`, then create the
   repository under the account or organization named by the scope of your plugin id
   (for `@alice/todo-app`, under `alice`) and push, for example
   `gh repo create alice/todo-app --public --source . --push`. The repository name does
   not have to match the plugin name; only the owner is compared with the scope.
   Private, forked and archived repositories are skipped. Before the first commit, make
   sure the project has a `.gitignore` that lists `node_modules/`, `dist/` and `*.zip`,
   so build output and the packed zip stay out of the repository. The scaffold of older
   CLI versions does not create this file; if it is missing, create it with those three
   lines. If the generated README has links that start with `../../docs`, replace them
   with full URLs on the documentation site, `https://openpen.pages.dev/docs/` (for
   example `https://openpen.pages.dev/docs/guides/publishing`), because the relative
   links only work inside the OpenPen repository. The `"private": true` line in the
   scaffolded `package.json` only stops `npm publish`; it does not affect releases or
   the scan.
4. Run `npm run pack` in a scaffolded project (it runs `npx openpen-cli pack`), then
   create a GitHub Release for `v<version>` with the zip attached, for example
   `gh release create v<version> ./<scope>-<name>-<version>.zip`. The zip holds
   `plugin.json`, `dist/` and, if the folder exists, `locales/`. At the end `pack`
   prints a hint to run `publish`; that step belongs to the official catalog and you can
   skip it for the community list. Some older CLI versions print the hint as
   `npx openpen publish`: the command name is always `npx openpen-cli`, because the
   bare `openpen` package on npm is an unrelated tool. The release must be published,
   not a draft or a prerelease. The scanner uses the latest release and its first
   `.zip` asset, which must have `plugin.json` at the zip root.
5. Add the `openpen-plugin` topic to the repository: on the repository page, the gear
   next to About, Topics; or with the GitHub CLI,
   `gh repo edit --add-topic openpen-plugin`.
6. Wait for the next scan. The scanner downloads the zip, reads `plugin.json` and
   computes the sha256 itself; you do not submit a hash or a pull request. The scan
   runs every 30 minutes and you cannot trigger it yourself, so allow up to about 30
   minutes. To confirm the listing, open
   [`community/plugins.json`](https://raw.githubusercontent.com/openpen-platform/OpenPen-plugins/main/community/plugins.json)
   in the catalog repository and look for your plugin id; the `latestVersion` field
   shows the version that was picked up.

To ship an update, bump `version`, then repeat step 4. A release whose `plugin.json`
version is not higher than the listed one is ignored. Removing the topic, making the
repository private or archiving it removes the plugin on a later scan.

If your plugin does not show up, the scanner logs why it skipped each repository (for
example a missing `.zip` asset, a scope that does not match the owner, or a
draft release) in the catalog repository's `Update community index` workflow runs.
Maintainers can exclude a plugin, a repository or an owner through
`community/blocklist.json`.

### Official catalog

Plugins in the official catalog can be installed by id with
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
