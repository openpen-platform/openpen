---
title: 從原始碼建置 OpenPen
description: 從原始碼樹產生可發布的 OpenPen 套件，支援 macOS、Windows 與 Linux。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: zh-Hant
---

# 從原始碼建置 OpenPen

本指南說明如何為 macOS、Windows 與 Linux 產生可發布的套件。

## 前置條件

- Node.js 20+、npm 9+
- Git

```bash
git clone https://github.com/openpen-platform/openpen
cd openpen
npm install
```

---

## 建置指令

| 指令 | 輸出 |
|---------|--------|
| `npm run dist:mac` | macOS `.dmg`（arm64 + x64） |
| `npm run dist:win` | Windows NSIS 安裝程式 `.exe`（x64 + arm64） |
| `npm run dist:linux` | Linux `.AppImage`（x64 + arm64） |
| `npm run dist` | 目前平台（自動偵測） |

每個 `dist*` 指令會依序執行三個階段：

1. **`npm run build`** — TypeScript 型別檢查（`vue-tsc`）與 `vite build`（host 套件 + runtime 套件）。
2. **`npm run test:prod-smoke`** — 針對正式環境套件執行 Playwright 煙霧測試（`tests/e2e/prod-smoke.spec.js`）。這能在發布前抓到開發/正式環境的一致性問題。Playwright Electron 驅動程式由 `npm install` 安裝，不需要額外下載瀏覽器。
3. **`electron-builder`** — 為目標平台打包正式環境套件。

輸出檔案存放於 `release/` 資料夾。若 prod-smoke 階段失敗，`electron-builder` 將不會被呼叫。

---

## 各平台注意事項

### macOS

須在 macOS 上建置。會分別為 Apple Silicon（arm64）與 Intel（x64）產生獨立的 `.dmg`：

```bash
npm run dist:mac
# → release/OpenPen-<version>-arm64.dmg
# → release/OpenPen-<version>-x64.dmg
```

**成品命名** — 每個 macOS `.dmg` 都帶有 `-arm64` 或 `-x64` 後綴
（透過 `package.json` 中的 `mac.artifactName` 設定）；預設值會在 x64 版本省略後綴，
導致 Apple Silicon 使用者意外下載到 Intel 版本。

**首次啟動（臨時簽署的建置版本）** — macOS Gatekeeper 會在首次執行時封鎖應用程式。
請對 `.app` 按右鍵 → **打開**，然後確認。或在終端機中移除隔離旗標：

```bash
xattr -cr /Applications/OpenPen.app
```

**程式碼簽署（用於公開發布）** — 若要產生正確簽署並經過公證的建置版本，請設定以下環境變數：

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your_password
export APPLE_ID=your@apple.id
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX
npm run dist:mac
```

> **強化執行期 + 授權設定**：Apple 公證需要 `hardenedRuntime: true`。若沒有真實的 Developer ID，臨時簽署的子套件（Electron Framework、Helper 應用程式）會有不一致的 team ID，macOS 的跨團隊函式庫驗證會拒絕啟動 .app，並顯示「cannot be opened because a problem occurred」。`build/entitlements.mac.plist` 包含 `com.apple.security.cs.disable-library-validation`，讓臨時的本機建置仍可啟動。真實 Developer ID 發布版本的子套件共享相同的 team ID，不依賴此授權設定，但保留它也無妨。

---

### Windows

**必須在 Windows 機器上執行**（或透過 CI）。會為 x64 與 arm64 產生標準的 NSIS 安裝程式。

```bash
npm run dist:win
# → release/OpenPen Setup <version>.exe
```

**程式碼簽署** — Windows SmartScreen 會對未簽署的 `.exe` 檔案發出警告。若要使用 EV 憑證簽署：

```bash
set CSC_LINK=C:\path\to\certificate.pfx
set CSC_KEY_PASSWORD=your_password
npm run dist:win
```

---

### Linux

產生可攜式的 `.AppImage`，無需安裝即可在大多數 x86_64 與 arm64 發行版上執行。

```bash
npm run dist:linux
# → release/OpenPen-<version>.AppImage
# → release/OpenPen-<version>-arm64.AppImage
```

賦予 AppImage 執行權限後直接執行：

```bash
chmod +x OpenPen-*.AppImage
./OpenPen-*.AppImage
```

---

## 從 macOS 進行跨平台建置

electron-builder 可以從 macOS 主機建置 Windows 與 Linux 安裝程式，但有部分限制：

| 目標 | 從 macOS | 備注 |
|--------|-----------|-------|
| macOS `.dmg` | ✅ 原生 | |
| Linux `.AppImage` | ✅ 可用 | 需要 Docker 或本機建置工具 |
| Windows `.exe` | ⚠️ 部分支援 | 簽署需要 Windows 或憑證服務 |

若要可靠地進行多平台發布，建議使用能在三種作業系統上分別執行任務的 CI 服務。
