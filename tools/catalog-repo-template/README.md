# OpenPen-plugins — Community Plugin Catalog

> **TEMPLATE NOTICE**
> This directory is the seed template for the `OpenPen-plugins` GitHub repository.
> Copy this directory to a new GitHub repo when ready to launch the plugin marketplace.
> See the setup checklist at the bottom of this file.

---

## What is this?

This repository is the community plugin catalog for [OpenPen](https://github.com/openpen-platform/openpen).
It mirrors the Obsidian community-plugins pattern:

- Plugin authors submit pull requests to register or update their plugins.
- A GitHub Actions bot validates every PR automatically.
- Registration PRs (first-time) receive a human review from a maintainer.
- Update PRs (version bumps) are auto-merged by the bot after validation.
- A CI workflow regenerates `plugins.json` (the aggregate catalog index) after each merge.

## Structure

```
OpenPen-plugins/
├── plugins.json                    # auto-generated aggregate — do not edit by hand
└── plugins/
    └── <scope>/
        └── <name>/
            └── manifest.json       # one file per plugin (@scope/name)
```

The directory layout mirrors the `@scope/name` plugin id format used by OpenPen.

## Governance

- `@openpen/*` and `@core/*` scopes are reserved for OpenPen official modules.
  Registration PRs claiming these scopes are automatically rejected.
- Plugin IDs are immutable once registered. The id `@scope/name` is permanently
  associated with the GitHub account that first registered it.
- Update PRs are validated against the original `ownerId` (GitHub numeric user/org id)
  to prevent ownership drift after account renames or repo transfers.

For the full governance specification, see the
[publishing guide](https://github.com/openpen-platform/openpen/blob/main/docs/guides/publishing.md).

## For plugin authors

See [build-your-first-plugin.md](https://github.com/openpen-platform/openpen/blob/main/docs/tutorials/build-your-first-plugin.md)
for the full walkthrough, including how to use `openpen create`, `openpen pack`, and `openpen publish`.

**TL;DR publish flow:**
1. `npx openpen create @yourscope/your-plugin-name` — scaffold
2. Develop + `npm run build`
3. `npx openpen pack` — create the release zip
4. Create a GitHub Release and attach the zip
5. `npx openpen publish` — open a Registration PR here

## For maintainers — setup checklist

When creating this repo from the template:

- [ ] Set `OPENPEN_CATALOG_OWNER` env in the OpenPen host `app.config.js` (or rely on default)
- [ ] Configure branch protection on `main`: require status checks from `catalog-bot.yml`
- [ ] Add a `GITHUB_TOKEN` secret if the default token lacks write access to the repo
- [ ] Seed `plugins.json` with `{"schemaVersion":2,"plugins":[]}` (already done below)
