<!-- Registration PR: first-time submission of a new plugin to the catalog. -->
<!-- The bot will validate this PR automatically. A maintainer reviews after the bot passes. -->

## Plugin registration: `@scope/name`

### Checklist (author)

- [ ] I have read [CONTRIBUTING.md](../CONTRIBUTING.md)
- [ ] My GitHub login matches the `scope` in the plugin id
- [ ] A GitHub Release exists with the attached zip at the URL in `manifest.json`
- [ ] I ran `openpen publish` to generate this PR automatically (recommended)
- [ ] `plugin.json` declares at least one contribution slot

### Checklist (bot — filled automatically)

- [ ] scope matches submitter login
- [ ] id is not already registered
- [ ] name is not a near-duplicate of an existing plugin in the same scope
- [ ] minAppVersion is valid semver
- [ ] Release zip is reachable and sha256 matches
- [ ] plugin.json declares at least one slot

### Summary

<!-- Brief description of what this plugin does. -->
