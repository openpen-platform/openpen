<!--
PR title MUST follow Conventional Commits format:
  <type>(<scope>): <description>

Examples:
  fix(settings-window): prevent dimmed main from stealing clicks
  feat(canvas): add laser pointer module
  docs(plugin-quickstart): correct degit subpath

Types: feat / fix / docs / chore / build / ci / refactor / test / style / perf / revert
Effect on next release:
  - feat:           minor bump (1.x.0)
  - fix:            patch bump (1.0.x)
  - docs/chore/...: no bump
  - feat!:          major bump (2.0.0) — use sparingly
-->

## Summary

<!-- One paragraph: what changed and why. -->

## Changes

<!-- Bullet per substantive change. Keep it short — diff already tells the "what". -->

-

## Definition of Done

<!-- Each item is defined in CONTRIBUTING.md: https://github.com/openpen-platform/openpen/blob/main/CONTRIBUTING.md#definition-of-done
     Items marked (if ...) apply only when their condition is met; otherwise tick them and add "n/a". -->

- [ ] Checks pass
- [ ] No regressions
- [ ] Scope matches the description
- [ ] No leftovers
- [ ] Follows existing conventions
- [ ] Docs updated (if user-visible or plugin-facing behaviour changes)
- [ ] Verified in the real app (if the change is visual)
- [ ] Plugin author flow still works (if the change touches `packages/`)
- [ ] Signed off

## Notes for reviewer

<!-- Anything that needs a second pair of eyes: hidden trade-offs, follow-ups, deferred work. Delete this section if none. -->
