# Security Policy

## Supported versions

We support the latest minor release of OpenPen. Older releases receive security
fixes only when the affected code is still present on the latest release branch.

| Version       | Supported |
| ------------- | --------- |
| Latest minor  | Yes       |
| Older minors  | No        |

## Reporting a vulnerability

**Preferred:** open a private advisory through GitHub Security Advisories:
<https://github.com/openpen-platform/openpen/security/advisories/new>

**Fallback:** if you cannot use GitHub, email **navishachiku@gmail.com** with
the subject prefix `[security]` and a clear description.

Please include:

- A short summary of the issue.
- Steps to reproduce, or a proof-of-concept.
- The OpenPen version, OS, and any relevant plugin ids.
- The impact you believe a successful exploit would have.

**Do not open public GitHub issues for security vulnerabilities.** Public issues
are visible to everyone before a fix is available.

## What to expect

- **Acknowledgement** within 5 business days of receipt.
- **Initial triage** within 14 days, including a tentative severity and a
  decision on whether the report is in scope.
- **Coordinated disclosure** once a fix is ready. We aim to credit reporters in
  the release notes unless you ask to stay anonymous.

If we cannot reach you for clarification, the advisory may stall; please respond
within 30 days of our follow-up so we can keep the report moving.

## Scope

In scope:

- The OpenPen host application (`electron/`, `src/`).
- The plugin runtime: manifest loading, sandboxing, IPC bridge, network audit
  log, and the `openpen-plugin://` URL scheme.
- The published packages: `openpen-cli`, `@openpen/module-api`,
  `@openpen/build`, and `@openpen/plugin-manager`.

Out of scope:

- Vulnerabilities in third-party plugins themselves. Plugins are untrusted code
  by design (see [`docs/concepts/trust-model.md`](docs/concepts/trust-model.md));
  report those to the plugin author. If a plugin's malicious behaviour is only
  possible because the OpenPen runtime allows it, that *is* in scope — please
  report it.
- Vulnerabilities in upstream dependencies (Electron, Chromium, Vue, Reka UI,
  etc.) that have already been disclosed upstream. We will track the upstream
  fix and ship an updated dependency; you do not need to file a separate report
  with us.
- Social-engineering attacks against the maintainer's accounts.

## Disclosure policy

We follow coordinated disclosure. Once a fix is released, we publish the
advisory and request a CVE through GitHub. Please give us a reasonable window
to ship the fix before public disclosure — typically 90 days, shorter for
active exploitation.

Thank you for helping keep OpenPen and its users safe.
