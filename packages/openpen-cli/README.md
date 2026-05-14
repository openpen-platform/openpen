# openpen-cli

Install and manage [OpenPen](https://github.com/openpen-platform/openpen) plugins
from local paths, GitHub, or npm.

## Usage

```bash
npx openpen-cli plugin add <source>
npx openpen-cli plugin list
npx openpen-cli plugin remove <plugin-id>
```

`<source>` can be:

- A local project directory: `./my-plugin` or `/abs/path/my-plugin`
- A GitHub URL: `https://github.com/user/repo` or `github:user/repo`
- An npm package name: `openpen-my-plugin`

For local and GitHub sources the CLI runs `npm install` and `npm run build`
in the source directory, then copies the build output and `plugin.json` to
`~/.openpen/plugins/<plugin-id>/`.

## More

- [Build Your First Plugin tutorial](https://github.com/openpen-platform/openpen/blob/main/docs/tutorials/build-your-first-plugin.md)
- [Module Architecture](https://github.com/openpen-platform/openpen/blob/main/docs/concepts/module-architecture.md)
- [Trust Model](https://github.com/openpen-platform/openpen/blob/main/docs/concepts/trust-model.md)

## License

MIT
