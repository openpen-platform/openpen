# Licensing

OpenPen uses a **layered license model** to balance copyleft protection
of the host with plugin ecosystem freedom:

| Component | License | Notes |
|-----------|---------|-------|
| OpenPen host application | [GPL-3.0-or-later](../LICENSE) **+ Linking Exception** | Modifications to OpenPen itself remain GPL-3.0-or-later. Plugins linked through the official `@openpen/module-api` SDK may use any license. |
| [`@openpen/module-api`](https://www.npmjs.com/package/@openpen/module-api) | [MIT](../packages/module-api/LICENSE) | Plugin SDK — depend on it under any license, including proprietary. |
| [`@openpen/build`](https://www.npmjs.com/package/@openpen/build) | [MIT](../packages/build-cli/LICENSE) | Plugin build CLI. |
| [`openpen-cli`](https://www.npmjs.com/package/openpen-cli) | [MIT](../packages/openpen-cli/LICENSE) | Plugin install CLI. |

**What this means:**
- ✅ You can write closed-source / commercial plugins for OpenPen.
- ✅ You can sell plugins under any license you choose.
- ❌ You cannot fork OpenPen, rename it, and sell the modified host as
  a closed-source product. Modifications to OpenPen itself remain GPL-3.0-or-later.

See [`LICENSE`](../LICENSE) for the full GPL-3.0-or-later text and the Linking
Exception clause.

**Clarifications:**

- **Dynamic vs static linking** — plugins built through the official
  `@openpen/build` CLI are dynamically linked against OpenPen at runtime
  via the importmap mechanism. Whether a plugin is bundled, transpiled,
  minified, or distributed as separate files does not affect the Linking
  Exception — what matters is that the plugin uses the public
  `@openpen/module-api` SDK surface.

- **Copying source code from the OpenPen host** — the host application
  itself (`src/`, `electron/`) is GPL-3.0-or-later. If a plugin **copies** code
  from these directories (rather than importing through the SDK), the
  plugin includes GPL-3.0-or-later code and must itself be GPL-3.0-or-later as a derivative
  work. This is GPL's standard derivative-work clause, not an OpenPen-
  specific rule.

- **UIKit components are MIT** — the `@openpen/module-api/uikit`
  wrappers (`AppPopover`, `AppDialog`, `AppSlider`, etc.) are part
  of the MIT-licensed SDK package. You may copy, modify, and redistribute
  them in your plugin under any license you choose.

- **Redistributing OpenPen host** — if you redistribute the OpenPen
  application itself (modified or unmodified, e.g. shipping an Electron
  build to end users), you must comply with GPL obligations: provide
  source code, preserve license notices, and include the `LICENSE` file.
  The MIT-licensed SDK packages do not exempt redistributors of the
  host from these GPL obligations.
