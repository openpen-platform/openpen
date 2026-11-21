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
   so build output and the packed zip stay out of the repository. A project from the current
   `create` already has this file; only a project generated by an older CLI version may lack
   it, and then you create it with those three lines. Likewise, only in a project from an
   older CLI version, if the generated README has links that start with `../../docs`, replace them
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
   skip it for the community list. Some older CLI versions print the hint with a shortened
   command name: the command name is always `npx openpen-cli`, because the bare
   `openpen` package on npm is an unrelated tool. The release must be published,
   not a draft or a prerelease. The scanner uses the latest release and its first
   `.zip` asset, which must have `plugin.json` at the zip root.
   If `plugin.json` lists marketplace images, commit and push them before you
   create the release (see Marketplace icon, screenshots and Chinese descriptions
   below).
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
your GitHub Release. It checks the release, confirms that your GitHub login equals
the scope of the plugin id (organization scopes are not supported here; the official
`@openpen` scope is submitted directly to the catalog repository by organization members), and opens a pull request against the catalog: a
Registration PR for a first submission, an Update PR for a new version. The plugin repository must also be under your personal account and named after the plugin (`publish` records it as `https://github.com/<your-login>/<plugin-name>`); the catalog bot compares the repository owner with the registering account, and a repository under an organization or another account is rejected. A first
submission is reviewed by a maintainer before it is merged. See section 7 of
[Build your first plugin](../tutorials/build-your-first-plugin.md)
for the full walkthrough and [`reference/openpen-cli.md`](../reference/openpen-cli.md)
for what each step does.

### Marketplace icon, screenshots and Chinese descriptions

Three optional `plugin.json` fields give your plugin an icon, screenshots and
Chinese descriptions in the Marketplace: `icon`, `screenshots` and
`descriptionLocalized`. The community scanner copies them from the `plugin.json`
inside your release zip into your entry; for the official catalog they have to be in
the submitted manifest (see below). They are optional for third-party plugins;
`@openpen/*` plugins must have all three (see the official plugin requirements below).

```json
{
  "id": "@alice/todo-app",
  "name": "Todo App",
  "version": "1.1.0",
  "author": "alice",
  "description": "Keeps a short to-do list on top of the screen you are sharing.",
  "descriptionLocalized": {
    "zh-Hant": "在分享中的畫面上放一份簡短的待辦清單。",
    "zh-Hans": "在共享中的画面上放一份简短的待办清单。"
  },
  "icon": ".github/marketplace/icon.png",
  "screenshots": [
    {
      "src": ".github/marketplace/cover.png",
      "alt": "A to-do list with three items floats over a slide deck."
    },
    {
      "src": ".github/readme-demo.gif",
      "alt": "An item is added, ticked off and dragged to the bottom of the list."
    }
  ],
  "minAppVersion": "1.0.0",
  "renderer": "dist/renderer.js"
}
```

| Field | Format and limits |
| --- | --- |
| `icon` | Path to a `.png` file in your repository. The image is 256×256 pixels and at most 256 KB. |
| `screenshots` | Array of 1–5 items, each with only `src` and `alt`. The first item is the cover on the Marketplace card and must be a still `.png`, `.jpg` or `.jpeg`; the others may also be `.gif`. All screenshots of one plugin have aspect ratios within 1% of each other, are at least 960 px wide, and are at most 5 MB each. |
| `src` (and `icon`) | Relative path in your repository, with `/` between segments. It must not start with `/`, contain a `..` segment, be a URL or start with a scheme such as `https:`, or contain backslashes or control characters. The file must be in the repository at the release tag. |
| `alt` | English plain text, 1–200 characters, saying what the screenshot shows. The catalog counts it as English when it has at least one Latin letter and no letters from another script. |
| `descriptionLocalized` | Object with only the keys `zh-Hant` (Traditional Chinese) and `zh-Hans` (Simplified Chinese). Each value is plain text of 1–80 characters; a Chinese character counts as one. Other keys are ignored. |
| Any text value | A value that contains control characters or bidirectional override or isolate characters (U+202A–U+202E, U+2066–U+2069 and similar) breaks the rules. |

**Where the image files go.** The release zip holds only `plugin.json`, `dist/` and
`locales/`, so an image elsewhere in your repository, such as `.github/marketplace/`,
is not packed, while an image you put under `dist/` or `locales/` is packed with the
plugin. Either way the catalog does not read images from the zip. The catalog links each image to your
repository at the release tag, as
`https://raw.githubusercontent.com/<owner>/<repo>/<tag>/<src>` (the same for
`icon`), where `<tag>` is the tag of the release it read. Put the images in
`.github/marketplace/`; a README demo GIF can be listed where it is, for example
`.github/readme-demo.gif`. Commit and push the image files before you create the
release. If the tag does not exist yet, `gh release create v<version> <zip>` creates
it from the latest commit on the default branch, and an image pushed after that is
not on the tag, so its link fails until your next release. To check, run
`git fetch --tags` and then `git ls-tree -r --name-only v<version>`, and look for
each image path in the list, or open each image URL from your catalog entry in a
browser.

**What the catalog does with the fields.**

- Community list: the scanner copies the fields that meet the rules into your entry
  in `community/plugins.json` and leaves out the ones that do not; your plugin is
  still listed. If any screenshot item breaks a rule, the whole `screenshots` field
  is left out, so the second screenshot never becomes the cover. Each field left out
  is logged in the `Update community index` workflow run as
  `drop listing field of <owner>/<repo>: <reason>`. The scanner checks only the
  values in `plugin.json`; it does not download the images, so it does not catch an
  image that is missing from the tag or breaks the size limits. To confirm, find
  your plugin id in `community/plugins.json`: `icon` and each `screenshots[].src`
  are URLs that point at your release tag.
- Official catalog: nothing copies the fields automatically. `npx openpen-cli publish`
  does not write them into the manifest it submits, so the entry has no icon,
  screenshots or Chinese descriptions until they are added to the manifest, for
  example with the catalog repository's `scripts/sync-listing.mjs`, which writes them
  from the release `plugin.json`. The catalog bot compares the manifest with the
  `plugin.json` in your release: fields the manifest carries must match what your
  `plugin.json` yields under the rules above. For a third-party plugin, a manifest
  that leaves them out only gets a note in the bot's comment; for an `@openpen/*`
  plugin, a field that is in `plugin.json` but missing from the manifest fails the
  check.

**Official plugin requirements.** An `@openpen/*` plugin must meet all of the
following when it is first listed and in every update. Other scopes are encouraged
to follow them, and the catalog does not reject other scopes for missing them. This
includes item 4: the catalog does not check how other scopes write `description`.

1. An `icon`: a 256×256 PNG that is clear on both light and dark backgrounds.
2. 1–5 `screenshots` with matching aspect ratios, at least 960 px wide, including at
   least one animated recording of the plugin in use on the overlay. They show only
   what the plugin really does, with no personal data and no other brands'
   trademarks.
3. An `alt` on every screenshot that says what it shows.
4. A `description` that is one English sentence of 50–155 characters, starting
   with a verb and ending with a period.
5. `descriptionLocalized` with both `zh-Hant` and `zh-Hans`.
6. The icon, screenshots and descriptions are declared in `plugin.json`, and the
   image files are in the repository and published with the release tag. A
   screenshot may be the same file as the README demo image.

The catalog's pull request check (`scripts/validate-pr.mjs`) rejects an
`@openpen/*` submission that lacks `icon`, `screenshots`, `zh-Hant` or `zh-Hans`,
breaks any rule in the table above, or has an image that is not on the tag, whose
bytes do not match its file extension, an animated cover, an icon that is not
256×256 or is over 256 KB, or a screenshot that is over 5 MB, narrower than 960 px,
or more than 1% off the cover's aspect ratio. Maintainers review the rest by hand:
whether the icon is clear, whether a screenshot shows the plugin on the overlay,
personal data and trademarks, and how the `description` is written.

### Removing a plugin

There is no self-service takedown for the official catalog: `publish` only opens Registration and Update PRs, and the CLI has no yank or tombstone command. To have a plugin removed, open an issue in the [OpenPen-plugins issue tracker](https://github.com/openpen-platform/OpenPen-plugins/issues) naming the plugin id and the reason. Catalog maintainers set the plugin's `state`:

- `yanked`: the entry stays in the catalog and is still listed in the Marketplace, with no separate warning on the card. Installing it by id (from the Marketplace or with `npx openpen-cli plugin install @scope/name`) fails with a message that the plugin was yanked and points to installing a specific zip URL directly.
- `tombstoned`: the entry is dropped from the public index and Marketplace and installation by id is blocked. The id stays reserved and cannot be registered again. The install error for a tombstoned plugin says it was permanently removed for security reasons.

A PR that deletes a manifest is not treated as an update: the catalog bot comments that a maintainer decides. Users who already installed the plugin keep it until they run `npx openpen-cli plugin remove @scope/name`. A plugin on the community list is removed differently: see the end of the community list section above.

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
