# tools/

Dev-only utilities and templates that ship in the repo but are **not** part of OpenPen's runtime. None of this is bundled into the app or required to run / develop OpenPen itself.

## Subfolders

### `catalog-repo-template/`

Bootstrap template for the [OpenPen-plugins](https://github.com/openpen-platform/openpen-plugins) community catalog repo — a separate GitHub repository where plugin authors register their plugins via PRs (Obsidian-style community-plugins workflow).

This directory is the source of truth for the catalog template **until** the live catalog repo is bootstrapped. To launch the catalog:

1. Copy `tools/catalog-repo-template/` to a new GitHub repo.
2. Follow the setup checklist in its [`README.md`](./catalog-repo-template/README.md).
3. Enable the GitHub Actions bot.

After the catalog repo is live, updates to the validator, workflows, and PR templates should be made on the live repo (not here).

## Adding tools

Things that belong here:

- Templates for related public repositories
- Standalone scripts for one-off migrations or analyses
- Dev-only utilities that have their own deps / tests and don't fit `scripts/`

If a tool has its own `package.json` and tests (like `catalog-repo-template/`), put it in its own subfolder.
