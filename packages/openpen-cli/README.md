# openpen-cli

Install and manage [OpenPen](https://github.com/openpen-platform/openpen) plugins
from local paths or GitHub releases, and scaffold, pack, and publish your own.

## Usage

```bash
npx openpen-cli create @scope/name
npx openpen-cli plugin add <source>
npx openpen-cli plugin install @scope/name
npx openpen-cli plugin list
npx openpen-cli plugin remove <plugin-id>
npx openpen-cli pack
npx openpen-cli publish
```

`<source>` can be:

- A local project directory: `./my-plugin` or `/abs/path/my-plugin`
- A GitHub URL: `https://github.com/user/repo` or `github:user/repo`
- A GitHub release zip URL: `https://github.com/user/repo/releases/download/v1.0.0/plugin.zip`

npm package names are not supported. A local directory must already be built
(`dist/` present); the CLI does not run a build. It copies `dist/`, `plugin.json`,
and `locales/` to `~/.openpen/plugins/<plugin-id>/`.

Always run it as `npx openpen-cli`, never `npx openpen` (an unrelated npm package).
See the [CLI reference](https://github.com/openpen-platform/openpen/blob/main/docs/reference/openpen-cli.md)
for every command.

## More

- [Build Your First Plugin tutorial](https://github.com/openpen-platform/openpen/blob/main/docs/tutorials/build-your-first-plugin.md)
- [Module Architecture](https://github.com/openpen-platform/openpen/blob/main/docs/concepts/module-architecture.md)
- [Trust Model](https://github.com/openpen-platform/openpen/blob/main/docs/concepts/trust-model.md)

## License

MIT
