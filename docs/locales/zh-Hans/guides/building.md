---
title: 从源码构建 OpenPen
description: 从源码树为 macOS、Windows 和 Linux 生成可分发的 OpenPen 安装包。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hans
---

# 从源码构建 OpenPen

本指南介绍如何为 macOS、Windows 和 Linux 生成可分发的安装包。

## 前置条件

- Node.js 20+，npm 9+
- Git

```bash
git clone https://github.com/openpen-platform/openpen
cd openpen
npm install
```

---

## 构建命令

| 命令 | 输出 |
|---------|--------|
| `npm run dist:mac` | macOS `.dmg`（arm64 + x64） |
| `npm run dist:win` | Windows NSIS 安装程序 `.exe`（x64 + arm64） |
| `npm run dist:linux` | Linux `.AppImage`（x64 + arm64） |
| `npm run dist` | 当前平台（自动检测） |

每个 `dist*` 命令按顺序执行以下三个阶段：

1. **`npm run build`** — TypeScript 类型检查（`vue-tsc`）和 `vite build`（主机包 + 运行时包）。
2. **`npm run test:prod-smoke`** — 针对生产包（`tests/e2e/prod-smoke.spec.js`）运行 Playwright 冒烟测试。这可在发布前捕获开发/生产环境一致性问题。Playwright Electron 驱动由 `npm install` 安装，无需额外下载浏览器。
3. **`electron-builder`** — 将生产包打包为目标平台的安装程序。

输出文件位于 `release/` 文件夹下。如果冒烟测试阶段失败，则不会调用 `electron-builder`。

---

## 各平台注意事项

### macOS

需要在 macOS 上构建。为 Apple Silicon（arm64）和 Intel（x64）分别生成 `.dmg` 文件：

```bash
npm run dist:mac
# → release/OpenPen-<version>-arm64.dmg
# → release/OpenPen-<version>-x64.dmg
```

**产物命名** — 每个 macOS `.dmg` 均带有 `-arm64` 或 `-x64` 后缀（通过 `package.json` 中的 `mac.artifactName` 设置）；默认情况下 x64 会省略后缀，导致 Apple Silicon 用户误用 Intel 构建版本。

**首次启动（临时签名构建）** — macOS Gatekeeper 会在首次运行时阻止程序。右键点击 `.app` → **打开**，然后确认。或在终端中移除隔离标记：

```bash
xattr -cr /Applications/OpenPen.app
```

**代码签名（用于公开发布）** — 要生成经过正式签名和公证的构建版本，请设置以下环境变量：

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your_password
export APPLE_ID=your@apple.id
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX
npm run dist:mac
```

> **Hardened Runtime + 权限声明**：Apple 公证要求设置 `hardenedRuntime: true`。没有真实的 Developer ID 时，临时签名的子包（Electron Framework、Helper 应用）会产生不匹配的 Team ID，导致 macOS 跨团队库验证失败，提示 "cannot be opened because a problem occurred"。`build/entitlements.mac.plist` 包含 `com.apple.security.cs.disable-library-validation`，以确保本地临时构建仍可启动。真实 Developer ID 发布版本的所有子包共享一致的 Team ID，无需依赖此权限声明，但保留它也无妨。

---

### Windows

**必须在 Windows 机器上运行**（或通过 CI）。为 x64 和 arm64 生成标准 NSIS 安装程序。

```bash
npm run dist:win
# → release/OpenPen Setup <version>.exe
```

**代码签名** — 对于未签名的 `.exe` 文件，Windows SmartScreen 会发出警告。使用 EV 证书签名的方法：

```bash
set CSC_LINK=C:\path\to\certificate.pfx
set CSC_KEY_PASSWORD=your_password
npm run dist:win
```

---

### Linux

生成可移植的 `.AppImage`，无需安装即可在大多数 x86_64 和 arm64 发行版上运行。

```bash
npm run dist:linux
# → release/OpenPen-<version>.AppImage
# → release/OpenPen-<version>-arm64.AppImage
```

赋予 AppImage 可执行权限后直接运行：

```bash
chmod +x OpenPen-*.AppImage
./OpenPen-*.AppImage
```

---

## 从 macOS 进行跨平台构建

electron-builder 可以在 macOS 主机上构建 Windows 和 Linux 安装包，但存在一些限制：

| 目标 | 从 macOS 构建 | 备注 |
|--------|-----------|-------|
| macOS `.dmg` | ✅ 原生支持 | |
| Linux `.AppImage` | ✅ 可用 | 需要 Docker 或本地构建工具 |
| Windows `.exe` | ⚠️ 部分支持 | 签名需要 Windows 环境或证书服务 |

如需可靠的多平台发布，建议使用在三种操作系统上分别运行任务的 CI 服务。
