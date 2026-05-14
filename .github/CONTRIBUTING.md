# Contributing to OpenPen

Thanks for considering a contribution. OpenPen is a cross-platform Electron + Vue 3 transparent overlay app with a plugin SDK. This guide covers the workflow for code, docs, and config contributions.

> Building an **OpenPen plugin** rather than contributing to OpenPen core? See [`docs/tutorials/build-your-first-plugin.md`](../docs/tutorials/build-your-first-plugin.md) — that's a different (and simpler) flow.

## Quick start

1. Fork the repo and clone your fork
2. `npm install` (npm workspaces — **not** pnpm or yarn)
3. `npm run dev` to launch the app in dev mode
4. Make your changes on a feature branch (see below)
5. Open a PR against `main`

## Branch & commit convention

OpenPen uses [Conventional Commits](https://www.conventionalcommits.org/) and [release-please](https://github.com/googleapis/release-please) for automated versioning. The PR title is the most important thing — it becomes the squash commit message and release-please reads it to decide the next version.

### Branch names

`<type>/<scope-or-description>` — examples:

- `feat/laser-pointer-tool`
- `fix/settings-dim-click`
- `docs/plugin-quickstart-typo`
- `chore/bump-electron`

Allowed types: `feat`, `fix`, `docs`, `chore`, `build`, `ci`, `refactor`, `test`, `style`, `perf`, `revert`.

### PR title (Conventional Commits)

```
fix(settings-window): prevent dimmed main from stealing clicks
feat(canvas): add laser pointer module
docs(plugin-quickstart): correct degit subpath
```

Effect on the next release:

| PR title prefix | Next version bump |
|---|---|
| `feat:` | minor (1.x.0) |
| `fix:` | patch (1.0.x) |
| `docs:` `chore:` `ci:` `build:` `style:` `test:` `refactor:` | no bump |
| `feat!:` or footer `BREAKING CHANGE:` | major (2.0.0) — use sparingly, only when there is a true contract break |

## Merge strategy

All PRs are **squash-merged**. `main` stays linear and each commit on `main` corresponds to exactly one merged PR. Commit freely on your feature branch — your branch's commit history is discarded after the squash.

`main` is configured to require:
- All CI checks green (lint / type-check / unit tests / e2e prod smoke)
- A pull request (no direct pushes to `main`)
- Linear history (no merge commits)

## Local checks before pushing

```bash
npm run lint
npm run type-check
npm run test:unit
npx playwright test tests/e2e/<scope>/   # scope-targeted e2e
```

Run the full `npx playwright test` suite only as the final pre-commit gate — it takes ~20 minutes.

## UI / visual changes

Browser preview at `localhost:5173` looks **completely different** from the real Electron app (transparent window, drawing overlay, system-tray behaviour). For any UI sign-off:

- Visual evidence MUST come from desktop-level system screenshots while the real app is running
- Playwright `win.screenshot` and Vite browser screenshots are NOT acceptable visual evidence

See `CLAUDE.md` → "TESTING STANDARD" for details.

## Plugin SDK changes

If your PR touches `packages/module-api/`, `packages/build-cli/`, `packages/openpen-cli/`, `packages/plugin-manager/`, or `packages/plugin-starter/`:

- Update the corresponding `packages/*/README.md` if behaviour or commands change (the README is what npmjs.com displays to plugin authors)
- Update `docs/` guides / tutorials / reference if the docs reference the changed surface
- Re-run the fresh plugin author flow end-to-end if your change affects scaffolding or build

## Security

Vulnerabilities and trust-model concerns: see [`SECURITY.md`](../SECURITY.md). Do **not** open a public issue for security reports.

## License

By contributing you agree your contributions are MIT-licensed (matching the project).
