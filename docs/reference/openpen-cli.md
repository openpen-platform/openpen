# openpen CLI

The `openpen` CLI (`openpen-cli` package) manages plugin installation, packaging, and publishing
for OpenPen. Install it with:

```bash
npm install -g openpen-cli
# or use npx without installing:
npx openpen-cli <command>
```

---

## Commands

### `openpen create @scope/name`

Scaffold a new plugin from the official starter template.

**Behaviour:**
1. Validates that the input matches the `@scope/name` format.
2. Creates a subdirectory named after the `name` segment (e.g. `todo-app/`) in the current directory.
3. Copies the plugin starter template and fills in `plugin.json` with your `@scope/name`.
4. Prints next steps: `npm install` → develop → `npm run build` → `openpen pack`.

**Authentication:** Checks (but does not block on) whether the provided scope matches your
authenticated GitHub login. The real scope check happens during `openpen publish`.

---

### `openpen pack`

Bundle your plugin into a distributable zip file. Run this in the directory that contains
`plugin.json`.

**Prerequisites:** Your `dist/renderer.js` must already exist — run your build tool first
(e.g. `npx @openpen/build` or your own bundler).

**Behaviour:**
1. Reads `plugin.json` and parses the `id` (`@scope/name`) and `version`.
2. Validates `id` format and verifies `dist/renderer.js` exists.
3. Collects `plugin.json` + `dist/` + `locales/` (if present).
4. Writes `<scope>-<name>-<version>.zip` — for example, `@alice/todo-app` at `1.2.0`
   becomes `alice-todo-app-1.2.0.zip`.
5. Prints the output path and SHA-256 hash.

`openpen pack` **never runs a build for you** — call your build tool first.

---

### `openpen publish`

Submit a Registration PR or version-update push to the central
[OpenPen-plugins](https://github.com/openpen-platform/OpenPen-plugins) catalog.

**Prerequisites:** `plugin.json` must exist, a zip from `openpen pack` must exist, and the
GitHub Release for `v<version>` must be live with the zip attached.

**Behaviour:**
1. Validates `plugin.json` and the zip file.
2. Verifies the GitHub Release and attached asset exist.
3. Confirms your authenticated GitHub login matches the `scope` in the plugin `id`.
4. Computes the zip SHA-256.
5. Detects whether this is a first-time registration or a version update:
   - **New plugin** → opens a Registration PR (`register/<scope>-<name>`). Requires
     a maintainer review before merge.
   - **Version update** → opens an Update push PR (`update/<scope>-<name>-<version>`).
     Merged automatically by the catalog bot once all checks pass.
6. Prints the PR URL.

**Authentication:** Uses a GitHub OAuth token or the `GITHUB_TOKEN` environment variable.

---

### `openpen plugin install @scope/name`

Download and install a plugin from the central catalog.

**Behaviour:**
1. Fetches `plugins.json` from the catalog.
2. Looks up the entry for `@scope/name`; reports an error if the plugin is yanked or tombstoned.
3. Downloads the release zip.
4. Verifies the SHA-256 digest against the catalog record. Aborts and deletes the download on mismatch.
5. Extracts to `~/.openpen/plugins/@scope/name/`.
   If the directory already exists it is backed up first; the backup is removed on success
   and restored on failure.
6. Validates the extracted `plugin.json`.
7. Prompts you to restart OpenPen.

---

### `openpen plugin add <source>`

Install a plugin from a local directory or a remote release artifact.

**Accepted source forms:**

| Form | Example | Behaviour |
|------|---------|-----------|
| Local path | `./my-plugin/` | Copies `<path>/dist/`, `<path>/plugin.json`, and `<path>/locales/` (if present) into `~/.openpen/plugins/@<scope>/<name>/`. Reports a clear error if `dist/` is missing. |
| GitHub release zip URL | `https://github.com/owner/repo/releases/download/v1.0.0/plugin.zip` | Downloads and extracts the zip. |
| GitHub repository URL | `https://github.com/owner/repo` | Resolves the latest release and installs from its zip asset. |
| GitHub shorthand | `github:owner/repo` | Same as the repository URL above. |

**Not supported:** npm package names. OpenPen plugins are distributed through GitHub
Releases, not the npm registry. Use `openpen plugin install @scope/name` for catalog
installs, or one of the GitHub forms above for direct installs.

---

### `openpen plugin list`

List all plugins currently installed in `~/.openpen/plugins/`. Output uses the `@scope/name` format.

---

### `openpen plugin remove @scope/name`

Uninstall a plugin by deleting its directory from `~/.openpen/plugins/@scope/name/`.

---

## Plugin id format

Every OpenPen plugin has an id of the form `@scope/name`:

- Both `scope` and `name` are lowercase ASCII letters, digits, and hyphens.
- The first character of each segment must be a letter or digit (not a hyphen).
- Each segment is at most 39 characters.
- Regex: `/^@([a-z0-9][a-z0-9-]{0,38})\/([a-z0-9][a-z0-9-]{0,38})$/`

Examples: `@alice/todo-plugin`, `@openpen/freehand`.

The `@openpen/*` and `@core/*` scopes are reserved for official use and cannot be
registered by third parties.

---

## See also

- [Build your first plugin](../tutorials/build-your-first-plugin.md)
- [Plugin publishing guide](../guides/publishing.md)
- [Contribution Slot Catalog](./slots.md)
