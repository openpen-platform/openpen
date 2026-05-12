# Trust Model

OpenPen plugins run with **full access** to the host renderer process.
This page explains what that means and how to install plugins safely.

---

## User-installed trust

When you install a plugin, it gets:

- Full access to `window.openPenApi` — every IPC call the host exposes
- Full access to the shared Vue instance and all reactive state
- Full access to the DOM — including UI owned by other plugins and the host
- Network access via `fetch` / `XMLHttpRequest`

This is a deliberate choice. Plugins can build powerful integrations without
permission friction during the formative phase of the ecosystem. Requiring a
sandbox before the contribution slot API is battle-tested would have slowed
plugin development for little real-world gain.

### Install-time safety

Plugin install is pure file extraction — no code executes during install.
The OpenPen CLI and GUI both enforce:

- No `npm install` / `npm run build` during install
- No shell script execution at any stage
- The plugin bundle contains only pre-built artifacts (`plugin.json` + `dist/`)

Code execution happens exactly once: when the plugin is **loaded** by the
runtime after a restart. This means the install step itself carries zero
code-execution risk; the risk is deferred to the load step, where the module
loader can isolate and roll back failures.

### Baseline protections

OpenPen enforces the following baseline:

| Protection | What it does |
|------------|--------------|
| `contextIsolation: true` | The Node.js context and the renderer context are isolated — plugins cannot call raw Node.js APIs directly from renderer code |
| `nodeIntegration: false` | No `require('fs')` or `require('path')` available in the renderer |
| `webSecurity: true` | Standard CORS and mixed-content rules apply (Electron's default; not disabled) |
| Outbound-request audit log | Every outbound HTTP(S) request made by any plugin is recorded in the in-memory audit log ring buffer, accessible via openPenApi.getAuditLogEntries() in DevTools. A dedicated UI panel is planned. |

These mitigate accidental misuse. They do **not** stop deliberate attack by a
plugin you installed.

---

## What this model cannot stop

A plugin you install can:

- Read files in your home directory (via the `callMain` bridge to main-process handlers)
- Write files to arbitrary paths on your machine
- Send HTTP requests to any server
- Subscribe to all OpenPen events, including drawing stroke data
- Modify the host UI in arbitrary ways — including hiding buttons or injecting content

**Before installing any plugin, evaluate the source yourself.** The plugin is
JavaScript / TypeScript that runs on your machine with your permissions. Treat it
the way you would treat installing any open-source desktop application from GitHub.

### A documented attack on the same trust model

In April 2026, Elastic Security Labs documented the **PHANTOMPULSE campaign**
targeting Obsidian users. Attackers used social engineering to share a malicious
vault with financial and cryptocurrency professionals. The vault contained two
legitimate community plugins — **Shell Commands** and **Hider** — pre-configured
to execute attacker-controlled commands silently.

The attack required no vulnerability in Obsidian itself. It exploited the trust
model exactly as designed: the user installed a plugin, and the plugin had full
access to run arbitrary shell commands.

OpenPen's model has the same shape and the same risk surface. The only
mitigation available is **user vigilance about what you install**.

References:
- [Phantom in the vault — Elastic Security Labs](https://www.elastic.co/security-labs/phantom-in-the-vault)
- [Obsidian Plugin Abuse Delivers PHANTOMPULSE RAT — The Hacker News](https://thehackernews.com/2026/04/obsidian-plugin-abuse-delivers.html)

---

## How to install plugins safely

1. **Prefer named, well-known authors.** A plugin from a developer with a public
   GitHub history and other published projects is much lower risk than one from
   an anonymous account.

2. **Read the source.** The plugin is JavaScript / TypeScript — usually a single
   `dist/renderer.js` file. If you cannot or will not read it, treat installing
   it the same as you would treat running a binary from an unknown source.

3. **Watch the audit log.** Network requests from installed plugins are recorded
   in the audit log. Query it via openPenApi.getAuditLogEntries() in DevTools;
   a dedicated UI panel is planned. Unexpected destinations are a red flag.

4. **Uninstall unused plugins.** Every inactive plugin is still loaded. Smaller
   attack surface means fewer potential entry points.

5. **Report suspicious behavior.** If a plugin does something unexpected — makes
   unexplained network calls, modifies files, or alters the host UI — report it.
   See [`SECURITY.md`](../../SECURITY.md) for the responsible-disclosure process.

---

## Reporting concerns

If you discover a plugin behaving maliciously, or a vulnerability in OpenPen's
plugin-loading mechanism itself, report it via [`SECURITY.md`](../../SECURITY.md).

Do not file public GitHub issues for security vulnerabilities.
