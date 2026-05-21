---
title: Building OpenPen from Source
description: Produce a distributable OpenPen package for macOS, Windows, and Linux from the source tree.
---

# Building OpenPen from Source

This guide covers how to produce a distributable package for macOS, Windows, and Linux.

## Prerequisites

- Node.js 20+, npm 9+
- Git

```bash
git clone https://github.com/openpen-platform/openpen
cd openpen
npm install
```

---

## Build commands

| Command | Output |
|---------|--------|
| `npm run dist:mac` | macOS `.dmg` (arm64 + x64) |
| `npm run dist:win` | Windows NSIS installer `.exe` (x64 + arm64) |
| `npm run dist:linux` | Linux `.AppImage` (x64 + arm64) |
| `npm run dist` | Current platform (auto-detected) |

Every `dist*` command runs three stages in order:

1. **`npm run build`** — TypeScript type-check (`vue-tsc`) and `vite build` (host bundle + runtime bundles).
2. **`npm run test:prod-smoke`** — Playwright smoke test against the production bundle (`tests/e2e/prod-smoke.spec.js`). This catches dev/prod parity regressions before they ship. The Playwright Electron driver is installed by `npm install`; no extra browser download is required.
3. **`electron-builder`** — packages the production bundle for the target platform.

Output files land in the `release/` directory. If the prod-smoke stage fails, `electron-builder` is not invoked.

---

## Platform-specific notes

### macOS

Requires macOS to build. Produces a separate `.dmg` for Apple Silicon (arm64) and Intel (x64):

```bash
npm run dist:mac
# → release/OpenPen-<version>-arm64.dmg
# → release/OpenPen-<version>-x64.dmg
```

**Artifact naming** — every macOS `.dmg` carries an `-arm64` or `-x64` suffix
(set via `mac.artifactName` in `package.json`); the default would drop the
suffix on x64 and route Apple Silicon users to the Intel build by accident.

**First launch (ad-hoc signed build)** — macOS Gatekeeper will block the app on
first run. Right-click the `.app` → **Open**, then confirm. Or remove the
quarantine flag from Terminal:

```bash
xattr -cr /Applications/OpenPen.app
```

**Code signing (for public distribution)** — to produce a properly signed and
notarized build, set these environment variables:

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your_password
export APPLE_ID=your@apple.id
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX
npm run dist:mac
```

> **Hardened Runtime + entitlements**: `hardenedRuntime: true` is required for
> Apple notarization. Without a real Developer ID, ad-hoc-signed sub-bundles
> (Electron Framework, Helper apps) end up with mismatched team IDs and macOS's
> cross-team library validation refuses to launch the .app with "cannot be
> opened because a problem occurred". `build/entitlements.mac.plist` includes
> `com.apple.security.cs.disable-library-validation` so ad-hoc local builds
> still launch. Real Developer ID releases share a consistent team ID across
> sub-bundles and don't depend on this entitlement, but leaving it in is
> harmless.

---

### Windows

**Must run on a Windows machine** (or via CI). Produces a standard NSIS installer for x64 and arm64.

```bash
npm run dist:win
# → release/OpenPen Setup <version>.exe
```

**Code signing** — Windows SmartScreen will warn on unsigned `.exe` files. To sign with an EV certificate:

```bash
set CSC_LINK=C:\path\to\certificate.pfx
set CSC_KEY_PASSWORD=your_password
npm run dist:win
```

---

### Linux

Produces a portable `.AppImage` that runs on most x86_64 and arm64 distributions without installation.

```bash
npm run dist:linux
# → release/OpenPen-<version>.AppImage
# → release/OpenPen-<version>-arm64.AppImage
```

Make the AppImage executable and run it directly:

```bash
chmod +x OpenPen-*.AppImage
./OpenPen-*.AppImage
```

---

## Cross-platform builds from macOS

electron-builder can build Windows and Linux installers from a macOS host with some limitations:

| Target | From macOS | Notes |
|--------|-----------|-------|
| macOS `.dmg` | ✅ Native | |
| Linux `.AppImage` | ✅ Works | Requires Docker or local build tools |
| Windows `.exe` | ⚠️ Partial | Signing requires Windows or a certificate service |

For reliable multi-platform releases, use a CI service that runs jobs on all three OSes.
