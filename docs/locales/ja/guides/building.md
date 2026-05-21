---
title: ソースから OpenPen をビルドする
description: ソースツリーから macOS、Windows、Linux 向けの配布可能な OpenPen パッケージを作成します。
translationType: machine
translatedFrom: 8e4d741
translatedAt: 2026-05-22T00:00:00Z
language: ja
---

# ソースから OpenPen をビルドする

このガイドでは、macOS、Windows、Linux 向けの配布可能なパッケージを作成する方法について説明します。

## 前提条件

- Node.js 20 以上、npm 9 以上
- Git

```bash
git clone https://github.com/openpen-platform/openpen
cd openpen
npm install
```

---

## ビルドコマンド

| コマンド | 出力 |
|---------|--------|
| `npm run dist:mac` | macOS `.dmg` (arm64 + x64) |
| `npm run dist:win` | Windows NSIS インストーラー `.exe` (x64 + arm64) |
| `npm run dist:linux` | Linux `.AppImage` (x64 + arm64) |
| `npm run dist` | 現在のプラットフォーム (自動検出) |

すべての `dist*` コマンドは、以下の 3 つのステージを順番に実行します。

1. **`npm run build`** — TypeScript の型チェック (`vue-tsc`) および `vite build` (ホストバンドル + ランタイムバンドル)。
2. **`npm run test:prod-smoke`** — 本番バンドルに対して Playwright スモークテストを実行します (`tests/e2e/prod-smoke.spec.js`)。これにより、リリース前に開発・本番間のパリティに関するリグレッションを検出できます。Playwright の Electron ドライバーは `npm install` でインストールされるため、追加のブラウザーダウンロードは不要です。
3. **`electron-builder`** — 本番バンドルをターゲットプラットフォーム向けにパッケージ化します。

出力ファイルは `release/` ディレクトリに配置されます。prod-smoke ステージが失敗した場合、`electron-builder` は実行されません。

---

## プラットフォーム別の注意事項

### macOS

ビルドには macOS が必要です。Apple Silicon (arm64) と Intel (x64) それぞれに別の `.dmg` が生成されます。

```bash
npm run dist:mac
# → release/OpenPen-<version>-arm64.dmg
# → release/OpenPen-<version>-x64.dmg
```

**アーティファクトの命名** — すべての macOS `.dmg` には `-arm64` または `-x64` のサフィックスが付きます (`package.json` の `mac.artifactName` で設定)。デフォルトでは x64 のサフィックスが省略され、Apple Silicon ユーザーが誤って Intel ビルドに誘導されてしまいます。

**初回起動 (アドホック署名ビルド)** — macOS Gatekeeper は初回実行時にアプリをブロックします。`.app` を右クリックして「**開く**」を選択し、確認してください。または、ターミナルから隔離フラグを削除できます。

```bash
xattr -cr /Applications/OpenPen.app
```

**コード署名 (公開配布用)** — 適切に署名・公証されたビルドを作成するには、以下の環境変数を設定してください。

```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=your_password
export APPLE_ID=your@apple.id
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX
npm run dist:mac
```

> **Hardened Runtime + エンタイトルメント**: Apple の公証には `hardenedRuntime: true` が必要です。正規の Developer ID がない場合、アドホック署名されたサブバンドル (Electron Framework、ヘルパーアプリ) のチーム ID が一致せず、macOS のクロスチームライブラリ検証によってアプリの起動が「問題が発生したため開けません」と拒否されます。`build/entitlements.mac.plist` に `com.apple.security.cs.disable-library-validation` を含めることで、アドホックのローカルビルドでも起動できるようになります。正規の Developer ID リリースではサブバンドル間でチーム ID が統一されるためこのエンタイトルメントに依存しませんが、残しておいても問題ありません。

---

### Windows

**Windows マシン** (または CI) で実行する必要があります。x64 および arm64 向けの標準的な NSIS インストーラーが生成されます。

```bash
npm run dist:win
# → release/OpenPen Setup <version>.exe
```

**コード署名** — 署名されていない `.exe` ファイルには Windows SmartScreen の警告が表示されます。EV 証明書で署名するには、以下の手順を実行してください。

```bash
set CSC_LINK=C:\path\to\certificate.pfx
set CSC_KEY_PASSWORD=your_password
npm run dist:win
```

---

### Linux

インストール不要で、ほとんどの x86_64 および arm64 ディストリビューション上で動作するポータブルな `.AppImage` が生成されます。

```bash
npm run dist:linux
# → release/OpenPen-<version>.AppImage
# → release/OpenPen-<version>-arm64.AppImage
```

AppImage に実行権限を付与して直接実行できます。

```bash
chmod +x OpenPen-*.AppImage
./OpenPen-*.AppImage
```

---

## macOS からのクロスプラットフォームビルド

electron-builder は macOS ホストから Windows および Linux のインストーラーをビルドできますが、いくつかの制限があります。

| ターゲット | macOS から | 備考 |
|--------|-----------|-------|
| macOS `.dmg` | ✅ ネイティブ | |
| Linux `.AppImage` | ✅ 動作 | Docker またはローカルビルドツールが必要 |
| Windows `.exe` | ⚠️ 一部対応 | 署名には Windows または証明書サービスが必要 |

信頼性の高いマルチプラットフォームリリースには、3 つの OS すべてでジョブを実行する CI サービスを使用してください。
