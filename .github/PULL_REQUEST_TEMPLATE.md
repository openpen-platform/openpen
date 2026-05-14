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

## Test plan

- [ ] `npm run lint` passes
- [ ] `npm run type-check` passes
- [ ] `npm run test:unit` passes
- [ ] Scope-targeted e2e: `npx playwright test tests/e2e/<scope>/`
- [ ] Manual verification:
- [ ] (UI changes) Tested on macOS / Windows desktop screenshot evidence attached
- [ ] (Plugin SDK / docs changes) Fresh plugin author flow re-validated

## Notes for reviewer

<!-- Anything that needs a second pair of eyes: hidden trade-offs, follow-ups, deferred work. Delete this section if none. -->
