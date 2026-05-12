# Contributing to OpenPen-plugins

## Submitting your plugin

### Prerequisites

- OpenPen v1.0+ installed on your development machine
- `openpen-cli` available (`npm install -g openpen-cli` or `npx openpen`)
- A GitHub account whose login matches the `scope` in your plugin id
- `gh` CLI installed and authenticated (`gh auth login`)

### Step-by-step

1. **Scaffold** a new plugin:
   ```bash
   npx openpen create @yourscope/your-plugin-name
   cd your-plugin-name
   npm install
   ```

2. **Develop** your plugin in `src/index.ts`. See
   [build-your-first-plugin.md](https://github.com/openpen-platform/openpen/blob/main/docs/tutorials/build-your-first-plugin.md)
   for the module API reference.

3. **Build** a production bundle:
   ```bash
   npm run build
   ```

4. **Pack** the distributable zip:
   ```bash
   npx openpen pack
   # Outputs: yourscope-your-plugin-name-1.0.0.zip
   # Prints: sha256: <hex>
   ```

5. **Create a GitHub Release** in your plugin repo:
   ```bash
   gh release create v1.0.0 ./yourscope-your-plugin-name-1.0.0.zip
   ```

6. **Publish** to this catalog:
   ```bash
   npx openpen publish
   # Opens a Registration PR in this repo
   ```

7. Wait for the bot to validate your PR, then for a maintainer to approve the registration.

---

## PR types

### Registration PR (first submission)

- Title format: `plugin: register @scope/name`
- Requires human review by a maintainer after the bot validation passes.
- The bot validates:
  1. `scope` matches the submitter's GitHub login
  2. `id` is not already registered (active or tombstoned)
  3. `name` within the same scope is not a near-duplicate (Levenshtein distance ≤ 2)
  4. `minAppVersion` is valid semver
  5. Release zip exists at the declared URL and sha256 matches
  6. `plugin.json` declares at least one contribution slot

### Update PR (version bumps)

- Title format: `plugin: update @scope/name v<version>`
- Fully automated — the bot merges after all checks pass. No human review needed.
- The bot additionally verifies:
  - `ownerId` matches the original registration (prevents repo-transfer hijacks)
  - `latestVersion` is newer than the current catalog entry (no downgrades)

---

## Plugin manifest schema

The file you submit is `plugins/<scope>/<name>/manifest.json`:

```json
{
  "id": "@alice/screenshot-annotator",
  "scope": "alice",
  "name": "screenshot-annotator",
  "ownerId": 12345678,
  "ownerLogin": "alice",
  "ownerType": "User",
  "description": "Draw on screenshots during screen sharing.",
  "minAppVersion": "1.0.0",
  "repo": "https://github.com/alice/openpen-screenshot-annotator",
  "latestVersion": "1.2.0",
  "releaseUrl": "https://github.com/alice/openpen-screenshot-annotator/releases/download/v1.2.0/alice-screenshot-annotator-1.2.0.zip",
  "sha256": "<hex>",
  "state": "active"
}
```

`openpen publish` generates this automatically — you do not need to write it by hand.

---

## Reporting issues

Open an issue in [openpen/openpen](https://github.com/openpen-platform/openpen/issues) for:
- CLI bugs
- Catalog bot false positives/negatives
- Policy questions
